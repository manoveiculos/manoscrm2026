// src/lib/whatsapp/ia/triagemRodada.ts — triagem da Laura nos leads de anúncio (SÓ SERVIDOR)
//
// rodarTriagem(): chamado por /api/cron/wa-triagem (a cada 2 min). Para cada lead preso em
// 'triagem_laura': a Laura manda a primeira mensagem, ou o lead é liberado para a roleta.
// liberarDaTriagem(): usado também pelo motor da Laura quando ela passa o cliente ao consultor.
// Regra de ouro: falha libera o lead (nunca deixa preso).

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { revisarResposta } from '@/lib/laura/guardrails';
import { precosAnunciadosDoEstoque } from '@/lib/estoque';
import { normalizarTelefoneBR } from '@/lib/telefone';
import { providerLoja } from '../evolutionProvider';
import { enviarPeloCrm } from '../envio';
import { msgErro } from '../erro';
import { lerConfigIa } from './config';
import { classificarConversa } from './classificadorRodada';
import { claude, MODELO_PADRAO } from './motor';
import { LAURA_CRM_PROMPT } from './prompt';
import { custoUsd, somarUso, type UsoTokens } from './regras';
import { registrarCustoIa } from './custos';
import {
    ESPERA_ENTRE_CONTATOS_MS, MAX_CONTATOS_POR_RODADA, decidirTriagem, instrucaoPrimeiroContato, interesseUtil,
    resumoParaConsultor, type MotivoLiberacao,
} from './triagem';

export interface ResumoTriagem {
    ok: boolean;
    motivo?: string;
    presos: number;
    contatados: number;
    liberados: Record<string, number>;
    esperando: number;
    erros: number;
}

const TABELA = 'leads_distribuicao_crm_26';
const idDoUid = (uid: string) => { const i = uid.indexOf(':'); return i > 0 && uid.slice(0, i) === TABELA ? parseInt(uid.slice(i + 1), 10) : null; };

/**
 * Solta o lead para a roleta (status 'aguardando': o motor distribui e avisa o consultor) e grava o
 * resumo no topo da ficha. Devolve false se ele já tinha sido liberado (nada a fazer).
 */
export async function liberarDaTriagem(
    supabase: SupabaseClient, leadUid: string, motivo: MotivoLiberacao,
    info: { resumoDaLaura?: string | null; nome?: string | null; interesse?: string | null; contatado?: boolean; respondeu?: boolean; agora?: Date } = {},
): Promise<boolean> {
    const agora = info.agora ?? new Date();
    // Classifica ANTES de soltar: o consultor recebe o lead já com o selo e a qualificação preenchida.
    // Melhor esforço e com tempo-limite: se o classificador falhar ou demorar, o lead sai do mesmo jeito.
    try {
        const { data: conv } = await supabase.from('wa_conversas').select('id').eq('lead_uid', leadUid).limit(1).maybeSingle();
        if (conv?.id) await Promise.race([classificarConversa(supabase, conv.id as string, { agora }), new Promise(r => setTimeout(r, 25_000))]);
    } catch { /* segue sem classificar */ }
    const { data: lib } = await supabase.from('lead_distribuicao')
        .update({ status: 'aguardando', atualizado_em: agora.toISOString() })
        .eq('lead_uid', leadUid).eq('status', 'triagem_laura').select('lead_uid');
    if (!lib?.length) return false;

    const resumo = resumoParaConsultor({
        motivo, quando: agora, nome: info.nome ?? null, interesse: info.interesse ?? null, resumoDaLaura: info.resumoDaLaura ?? null,
        contatado: Boolean(info.contatado), respondeu: Boolean(info.respondeu),
    });
    await supabase.from('wa_triagem').update({ liberado_em: agora.toISOString(), motivo, resumo }).eq('lead_uid', leadUid);
    const id = idDoUid(leadUid);
    if (id) {
        const { data: l } = await supabase.from(TABELA).select('handoff_summary').eq('id', id).maybeSingle();
        const antes = (l?.handoff_summary as string | null) || '';
        await supabase.from(TABELA).update({ handoff_summary: `${resumo}${antes ? `\n\n${antes}` : ''}`.slice(0, 2000), handoff_at: agora.toISOString() }).eq('id', id);
    }
    return true;
}

