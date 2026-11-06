// src/lib/whatsapp/leituraServidor.ts — leitura da tela Conversas (SÓ SERVIDOR)
//
// Regra de acesso (Fase 4): quem decide o que cada um vê é o RLS do banco.
// Por isso wa_conversas e wa_mensagens são lidas com o cliente da SESSÃO do
// usuário (cookie), nunca com a chave de serviço. A chave de serviço só entra
// depois que a sessão já provou que pode ver a linha: para assinar a URL da
// mídia (bucket sem política), gravar o log de acesso e ler a qualificação.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { consultorLogado, type ConsultorLogado } from '@/lib/fila/servidor';
import { buscarQualificacao, pisoEstoque } from '@/lib/services/qualificacaoService';
import { classificarLead, interesseGenerico } from '@/lib/qualificacao';
import { BUCKET_MIDIA } from './midia';
import {
    acaoDeAcesso, resumoMensagem,
    type Autor, type ConversaDetalhe, type ConversaItem, type MensagemView, type TipoMensagem,
} from './conversasView';
import { msgErro } from './erro';

export type ContextoWa =
    | { ok: true; sessao: SupabaseClient; admin: SupabaseClient; eu: ConsultorLogado }
    | { ok: false; status: number; erro: string };

export async function contextoWa(): Promise<ContextoWa> {
    const c = await consultorLogado();
    if (!c.ok) {
        const corpo = await c.res.json().catch(() => ({}));
        return { ok: false, status: c.res.status, erro: corpo?.error || 'sem acesso' };
    }
    const sessao = await createAuthClient();
    return { ok: true, sessao, admin: c.admin, eu: c.eu };
}

const COLUNAS_MENSAGEM =
    'id, provider_message_id, direcao, autor, tipo, texto, legenda, midia_path, midia_mime, midia_bytes, midia_nome, ' +
    'midia_erro, midia_expirada_em, duracao_s, transcricao, citada_message_id, status_entrega, editada_em, apagada_em, ' +
    'criada_em, extra';

// Linha crua do PostgREST (o projeto não tem tipos gerados do banco).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

export function paraMensagemView(r: Linha): MensagemView {
    const extra = (r.extra && typeof r.extra === 'object') ? r.extra : {};
    const analise = extra.analise_audio && typeof extra.analise_audio === 'object' ? extra.analise_audio : null;
    return {
        id: r.id,
        providerId: r.provider_message_id,
        direcao: r.direcao,
        autor: r.autor,
        tipo: r.tipo,
        texto: r.texto ?? null,
        legenda: r.legenda ?? null,
        // o caminho no bucket nunca vai para o navegador
        temMidia: Boolean(r.midia_path) && !r.midia_expirada_em,
        midiaMime: r.midia_mime ?? null,
        midiaBytes: r.midia_bytes != null ? Number(r.midia_bytes) : null,
        midiaNome: r.midia_nome ?? null,
        midiaExpirada: Boolean(r.midia_expirada_em),
        midiaErro: r.midia_erro ?? null,
        duracaoS: r.duracao_s ?? null,
        transcricao: r.transcricao ?? null,
        citadaId: r.citada_message_id ?? null,
        statusEntrega: r.status_entrega ?? null,
        editadaEm: r.editada_em ?? null,
        apagadaEm: r.apagada_em ?? null,
        criadaEm: r.criada_em,
        localizacao: extra.localizacao ?? null,
        contatos: Array.isArray(extra.contatos) ? extra.contatos : null,
        analiseAudio: analise
            ? { sentimento: analise.sentimento ?? null, objecao: analise.objecao ?? null, resumo: analise.resumo ?? null }
            : null,
    };
}

function paraConversaItem(r: Linha, extras: { selo?: ConversaItem['selo']; carro?: string | null; vendedorNome?: string | null; nomeCliente?: string | null }): ConversaItem {
    const ult = Array.isArray(r.wa_mensagens) ? r.wa_mensagens[0] : null;
    return {
        id: r.id,
        // nome que o cliente disse (Laura do CRM) vence o nome do perfil do WhatsApp
        nome: extras.nomeCliente || r.nome_contato || null,
        telefoneKey: r.telefone_key,
        leadUid: r.lead_uid ?? null,
        vendedorId: r.assigned_consultant_id ?? null,
        vendedorNome: extras.vendedorNome ?? null,
        status: r.status,
        naoLidas: r.nao_lidas_vendedor ?? 0,
        ultimaEm: r.ultima_mensagem_em ?? null,
        ultima: ult
            ? {
                autor: ult.autor as Autor,
                tipo: ult.tipo as TipoMensagem,
                resumo: resumoMensagem({
                    tipo: ult.tipo, texto: ult.texto, legenda: ult.legenda, duracaoS: ult.duracao_s,
                    midiaNome: ult.midia_nome, apagadaEm: ult.apagada_em, transcricao: ult.transcricao,
                }),
                em: ult.criada_em,
            }
            : null,
        selo: extras.selo ?? null,
        carro: extras.carro ?? null,
    };
}

