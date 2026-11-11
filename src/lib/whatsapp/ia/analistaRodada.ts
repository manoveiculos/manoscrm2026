// src/lib/whatsapp/ia/analistaRodada.ts — roda o Analista de contexto (SÓ SERVIDOR)
//
// Chamado por /api/cron/wa-analista (a cada 15 min, pelo fifteen-min-scheduler).
// Só LÊ a conversa e grava wa_conversas.situacao: não envia nada a ninguém.
// Roda com WA_IA_ATIVA=true (a mesma chave geral da Laura). Modelo: Claude Haiku 5.5
// (WA_ANALISTA_MODELO troca). Poucas conversas por rodada para caber em ~45 s.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { msgErro } from '../erro';
import { claude } from './motor';
import { textoParaIa, type MensagemParaIa } from './regras';
import { ANALISTA_PROMPT, lerSituacao, pedidoDoAnalista, precisaAnalisar, transcricaoParaAnalista, type MsgAnalista } from './analista';

export const MODELO_ANALISTA_PADRAO = 'claude-haiku-5-5';

export interface ResumoAnalista {
    ok: boolean;
    motivo?: string;
    pendentes: number;
    analisadas: number;
    indefinidas: number;
    erros: number;
}

export async function rodarAnalista(supabase: SupabaseClient, opts: { agora?: Date; limite?: number; orcamentoMs?: number } = {}): Promise<ResumoAnalista> {
    const agora = opts.agora ?? new Date();
    const limite = opts.limite ?? 8;
    const fim = Date.now() + (opts.orcamentoMs ?? 45_000);
    const r: ResumoAnalista = { ok: true, pendentes: 0, analisadas: 0, indefinidas: 0, erros: 0 };

    if ((process.env.WA_IA_ATIVA || '').trim() !== 'true') return { ...r, motivo: 'IA desligada (WA_IA_ATIVA)' };
    const cliente = claude();
    if (!cliente) return { ...r, ok: false, motivo: 'sem chave do Claude' };
    const modelo = (process.env.WA_ANALISTA_MODELO || MODELO_ANALISTA_PADRAO).trim();

    const desde = new Date(agora.getTime() - 45 * 86_400_000).toISOString();
    const { data: convs, error } = await supabase.from('wa_conversas')
        .select('id, ultima_mensagem_em, situacao_em')
        .neq('status', 'encerrada').gte('ultima_mensagem_em', desde)
        .order('ultima_mensagem_em', { ascending: false }).limit(150);
    if (error) return { ...r, ok: false, motivo: error.message };

    const pendentes = (convs || []).filter(c => precisaAnalisar({ ultimaMensagemEm: c.ultima_mensagem_em, situacaoEm: c.situacao_em, agora }));
    r.pendentes = pendentes.length;

    for (const c of pendentes.slice(0, limite)) {
        if (Date.now() > fim) break;
        try {
            const { data: linhas } = await supabase.from('wa_mensagens')
                .select('autor, tipo, texto, legenda, transcricao, midia_nome, apagada_em, criada_em')
                .eq('conversa_id', c.id).order('criada_em', { ascending: false }).limit(60);
            const msgs: MsgAnalista[] = (linhas || []).map(m => {
                const p: MensagemParaIa = { autor: m.autor, tipo: m.tipo, texto: m.texto, legenda: m.legenda, transcricao: m.transcricao, midiaNome: m.midia_nome, apagadaEm: m.apagada_em, criadaEm: m.criada_em };
                return { autor: m.autor as string, texto: textoParaIa(p) || '', criadaEm: m.criada_em as string };
            });
            const transcricao = transcricaoParaAnalista(msgs);
            if (!transcricao) {
                await supabase.from('wa_conversas').update({ situacao_em: agora.toISOString() }).eq('id', c.id);
                continue;
            }
            const resp = await cliente.messages.create({
                model: modelo,
                max_tokens: 1024,
                system: [{ type: 'text', text: ANALISTA_PROMPT, cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content: pedidoDoAnalista(transcricao, agora) }],
                output_config: { effort: 'low' },
            });
            const bruto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
            const s = lerSituacao(bruto);
            if (s.situacao === 'indefinida') r.indefinidas++;
            const { error: e2 } = await supabase.from('wa_conversas')
                .update({ situacao: { ...s, modelo, analisadaEm: agora.toISOString() }, situacao_em: agora.toISOString() })
                .eq('id', c.id);
            if (e2) throw new Error(e2.message);
            r.analisadas++;
        } catch (e) {
            r.erros++;
            console.warn('[wa/analista]', c.id, msgErro(e));
        }
    }
    return r;
}