export async function rodarTriagem(supabase: SupabaseClient, opts: { agora?: Date; esperar?: (ms: number) => Promise<void> } = {}): Promise<ResumoTriagem> {
    const agora = opts.agora ?? new Date();
    const esperar = opts.esperar ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const r: ResumoTriagem = { ok: true, presos: 0, contatados: 0, liberados: {}, esperando: 0, erros: 0 };
    const liberou = (m: string) => { r.liberados[m] = (r.liberados[m] || 0) + 1; };

    const { data: conf, error: eConf } = await supabase.from('wa_ia_config').select('triagem_google, triagem_whatsapp').eq('id', 1).maybeSingle();
    if (eConf) return { ...r, ok: false, motivo: eConf.message };
    const chaves: Record<string, boolean> = { google: Boolean(conf?.triagem_google), whatsapp: Boolean(conf?.triagem_whatsapp) };

    const { data: presos } = await supabase.from('lead_distribuicao').select('lead_uid, criado_em').eq('status', 'triagem_laura').order('criado_em', { ascending: true }).limit(60);
    r.presos = presos?.length ?? 0;
    if (!r.presos) return r;

    const cfg = await lerConfigIa(supabase);
    const cliente = claude();
    const lauraPodeEnviar = cfg.modo === 'envia' && Boolean(cliente);
    const modelo = (process.env.WA_IA_MODELO || MODELO_PADRAO).trim();

    let contatos = 0;
    for (const p of presos || []) {
        const id = idDoUid(p.lead_uid);
        if (!id) { await liberarDaTriagem(supabase, p.lead_uid, 'telefone_invalido', { agora }); liberou('telefone_invalido'); continue; }
        try {
            const { data: lead } = await supabase.from(TABELA).select('nome, telefone, interesse, vehicle_interest, cidade, origem').eq('id', id).maybeSingle();
            const chaveLigada = Boolean(chaves[String((lead?.origem as string | null) || '').toLowerCase()]);
            const telefone = normalizarTelefoneBR(lead?.telefone as string | null);
            const interesse = interesseUtil((lead?.vehicle_interest as string | null) || (lead?.interesse as string | null));
            const nome = (lead?.nome as string | null) ?? null;

            let { data: tri } = await supabase.from('wa_triagem').select('contato_em, conversa_id').eq('lead_uid', p.lead_uid).maybeSingle();
            if (!tri) { await supabase.from('wa_triagem').insert({ lead_uid: p.lead_uid }); tri = { contato_em: null, conversa_id: null }; }

            // conversa deste telefone (se o lead já tinha falado com a loja, a Laura normal já cuida)
            let conversaId = (tri.conversa_id as string | null) ?? null;
            let contatoEm = (tri.contato_em as string | null) ?? null;
            let ultimaDoCliente: string | null = null;
            let lauraRespondeuDepois = false;
            let humanoAssumiu = false;
            let clienteIniciou = false;
            if (telefone) {
                const { data: chave } = await supabase.rpc('wa_telefone_key', { p_telefone: telefone });
                if (chave) {
                    const { data: conv } = await supabase.from('wa_conversas').select('id, status').eq('telefone_key', chave as string).maybeSingle();
                    if (conv) { conversaId = conv.id as string; humanoAssumiu = conv.status === 'humano'; }
                }
            }
            if (conversaId) {
                const { data: ms } = await supabase.from('wa_mensagens').select('autor, criada_em').eq('conversa_id', conversaId).order('criada_em', { ascending: false }).limit(30);
                const lista = ms || [];
                // 1ª mensagem da LOJA (Laura ou consultor): o contato. Mensagem do cliente não conta como contato.
                if (!contatoEm) contatoEm = [...lista].reverse().find(m => m.autor === 'laura' || m.autor === 'vendedor')?.criada_em ?? null;
                const clientes = lista.filter(m => m.autor === 'cliente');
                clienteIniciou = clientes.length > 0 && (!contatoEm || clientes[clientes.length - 1].criada_em < contatoEm || clientes.some(m => m.criada_em < (contatoEm as string)));
                const uc = clientes[0]; // a mais recente (a lista vem do mais novo para o mais antigo)
                ultimaDoCliente = uc && (!contatoEm || uc.criada_em > contatoEm) ? (uc.criada_em as string) : null;
                const ult = lista[0];
                lauraRespondeuDepois = Boolean(ult && ult.autor !== 'cliente');
            }
            const d = decidirTriagem({
                criadoEm: p.criado_em as string, contatoEm, ultimaDoClienteEm: ultimaDoCliente, lauraRespondeuDepois,
                telefoneValido: Boolean(telefone), humanoAssumiu, clienteIniciou, chaveLigada, lauraPodeEnviar, agora,
            });

            if (d.acao === 'liberar') {
                if (await liberarDaTriagem(supabase, p.lead_uid, d.motivo, { nome, interesse, contatado: Boolean(contatoEm), respondeu: Boolean(ultimaDoCliente), agora })) liberou(d.motivo);
                continue;
            }
            if (d.acao === 'esperar') { r.esperando++; continue; }
            // só o lead de anúncio (Google) recebe o primeiro contato da Laura; conversa do WhatsApp quem puxou foi o cliente
            if (String((lead?.origem as string | null) || '').toLowerCase() !== 'google') { r.esperando++; continue; }
            if (contatos >= MAX_CONTATOS_POR_RODADA || !telefone || !cliente) { r.esperando++; continue; }

            // ── primeiro contato ──
            const resp = await cliente.messages.create({
                model: modelo, max_tokens: 2048,
                system: [{ type: 'text', text: LAURA_CRM_PROMPT, cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content: instrucaoPrimeiroContato({ nome, interesse, cidade: (lead?.cidade as string | null) ?? null }) }],
                output_config: { effort: 'low' },
            });
            const uso: UsoTokens = somarUso({ input_tokens: 0, output_tokens: 0 }, resp.usage);
            const bruto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').replace(/<\/?[a-z_]+>/g, '').trim();
            const rev = bruto ? revisarResposta(bruto, await precosAnunciadosDoEstoque(), [], { fraseDeCredito: false }) : null;
            if (!rev || rev.violacoes.length) {
                console.warn('[triagem] mensagem barrada ou vazia:', p.lead_uid, rev?.violacoes.join(',') || 'vazia');
                r.erros++; r.esperando++; continue;   // tenta de novo na próxima rodada; o tempo-limite libera se não sair
            }
            if (contatos > 0) await esperar(ESPERA_ENTRE_CONTATOS_MS);
            const env = await enviarPeloCrm(supabase, providerLoja(), { id: conversaId ?? '', telefone_key: telefone, remote_jid: null }, { tipo: 'texto', texto: rev.texto_seguro }, { autor: 'laura' });
            if (!env.ok) { console.warn('[triagem] envio falhou:', p.lead_uid, env.erro); r.erros++; break; } // disjuntor: para a rodada
            contatos++; r.contatados++;
            const { data: chave2 } = await supabase.rpc('wa_telefone_key', { p_telefone: telefone });
            const { data: conv2 } = chave2 ? await supabase.from('wa_conversas').select('id').eq('telefone_key', chave2 as string).maybeSingle() : { data: null };
            await supabase.from('wa_triagem').update({ contato_em: agora.toISOString(), conversa_id: (conv2?.id as string | undefined) ?? conversaId }).eq('lead_uid', p.lead_uid);
            await registrarCustoIa(supabase, { agente: 'triagem', custoUsd: custoUsd(uso), modelo, uso, conversaId: (conv2?.id as string | undefined) ?? conversaId, leadRef: p.lead_uid });
            console.info('[triagem] primeiro contato enviado', p.lead_uid, `US$ ${custoUsd(uso).toFixed(4)}`);
        } catch (e) {
            r.erros++;
            console.warn('[triagem]', p.lead_uid, msgErro(e));
        }
    }
    return r;
}