/** Selo de qualificação e carro de interesse por lead (lido com a chave de serviço). */
async function enriquecerLeads(admin: SupabaseClient, uids: string[]): Promise<Map<string, { selo: ConversaItem['selo']; carro: string | null }>> {
    const out = new Map<string, { selo: ConversaItem['selo']; carro: string | null }>();
    if (!uids.length) return out;
    try {
        const [campos, piso] = await Promise.all([buscarQualificacao(admin, uids), pisoEstoque(admin).catch(() => null)]);
        for (const uid of uids) {
            const c = campos.get(uid);
            if (!c) continue;
            const carro = c.vehicle_interest && !interesseGenerico(c.vehicle_interest) ? c.vehicle_interest.trim() : null;
            out.set(uid, { selo: classificarLead(c, piso).selo, carro });
        }
    } catch (e) {
        console.warn('[wa/conversas] qualificação indisponível:', msgErro(e));
    }
    return out;
}

/**
 * Nome que o cliente informou (wa_conversas.nome_cliente, gravado pela Laura do
 * CRM). Consulta à parte e tolerante: antes da migration 20261106 a coluna não
 * existe e a tela segue com o nome do perfil do WhatsApp.
 */
async function nomesInformados(sessao: SupabaseClient, id?: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    try {
        let q = sessao.from('wa_conversas').select('id, nome_cliente').not('nome_cliente', 'is', null);
        q = id ? q.eq('id', id) : q.order('ultima_mensagem_em', { ascending: false, nullsFirst: false }).limit(1000);
        const { data, error } = await q;
        if (error) return out;
        for (const r of (data || []) as Linha[]) if (r.nome_cliente) out.set(r.id, r.nome_cliente);
    } catch { /* coluna ainda não existe */ }
    return out;
}

// O "!wa_mensagens_conversa_id_fkey" diz ao PostgREST qual caminho usar: wa_acessos_log
// também liga wa_conversas a wa_mensagens e, sem a dica, a consulta fica ambígua.
const SELECT_CONVERSA =
    'id, telefone_key, nome_contato, lead_uid, assigned_consultant_id, status, ultima_mensagem_em, nao_lidas_vendedor, ' +
    'wa_mensagens!wa_mensagens_conversa_id_fkey(autor, tipo, texto, legenda, duracao_s, midia_nome, apagada_em, transcricao, criada_em)';

export async function listarConversas(ctx: Extract<ContextoWa, { ok: true }>, opcoes: { leadUid?: string | null } = {}): Promise<ConversaItem[]> {
    let q = ctx.sessao
        .from('wa_conversas')
        .select(SELECT_CONVERSA)
        .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
        .order('criada_em', { referencedTable: 'wa_mensagens', ascending: false })
        .limit(1, { referencedTable: 'wa_mensagens' })
        .limit(300);
    if (opcoes.leadUid) q = q.eq('lead_uid', opcoes.leadUid);
    const { data, error } = await q;
    if (error) throw new Error(`conversas: ${error.message}`);
    const linhas = (data || []) as Linha[];

    const uids = [...new Set(linhas.map(r => r.lead_uid).filter(Boolean))] as string[];
    const gestao = ctx.eu.perfil === 'admin' || ctx.eu.perfil === 'gestor';
    const vendedores = new Map<string, string>();
    const idsVendedor = [...new Set(linhas.map(r => r.assigned_consultant_id).filter(Boolean))] as string[];
    const [leads, nomes] = await Promise.all([
        enriquecerLeads(ctx.admin, uids),
        nomesInformados(ctx.sessao),
        gestao && idsVendedor.length
            ? ctx.admin.from('consultants_manos_crm').select('id, name').in('id', idsVendedor)
                .then(({ data: vs }) => { for (const v of vs || []) vendedores.set(v.id, v.name); })
            : Promise.resolve(),
    ]);

    return linhas.map(r => paraConversaItem(r, {
        ...(r.lead_uid ? leads.get(r.lead_uid) : undefined),
        vendedorNome: r.assigned_consultant_id ? vendedores.get(r.assigned_consultant_id) ?? null : null,
        nomeCliente: nomes.get(r.id) ?? null,
    }));
}

const LIMITE_PAGINA = 60;

