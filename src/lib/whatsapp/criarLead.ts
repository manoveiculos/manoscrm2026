// src/lib/whatsapp/criarLead.ts — o CRM cria o lead na 1ª mensagem (SÓ SERVIDOR)
//
// Decisão do Alexandre (11/11/2026): o n8n sai do atendimento; o CRM faz tudo que ele
// fazia na conversa. Aqui: conversa sem lead → procura pelo telefone → se não existe,
// cria em leads_distribuicao_crm_26 → a roleta distribui (e avisa o consultor) → liga
// wa_conversas.lead_uid. Cliente que volta só "sobe" o lead parado, sem reabrir venda.
//
// LIGADO só com WA_CRIAR_LEAD=true (padrão desligado): hoje o n8n ainda cria lead pela
// rota /api/webhook/whatsapp, e as duas coisas juntas não devem rodar sem decisão.
// Idempotente: o índice único de telefone + find_lead_by_phone (últimos 8 dígitos)
// impedem duplicar mesmo com o n8n criando ao mesmo tempo.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/admin';
import { distribuirLead } from '@/lib/services/slaEngine';
import { extrairOrigemWhatsApp, registrarOrigemLead } from '@/lib/services/leadOrigin';
import { msgErro } from './erro';

export type TipoContato = 'cliente' | 'fornecedor' | 'emprego' | 'vender_carro';

const norm = (s: string | null | undefined) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const REGRAS: { tipo: Exclude<TipoContato, 'cliente'>; rx: RegExp }[] = [
    // quer VENDER o carro dele (não comprar): vai para a fila de compra, não para a de venda
    { tipo: 'vender_carro', rx: /\b(quero|gostaria de|queria|pretendo|vim|estou querendo|to querendo)\s+(de\s+)?(vender|negociar)\s+(o\s+|um\s+|uma\s+|meu\s+|minha\s+)?(carro|moto|veiculo|caminhonete|camionete)/ },
    { tipo: 'vender_carro', rx: /\b(voces|vcs|a loja)\s+(compram|compra|pagam|avaliam)\s+(carro|moto|veiculo)/ },
    { tipo: 'vender_carro', rx: /\bvendo\s+(meu|minha|um|uma)\s+(carro|moto|veiculo|caminhonete)/ },
    { tipo: 'vender_carro', rx: /\bavaliacao\s+(do|de)\s+(meu|minha)\s+(carro|moto|veiculo)/ },
    // vaga de emprego / currículo
    { tipo: 'emprego', rx: /\b(vaga|vagas|curriculo|emprego|trabalhar (com|na|ai|ai na)|oportunidade de trabalho|processo seletivo|estagio|jovem aprendiz)\b/ },
    // fornecedor / venda de serviço para a loja
    { tipo: 'fornecedor', rx: /\b(apresentar|apresentacao)\s+(meu|minha|nosso|nossa)?\s*(trabalho|servico|empresa|produto|proposta|portfolio)/ },
    { tipo: 'fornecedor', rx: /\b(represento|represento a|somos uma empresa|sou fornecedor|ofereco (servicos?|produtos?)|prestamos servicos?|gostaria de oferecer|proposta comercial)\b/ },
    { tipo: 'fornecedor', rx: /\b(chapeacao|pintura automotiva|estetica automotiva|polimento|auto ?pecas|despachante|seguro auto|rastreador)\b.*\b(oferec|parceria|trabalho|servico|orcamento para voces)/ },
];

/** Primeiras mensagens do cliente → que tipo de contato é. Na dúvida, é cliente (não perde venda). */
export function classificarContato(textos: (string | null | undefined)[]): { tipo: TipoContato; trecho: string | null } {
    const todo = norm(textos.filter(Boolean).join(' \n ')).slice(0, 800);
    for (const r of REGRAS) {
        if (r.rx.test(todo)) return { tipo: r.tipo, trecho: todo.slice(0, 160) };
    }
    return { tipo: 'cliente', trecho: null };
}

