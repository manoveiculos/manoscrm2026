// src/lib/whatsapp/ia/followupRodada.ts — executa uma rodada de follow-up (SÓ SERVIDOR)
//
// Chamado por /api/cron/followup-wa. A DECISÃO de cada conversa está em followup.ts (pura);
// aqui ficam leitura do banco, texto da Laura, filtro de regras e envio.
// Travas, todas ao mesmo tempo: WA_FOLLOWUP_ATIVO=true (rota), Laura em "envia"
// (botão do admin + WA_IA_ENVIO_LIBERADO), horário da loja, teto por rodada e por dia,
// 75 s entre envios, para no primeiro erro de envio.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { revisarResposta } from '@/lib/laura/guardrails';
import { precosAnunciadosDoEstoque } from '@/lib/estoque';
import { horarioLoja, isOpenNow } from '@/lib/services/slaEngine';
import { providerLoja } from '../evolutionProvider';
import { enviarPeloCrm } from '../envio';
import { msgErro } from '../erro';
import { lerConfigIa } from './config';
import { claude, MODELO_PADRAO } from './motor';
import { LAURA_CRM_PROMPT } from './prompt';
import { custoUsd, inicioDoDiaSP, limiteDiario, somarUso, textoParaIa, type MensagemParaIa, type UsoTokens } from './regras';
import {
    ESPERA_ENTRE_ENVIOS_MS, LIMITE_DIA_PADRAO, MAX_DIAS_DESDE_ANCORA, MAX_POR_RODADA,
    ancoraDoSilencio, dataDeCorte, decidirFollowup, instrucaoDoToque, type MsgFollowup,
} from './followup';

export interface ResumoFollowup {
    ok: boolean;
    modo: string;
    motivo?: string;
    candidatas: number;
    enviados: number;
    rascunhos: number;
    puladas: Record<string, number>;
    erros: number;
}

const FECHADOS = new Set(['vendido', 'post_sale', 'comprado', 'perdido', 'arquivado', 'lost', 'lost_by_inactivity', 'frio']);

async function leadFechado(supabase: SupabaseClient, leadUid: string | null): Promise<boolean> {
    if (!leadUid) return false;
    const i = leadUid.indexOf(':');
    if (i <= 0 || leadUid.slice(0, i) !== 'leads_distribuicao_crm_26') return false;
    const { data } = await supabase.from('leads_distribuicao_crm_26').select('status, archived_at').eq('id', parseInt(leadUid.slice(i + 1), 10)).maybeSingle();
    if (!data) return false;
    return Boolean(data.archived_at) || FECHADOS.has(String(data.status || '').toLowerCase().trim());
}

async function temVisita(supabase: SupabaseClient, leadUid: string | null, agora: Date): Promise<boolean> {
    if (!leadUid) return false;
    const { data } = await supabase.from('agendamentos').select('id').eq('lead_uid', leadUid).eq('status', 'agendado').gt('data_hora', agora.toISOString()).limit(1);
    return Boolean(data?.length);
}