export async function detalheConversa(
    ctx: Extract<ContextoWa, { ok: true }>,
    id: string,
    opcoes: { antes?: string | null } = {},
): Promise<ConversaDetalhe | null> {
    const { data: conv, error } = await ctx.sessao.from('wa_conversas').select(SELECT_CONVERSA)
        .eq('id', id)
        .order('criada_em', { referencedTable: 'wa_mensagens', ascending: false })
        .limit(1, { referencedTable: 'wa_mensagens' })
        .maybeSingle();
    if (error) throw new Error(`conversa: ${error.message}`);
    if (!conv) return null; // não existe OU não é dele: o RLS esconde e a resposta é a mesma

    let q = ctx.sessao.from('wa_mensagens').select(COLUNAS_MENSAGEM)
        .eq('conversa_id', id)
        .order('criada_em', { ascending: false })
        .limit(LIMITE_PAGINA + 1);
    if (opcoes.antes) q = q.lt('criada_em', opcoes.antes);
    const { data: linhas, error: e2 } = await q;
    if (e2) throw new Error(`mensagens: ${e2.message}`);
    const todas = (linhas || []) as Linha[];
    const temMais = todas.length > LIMITE_PAGINA;
    const mensagens = todas.slice(0, LIMITE_PAGINA).reverse().map(paraMensagemView);

    // Citadas que não estão nesta página (ex.: resposta a mensagem antiga)
    const carregadas = new Set(mensagens.map(m => m.providerId));
    const faltam = [...new Set(mensagens.map(m => m.citadaId).filter((c): c is string => !!c && !carregadas.has(c)))];
    const citadas: ConversaDetalhe['citadas'] = {};
    if (faltam.length) {
        const { data: cs } = await ctx.sessao.from('wa_mensagens').select(COLUNAS_MENSAGEM).in('provider_message_id', faltam);
        for (const c of (cs || []) as Linha[]) {
            const v = paraMensagemView(c);
            citadas[v.providerId] = { autor: v.autor, resumo: resumoMensagem(v, 120) };
        }
    }

    const c = conv as Linha;
    const [leads, nomes] = await Promise.all([
        c.lead_uid ? enriquecerLeads(ctx.admin, [c.lead_uid]) : Promise.resolve(new Map()),
        nomesInformados(ctx.sessao, c.id),
    ]);
    let vendedorNome: string | null = null;
    if (c.assigned_consultant_id) {
        const { data: v } = await ctx.admin.from('consultants_manos_crm').select('name').eq('id', c.assigned_consultant_id).maybeSingle();
        vendedorNome = v?.name ?? null;
    }
    return {
        conversa: paraConversaItem(c, { ...(c.lead_uid ? leads.get(c.lead_uid) : undefined), vendedorNome, nomeCliente: nomes.get(c.id) ?? null }),
        mensagens,
        citadas,
        temMais,
    };
}

/**
 * Abriu a conversa: grava no log LGPD e, se quem abriu é o vendedor dono,
 * zera as não lidas. Admin/gestor olhando não zera o contador do vendedor.
 */
export async function registrarAbertura(ctx: Extract<ContextoWa, { ok: true }>, conversa: ConversaItem): Promise<void> {
    await ctx.admin.from('wa_acessos_log').insert({
        consultant_id: ctx.eu.consultorId,
        auth_uid: ctx.eu.authId,
        conversa_id: conversa.id,
        acao: 'abriu',
    });
    if (conversa.naoLidas > 0 && ctx.eu.consultorId && ctx.eu.consultorId === conversa.vendedorId) {
        await ctx.admin.from('wa_conversas').update({ nao_lidas_vendedor: 0 }).eq('id', conversa.id);
    }
}

export type ResultadoMidia =
    | { ok: true; url: string }
    | { ok: false; status: number; erro: string };

/** URL assinada de 5 min para a mídia, depois de a sessão provar que vê a mensagem. */
export async function urlDaMidia(ctx: Extract<ContextoWa, { ok: true }>, mensagemId: string, download: boolean): Promise<ResultadoMidia> {
    const { data: m, error } = await ctx.sessao.from('wa_mensagens')
        .select('id, conversa_id, tipo, midia_path, midia_nome, midia_expirada_em')
        .eq('id', mensagemId)
        .maybeSingle();
    if (error) return { ok: false, status: 500, erro: error.message };
    if (!m) return { ok: false, status: 404, erro: 'mídia não encontrada' };
    if (m.midia_expirada_em) return { ok: false, status: 410, erro: 'mídia expirada (30 dias)' };
    if (!m.midia_path) return { ok: false, status: 404, erro: 'mídia não disponível' };

    const { data: assinada, error: e2 } = await ctx.admin.storage.from(BUCKET_MIDIA)
        .createSignedUrl(m.midia_path, 300, download ? { download: m.midia_nome || true } : undefined);
    if (e2 || !assinada?.signedUrl) return { ok: false, status: 500, erro: e2?.message || 'falha ao assinar' };

    await ctx.admin.from('wa_acessos_log').insert({
        consultant_id: ctx.eu.consultorId,
        auth_uid: ctx.eu.authId,
        conversa_id: m.conversa_id,
        mensagem_id: m.id,
        acao: acaoDeAcesso(m.tipo as TipoMensagem, download),
    });
    return { ok: true, url: assinada.signedUrl };
}
