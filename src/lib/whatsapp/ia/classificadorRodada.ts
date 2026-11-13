// src/lib/whatsapp/ia/classificadorRodada.ts — roda o Classificador de leads (SÓ SERVIDOR)
//
// classificarConversa(): uma conversa. rodarClassificador(): lote, chamado por /api/cron/wa-classificador.
// Modo (wa_ia_config.classificador): 'desligado' não faz nada · 'ensaio' só registra o que faria ·
// 'grava' preenche os campos vazios do lead e a classe. Nunca lança: classificar não pode derrubar o atendimento.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { pisoDoEstoque } from '@/lib/estoque';
import { salvarQualificacao } from '@/lib/services/qualificacaoService';
import { msgErro } from '../erro';
import { claude, MODELO_PADRAO } from './motor';
import { custoUsd, somarUso, textoParaIa, type MensagemParaIa } from './regras';
import { registrarCustoIa } from './custos';
import {
    CLASSIFICADOR_PROMPT, lerExtracao, pedidoDoClassificador, planejarGravacao, podeGravarClasse,
    transcricaoParaClassificador, verificarExtracao, type MsgClassificador,
} from './classificador';

export type ModoClassificador = 'desligado' | 'ensaio' | 'grava';
const TABELA = 'leads_distribuicao_crm_26';

export async function modoDoClassificador(supabase: SupabaseClient): Promise<ModoClassificador> {
    try {
        const { data, error } = await supabase.from('wa_ia_config').select('classificador').eq('id', 1).maybeSingle();
        if (error) return 'desligado';
        const m = data?.classificador;
        return m === 'ensaio' || m === 'grava' ? m : 'desligado';
    } catch { return 'desligado'; }
}

export interface ResultadoClassificacao {
    ok: boolean;
    motivo?: string;
    selo?: string;
    classe?: string | null;
    gravou?: boolean;
}

export async function classificarConversa(
    supabase: SupabaseClient, conversaId: string, opts: { agora?: Date; modo?: ModoClassificador } = {},
): Promise<ResultadoClassificacao> {
    const agora = opts.agora ?? new Date();
    try {
        const modo = opts.modo ?? await modoDoClassificador(supabase);
        if (modo === 'desligado') return { ok: true, motivo: 'classificador desligado' };
        const cliente = claude();
        if (!cliente) return { ok: false, motivo: 'sem chave do Claude' };

        const { data: conv } = await supabase.from('wa_conversas').select('id, lead_uid, ficha').eq('id', conversaId).maybeSingle();
        const uid = conv?.lead_uid as string | null | undefined;
        if (!uid || !uid.startsWith(`${TABELA}:`)) return { ok: true, motivo: 'conversa sem lead de venda' };
        const leadId = parseInt(uid.slice(TABELA.length + 1), 10);
        if (!Number.isFinite(leadId)) return { ok: true, motivo: 'lead inválido' };

        const { data: lead } = await supabase.from(TABELA)
            .select('vehicle_interest, interesse, valor_investimento, carro_troca, prazo_compra, ai_classification, ai_score').eq('id', leadId).maybeSingle();
        if (!lead) return { ok: true, motivo: 'lead não encontrado' };

        const { data: linhas } = await supabase.from('wa_mensagens')
            .select('autor, tipo, texto, legenda, transcricao, midia_nome, apagada_em, criada_em')
            .eq('conversa_id', conversaId).order('criada_em', { ascending: false }).limit(80);
        const msgs: MsgClassificador[] = (linhas || []).map(m => {
            const p: MensagemParaIa = { autor: m.autor, tipo: m.tipo, texto: m.texto, legenda: m.legenda, transcricao: m.transcricao, midiaNome: m.midia_nome, apagadaEm: m.apagada_em, criadaEm: m.criada_em };
            return { autor: m.autor as string, texto: textoParaIa(p) || '', criadaEm: m.criada_em as string };
        });
        const falasDoCliente = msgs.filter(m => m.autor === 'cliente' && m.texto).map(m => m.texto);
        if (!falasDoCliente.length) return { ok: true, motivo: 'o cliente ainda não falou' };

        const atuais = {
            vehicle_interest: (lead.vehicle_interest as string | null) || (lead.interesse as string | null) || null,
            valor_investimento: lead.valor_investimento as string | null,
            carro_troca: lead.carro_troca as string | null,
            prazo_compra: lead.prazo_compra as string | null,
        };
        const modelo = (process.env.WA_CLASSIFICADOR_MODELO || process.env.WA_IA_MODELO || MODELO_PADRAO).trim();
        const resp = await cliente.messages.create({
            model: modelo, max_tokens: 2048,
            system: [{ type: 'text', text: CLASSIFICADOR_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: pedidoDoClassificador({ transcricao: transcricaoParaClassificador(msgs), formulario: atuais, ficha: (conv?.ficha as Record<string, unknown> | null) ?? null }) }],
            output_config: { effort: 'low' },
        });
        const uso = somarUso({ input_tokens: 0, output_tokens: 0 }, resp.usage);
        const custo = custoUsd(uso);
        await registrarCustoIa(supabase, { agente: 'classificador', custoUsd: custo, modelo, uso, conversaId, leadRef: uid });
        const bruto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
        const ext = lerExtracao(bruto);
        if (!ext) return { ok: false, motivo: 'resposta fora do formato' };

        const verificada = verificarExtracao(ext, falasDoCliente);
        const plano = planejarGravacao({ atuais, extracao: verificada, pisoEstoque: await pisoDoEstoque() });

        let gravouCampos: Record<string, string> = {};
        let classeGravada = false;
        if (modo === 'grava') {
            // 1) campos vazios do lead (nunca sobrescreve)
            if (Object.keys(plano.preencher).length) {
                const r = await salvarQualificacao(supabase, TABELA, String(leadId), plano.preencher);
                if (r.ok) gravouCampos = Object.fromEntries(Object.entries(plano.preencher).filter(([, v]) => v) as [string, string][]);
            }
            // 2) classe e score: só se o lead não tinha classificação "de verdade"
            if (plano.classe) {
                const { count } = await supabase.from('lead_classificacoes').select('id', { count: 'exact', head: true }).eq('lead_uid', uid).eq('classe_gravada', true);
                if (podeGravarClasse({ classe: lead.ai_classification as string | null, score: lead.ai_score as number | null, gravadoPeloClassificador: (count ?? 0) > 0 })) {
                    const { error } = await supabase.from(TABELA).update({
                        ai_classification: plano.classe, ai_score: plano.score, ai_reason: plano.resultado.motivo.slice(0, 250),
                        ai_summary: (verificada.resumo || null)?.slice(0, 400) ?? null, ai_last_run_at: agora.toISOString(),
                    }).eq('id', leadId);
                    classeGravada = !error;
                }
            }
        }

        await supabase.from('lead_classificacoes').insert({
            lead_uid: uid, conversa_id: conversaId, modo, modelo, categoria: verificada.categoria, selo: plano.selo, classe: plano.classe,
            score: plano.score, confianca: verificada.confianca, resumo: verificada.resumo, proxima_acao: verificada.proximaAcao,
            extracao: {
                carro: verificada.carro, entrada: verificada.entrada, troca: verificada.troca, prazo: verificada.prazo,
                formaPagamento: verificada.formaPagamento, sinaisPositivos: verificada.sinaisPositivos, sinaisNegativos: verificada.sinaisNegativos,
                jaPreenchidos: plano.jaPreenchidos, motivoDoSelo: plano.resultado.motivo, divergencias: plano.divergencias, seloPelaConversa: plano.seloPelaConversa,
            },
            campos_gravados: gravouCampos, classe_gravada: classeGravada, descartados: verificada.descartados, custo_usd: custo,
        });
        await supabase.from('wa_conversas').update({ classificado_em: agora.toISOString() }).eq('id', conversaId);
        return { ok: true, selo: plano.selo, classe: plano.classe, gravou: modo === 'grava' && (Object.keys(gravouCampos).length > 0 || classeGravada) };
    } catch (e) {
        console.warn('[classificador]', conversaId, msgErro(e));
        return { ok: false, motivo: msgErro(e).slice(0, 200) };
    }
}