export async function rodarFollowups(supabase: SupabaseClient, opts: { agora?: Date; esperar?: (ms: number) => Promise<void> } = {}): Promise<ResumoFollowup> {
    const agora = opts.agora ?? new Date();
    const esperar = opts.esperar ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const resumo: ResumoFollowup = { ok: true, modo: 'desligada', candidatas: 0, enviados: 0, rascunhos: 0, puladas: {}, erros: 0 };
    const pular = (m: string) => { resumo.puladas[m] = (resumo.puladas[m] || 0) + 1; };

    const cfg = await lerConfigIa(supabase);
    resumo.modo = cfg.modo;
    if (cfg.modo === 'desligada') return { ...resumo, motivo: cfg.motivo || 'Laura desligada' };

    const horario = await horarioLoja(supabase);
    if (!isOpenNow(agora, horario.horas, horario.feriados)) return { ...resumo, motivo: 'fora do horário da loja' };

    // teto diário
    const dia = inicioDoDiaSP(agora).toISOString();
    const { count: hoje } = await supabase.from('wa_followups').select('id', { count: 'exact', head: true }).eq('status', 'enviado').gte('criado_em', dia);
    const teto = limiteDiario(process.env.WA_FOLLOWUP_LIMITE_DIA, LIMITE_DIA_PADRAO);
    let restanteDia = teto - (hoje ?? 0);
    if (cfg.modo === 'envia' && restanteDia <= 0) return { ...resumo, motivo: `teto do dia atingido (${teto})` };

    const cliente = claude();
    if (!cliente) return { ...resumo, ok: false, motivo: 'sem chave do Claude' };
    const modelo = (process.env.WA_IA_MODELO || MODELO_PADRAO).trim();

    const desde = new Date(agora.getTime() - MAX_DIAS_DESDE_ANCORA * 86_400_000).toISOString();
    const ate = new Date(agora.getTime() - 20 * 3_600_000).toISOString();
    const { data: convs } = await supabase.from('wa_conversas')
        .select('id, telefone_key, remote_jid, nome_cliente, nome_contato, lead_uid, ficha, status, ia_silenciada_ate, ultima_mensagem_em')
        .eq('status', 'ia').gte('ultima_mensagem_em', desde).lte('ultima_mensagem_em', ate)
        .order('ultima_mensagem_em', { ascending: true }).limit(200);
    resumo.candidatas = convs?.length ?? 0;

    let enviouNaRodada = 0;
    for (const c of convs || []) {
        if (enviouNaRodada >= MAX_POR_RODADA || (cfg.modo === 'envia' && restanteDia <= 0)) break;

        const { data: linhas } = await supabase.from('wa_mensagens')
            .select('autor, tipo, texto, legenda, transcricao, midia_nome, apagada_em, criada_em')
            .eq('conversa_id', c.id).order('criada_em', { ascending: false }).limit(60);
        const paraIa: MensagemParaIa[] = (linhas || []).map(m => ({
            autor: m.autor, tipo: m.tipo, texto: m.texto, legenda: m.legenda, transcricao: m.transcricao,
            midiaNome: m.midia_nome, apagadaEm: m.apagada_em, criadaEm: m.criada_em,
        }));
        const msgs: MsgFollowup[] = (linhas || []).filter(m => !m.apagada_em).map(m => ({ autor: m.autor, texto: m.texto || m.legenda, transcricao: m.transcricao, criadaEm: m.criada_em }));
        const ancora = ancoraDoSilencio(msgs);
        if (!ancora) { pular('cliente aguardando resposta ou sem histórico'); continue; }

        const { data: fu } = await supabase.from('wa_followups').select('etapa, status, criado_em').eq('conversa_id', c.id).gt('criado_em', ancora);
        const enviados = (fu || []).filter(f => f.status === 'enviado').map(f => f.criado_em as string);
        const rascunhos = new Set((fu || []).filter(f => f.status === 'rascunho').map(f => f.etapa as number));

        const d = decidirFollowup({
            status: c.status, iaSilenciadaAte: c.ia_silenciada_ate, msgs, enviadosDepoisDaAncora: enviados,
            rascunhoDaEtapaExiste: (e) => rascunhos.has(e),
            leadFechado: await leadFechado(supabase, c.lead_uid), temVisitaMarcada: await temVisita(supabase, c.lead_uid, agora),
            lojaAberta: true, agora, corte: dataDeCorte(process.env.WA_FOLLOWUP_DESDE),
        });
        if (d.acao === 'pular') { pular(d.motivo); continue; }

        try {
            // texto da Laura
            const transcricao = paraIa.slice().sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)).slice(-25)
                .map(m => { const t = textoParaIa(m); return t ? `${m.autor === 'cliente' ? 'Cliente' : 'Loja'}: ${t}` : null; }).filter(Boolean).join('\n');
            const ficha = (c.ficha && typeof c.ficha === 'object') ? c.ficha as Record<string, unknown> : {};
            const nome = (c.nome_cliente as string | null) || null;
            const carro = typeof ficha.carro_interesse === 'string' ? ficha.carro_interesse : null;
            const instrucao = instrucaoDoToque({ etapa: d.etapa, nome, carro, contexto: `Conversa até agora:\n${transcricao}` });
            const resp = await cliente.messages.create({
                model: modelo,
                max_tokens: 2048,
                system: [{ type: 'text', text: LAURA_CRM_PROMPT, cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content: instrucao }],
                output_config: { effort: 'low' },
            });
            const uso: UsoTokens = somarUso({ input_tokens: 0, output_tokens: 0 }, resp.usage);
            const bruto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').replace(/<\/?[a-z_]+>/g, '').trim();
            if (!bruto) { await supabase.from('wa_followups').insert({ conversa_id: c.id, etapa: d.etapa, status: 'erro', motivo: 'resposta vazia' }); resumo.erros++; continue; }
            const rev = revisarResposta(bruto, await precosAnunciadosDoEstoque(), [], { fraseDeCredito: false });
            if (rev.violacoes.length) {
                await supabase.from('wa_followups').insert({ conversa_id: c.id, etapa: d.etapa, status: 'erro', texto: bruto, motivo: `barrada pelo filtro: ${rev.violacoes.join(', ')}` });
                resumo.erros++; continue;
            }
            const texto = rev.texto_seguro;
            const custo = custoUsd(uso);

            if (cfg.modo === 'ensaio') {
                await supabase.from('wa_followups').insert({ conversa_id: c.id, etapa: d.etapa, status: 'rascunho', texto, custo_usd: custo });
                resumo.rascunhos++;
                continue;
            }

            // Releitura antes de enviar: o cliente pode ter respondido ou um vendedor assumido.
            const { data: atual } = await supabase.from('wa_conversas').select('status').eq('id', c.id).maybeSingle();
            const { data: ult } = await supabase.from('wa_mensagens').select('autor, criada_em').eq('conversa_id', c.id).order('criada_em', { ascending: false }).limit(1).maybeSingle();
            if (atual?.status !== 'ia' || !ult || ult.autor === 'cliente') { pular('mudou durante a geração'); continue; }

            if (enviouNaRodada > 0) await esperar(ESPERA_ENTRE_ENVIOS_MS);
            const r = await enviarPeloCrm(supabase, providerLoja(), { id: c.id, telefone_key: c.telefone_key, remote_jid: c.remote_jid }, { tipo: 'texto', texto }, { autor: 'laura' });
            if (!r.ok) {
                await supabase.from('wa_followups').insert({ conversa_id: c.id, etapa: d.etapa, status: 'erro', texto, motivo: `envio falhou: ${r.erro || 'sem detalhe'}` });
                resumo.erros++;
                break; // disjuntor: para a rodada no primeiro erro de envio
            }
            await supabase.from('wa_followups').insert({ conversa_id: c.id, etapa: d.etapa, status: 'enviado', texto, custo_usd: custo });
            resumo.enviados++; enviouNaRodada++; restanteDia--;
        } catch (e) {
            await supabase.from('wa_followups').insert({ conversa_id: c.id, etapa: d.etapa, status: 'erro', motivo: msgErro(e).slice(0, 300) });
            resumo.erros++;
        }
    }
    return resumo;
}