const STATUS_FINAL = ['vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'frio', 'post_sale'];

export type ResultadoLead =
    | { acao: 'ja_tinha'; leadUid: string; subiu: boolean }
    | { acao: 'vinculado'; leadUid: string | null }
    | { acao: 'criado'; leadUid: string; distribuicao: string | null }
    | { acao: 'outra_fila'; tipo: Exclude<TipoContato, 'cliente'> }
    | { acao: 'ignorado'; motivo: string };

export interface DepsLead {
    distribuir?: (tabela: 'leads_distribuicao_crm_26', id: string) => Promise<{ status: string }>;
}

export function criarLeadLigado(): boolean {
    return (process.env.WA_CRIAR_LEAD || '').trim().toLowerCase() === 'true';
}

/** Nome aceitável para o lead novo: o do perfil do WhatsApp, ou o genérico (a correção vem depois). */
function nomeInicial(nomeContato: string | null | undefined): string {
    const n = (nomeContato || '').trim();
    return n && /\p{L}{2}/u.test(n) && !/\d{6,}/.test(n) ? n.slice(0, 80) : 'Lead WhatsApp';
}

async function vincular(admin: SupabaseClient, conversaId: string): Promise<string | null> {
    await admin.rpc('wa_vincular_lead', { p_conversa: conversaId });
    const { data } = await admin.from('wa_conversas').select('lead_uid').eq('id', conversaId).maybeSingle();
    return (data?.lead_uid as string | null) ?? null;
}

async function acharPorTelefone(admin: SupabaseClient, telefone: string): Promise<{ tabela: string; id: string } | null> {
    const { data } = await admin.rpc('find_lead_by_phone', { p_phone: telefone }).maybeSingle();
    const r = data as { table_name?: string; native_id?: string } | null;
    return r?.table_name && r.native_id ? { tabela: r.table_name, id: String(r.native_id) } : null;
}

/** Sobe o lead parado (atualizado_em) sem reabrir venda: lead final ou arquivado não é tocado. */
async function subirLeadParado(admin: SupabaseClient, leadUid: string): Promise<boolean> {
    const i = leadUid.indexOf(':');
    const tabela = leadUid.slice(0, i), id = leadUid.slice(i + 1);
    if (tabela !== 'leads_distribuicao_crm_26' || !/^\d+$/.test(id)) return false;
    const { data } = await admin.from(tabela).select('status, archived_at').eq('id', Number(id)).maybeSingle();
    if (!data || data.archived_at || STATUS_FINAL.includes(String(data.status || '').toLowerCase())) return false;
    const { error } = await admin.from(tabela).update({ atualizado_em: new Date().toISOString() }).eq('id', Number(id));
    return !error;
}

/**
 * Garante o lead de uma conversa. Chamado para cada mensagem nova do cliente:
 * barato quando a conversa já tem lead (1 leitura + sobe o lead parado).
 */
export async function garantirLead(admin: SupabaseClient, conversaId: string, deps: DepsLead = {}): Promise<ResultadoLead> {
    const { data: conv } = await admin.from('wa_conversas')
        .select('id, telefone_key, nome_contato, lead_uid').eq('id', conversaId).maybeSingle();
    if (!conv) return { acao: 'ignorado', motivo: 'conversa não existe' };
    const telefone = String(conv.telefone_key || '');
    if (!/^\d{10,15}$/.test(telefone)) return { acao: 'ignorado', motivo: 'telefone inválido' };

    if (conv.lead_uid) {
        return { acao: 'ja_tinha', leadUid: conv.lead_uid as string, subiu: await subirLeadParado(admin, conv.lead_uid as string) };
    }

    // 1. Já existe lead com esse telefone? (n8n, formulário, anúncio…) → só liga a conversa
    const achado = await acharPorTelefone(admin, telefone);
    if (achado) {
        const uid = await vincular(admin, conversaId);
        if (uid) await subirLeadParado(admin, uid);
        return { acao: 'vinculado', leadUid: uid };
    }

    // 2. Não é cliente de compra? Não vira lead de venda.
    const { data: msgs } = await admin.from('wa_mensagens')
        .select('texto, legenda, transcricao')
        .eq('conversa_id', conversaId).eq('autor', 'cliente')
        .order('criada_em', { ascending: true }).limit(4);
    const c = classificarContato((msgs || []).map(m => m.texto || m.legenda || m.transcricao));
    if (c.tipo !== 'cliente') {
        await admin.from('webhook_errors').insert({
            source: 'wa_triagem',
            error_message: `contato classificado como ${c.tipo}: não virou lead de venda`.slice(0, 1000),
            payload: { conversa_id: conversaId, tipo: c.tipo, trecho: c.trecho },
        });
        return { acao: 'outra_fila', tipo: c.tipo };
    }

    // 3. Cria o lead (sem dono: a roleta distribui e avisa o consultor)
    let id: number | null = null;
    const { data: novo, error } = await admin.from('leads_distribuicao_crm_26')
        .insert({
            nome: nomeInicial(conv.nome_contato as string | null),
            telefone,
            status: 'received',
            origem: 'WhatsApp',
            ai_classification: 'warm',
            ai_score: 50,
            assigned_consultant_id: null,
            vendedor: null,
            primeiro_vendedor: null,
        })
        .select('id').single();
    if (error) {
        // alguém criou ao mesmo tempo (índice único de telefone): usa o que existe
        const de = await acharPorTelefone(admin, telefone);
        if (!de) throw new Error(`criar lead: ${error.message}`);
        const uid = await vincular(admin, conversaId);
        return { acao: 'vinculado', leadUid: uid };
    }
    id = novo.id as number;
    const uid = await vincular(admin, conversaId);

    let distribuicao: string | null = null;
    try {
        const r = await (deps.distribuir ?? distribuirLead)('leads_distribuicao_crm_26', String(id));
        distribuicao = r.status;
    } catch (e) {
        // sem distribuição agora: o lead fica na fila ('aguardando') e o tick do SLA resolve
        console.warn('[wa/criar-lead] distribuirLead falhou:', msgErro(e));
    }
    return { acao: 'criado', leadUid: uid ?? `leads_distribuicao_crm_26:${id}`, distribuicao };
}

/**
 * Origem do anúncio (Click-to-WhatsApp): o referral só vem na 1ª mensagem, dentro do
 * evento da Evolution (externalAdReply). Grava ctwa_clid e ID do anúncio por
 * registrar_origem_lead, que NÃO sobrescreve origem já gravada (first touch) e deixa
 * pendente se o lead ainda não existe. Não lança.
 */
export async function registrarOrigemDoPayload(payload: unknown): Promise<'registrada' | 'sem_origem' | 'erro'> {
    try {
        const o = extrairOrigemWhatsApp(payload);
        if (!o) return 'sem_origem';
        const r = await registrarOrigemLead(createClient(), o);
        if (!r.ok) {
            console.warn('[wa/origem] não registrou:', r.motivo);
            return 'erro';
        }
        return 'registrada';
    } catch (e) {
        console.warn('[wa/origem] falhou:', msgErro(e));
        return 'erro';
    }
}

/** Para cada conversa com mensagem nova do cliente. Não lança: erro vai para webhook_errors. */
export async function garantirLeadsDasConversas(conversaIds: string[]): Promise<void> {
    if (!conversaIds.length || !criarLeadLigado()) return;
    const admin = createClient();
    for (const id of [...new Set(conversaIds)]) {
        try {
            await garantirLead(admin, id);
        } catch (e) {
            try {
                await admin.from('webhook_errors').insert({
                    source: 'wa_criar_lead', error_message: msgErro(e).slice(0, 1000), payload: { conversa_id: id },
                });
            } catch { /* sem onde registrar */ }
        }
    }
}