export interface ResumoClassificador {
    ok: boolean; modo: ModoClassificador; motivo?: string; pendentes: number; classificadas: number; gravaram: number; erros: number;
    porSelo: Record<string, number>;
}

export async function rodarClassificador(supabase: SupabaseClient, opts: { agora?: Date; limite?: number; orcamentoMs?: number } = {}): Promise<ResumoClassificador> {
    const agora = opts.agora ?? new Date();
    const fim = Date.now() + (opts.orcamentoMs ?? 45_000);
    const modo = await modoDoClassificador(supabase);
    const r: ResumoClassificador = { ok: true, modo, pendentes: 0, classificadas: 0, gravaram: 0, erros: 0, porSelo: {} };
    if (modo === 'desligado') return { ...r, motivo: 'classificador desligado' };
    if ((process.env.WA_IA_ATIVA || '').trim() !== 'true') return { ...r, motivo: 'IA desligada (WA_IA_ATIVA)' };

    const desde = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
    const quieta = new Date(agora.getTime() - 15 * 60_000).toISOString();
    const { data: convs, error } = await supabase.from('wa_conversas')
        .select('id, ultima_mensagem_em, classificado_em')
        .not('lead_uid', 'is', null).neq('status', 'encerrada').gte('ultima_mensagem_em', desde).lte('ultima_mensagem_em', quieta)
        .order('ultima_mensagem_em', { ascending: false }).limit(150);
    if (error) return { ...r, ok: false, motivo: error.message };
    const pendentes = (convs || []).filter(c => !c.classificado_em || Date.parse(c.classificado_em) < Date.parse(c.ultima_mensagem_em));
    r.pendentes = pendentes.length;
    for (const c of pendentes.slice(0, opts.limite ?? 6)) {
        if (Date.now() > fim) break;
        const x = await classificarConversa(supabase, c.id as string, { agora, modo });
        if (!x.ok) { r.erros++; continue; }
        if (x.selo) { r.classificadas++; r.porSelo[x.selo] = (r.porSelo[x.selo] || 0) + 1; if (x.gravou) r.gravaram++; }
        else await supabase.from('wa_conversas').update({ classificado_em: agora.toISOString() }).eq('id', c.id); // sem o que classificar: não tenta de novo até haver mensagem nova
    }
    return r;
}
