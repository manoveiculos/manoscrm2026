// src/lib/whatsapp/ia/leituraEnsaio.ts — leitura do ensaio da Laura (SÓ SERVIDOR)
//
// Lido com o cliente da SESSÃO: o RLS de wa_ia_execucoes (wa_ve_todas) deixa
// só gestor/admin ver. Vendedor recebe lista vazia.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resumoMensagem } from '../conversasView';
import { inicioDoDiaSP, respostasReais } from './regras';
import { resumirRodadas, type LinhaResumo, type RodadaEnsaio, type ResumoEnsaio, type StatusRodada } from './ensaioView';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

const COLUNAS_MSG = 'id, autor, tipo, texto, legenda, transcricao, duracao_s, midia_nome, apagada_em, criada_em';

const resumo = (m: Linha, limite: number) => resumoMensagem({
    tipo: m.tipo, texto: m.texto, legenda: m.legenda, duracaoS: m.duracao_s,
    midiaNome: m.midia_nome, apagadaEm: m.apagada_em, transcricao: m.transcricao,
}, limite);

export async function rodadasDaConversa(sessao: SupabaseClient, conversaId: string, limite = 30): Promise<RodadaEnsaio[]> {
    const { data, error } = await sessao.from('wa_ia_execucoes')
        .select('id, status, motivo, modo, iniciada_em, terminada_em, tempo_ms, custo_usd, gatilho_mensagem_id, texto_original, texto_final, violacoes, ferramentas, fotos, agendamento, passagem')
        .eq('conversa_id', conversaId)
        .neq('status', 'pulada')
        .order('iniciada_em', { ascending: false })
        .limit(limite);
    if (error) throw new Error(`ensaio: ${error.message}`);
    const linhas = (data || []) as Linha[];
    if (!linhas.length) return [];

    const ids = [...new Set(linhas.map(l => l.gatilho_mensagem_id).filter(Boolean))] as string[];
    const gatilhos = new Map<string, Linha>();
    if (ids.length) {
        const { data: gs } = await sessao.from('wa_mensagens').select(COLUNAS_MSG).in('id', ids);
        for (const g of (gs || []) as Linha[]) gatilhos.set(g.id, g);
    }
    const maisAntigo = [...gatilhos.values()].map(g => g.criada_em as string).sort()[0];
    let depois: Linha[] = [];
    if (maisAntigo) {
        const { data: ms } = await sessao.from('wa_mensagens').select(COLUNAS_MSG)
            .eq('conversa_id', conversaId).gte('criada_em', maisAntigo)
            .order('criada_em', { ascending: true }).limit(500);
        depois = (ms || []) as Linha[];
    }
    const comparaveis = depois.map(m => ({ ...m, criadaEm: m.criada_em as string }));

    return linhas.map(l => {
        const g = l.gatilho_mensagem_id ? gatilhos.get(l.gatilho_mensagem_id) : null;
        const reais = g
            ? respostasReais(g.criada_em, comparaveis)
                .filter(m => m.autor === 'laura' || m.autor === 'vendedor')
                .map(m => ({ autor: m.autor as 'laura' | 'vendedor', texto: resumo(m, 1000), em: m.criada_em as string }))
            : [];
        const ferramentas = Array.isArray(l.ferramentas) ? l.ferramentas as Linha[] : [];
        const fotos = Array.isArray(l.fotos) ? l.fotos as Linha[] : [];
        const violacoes = Array.isArray(l.violacoes) ? l.violacoes as string[] : [];
        return {
            id: l.id,
            status: l.status as StatusRodada,
            motivo: l.motivo ?? null,
            modo: l.modo,
            iniciadaEm: l.iniciada_em,
            terminadaEm: l.terminada_em ?? null,
            tempoMs: l.tempo_ms ?? null,
            custoUsd: l.custo_usd != null ? Number(l.custo_usd) : null,
            gatilho: g ? { texto: resumo(g, 600), em: g.criada_em } : null,
            rascunho: l.texto_final ?? null,
            original: violacoes.length ? (l.texto_original ?? null) : null,
            violacoes,
            ferramentas: ferramentas.map(f => ({ nome: String(f.nome || ''), erro: Boolean(f.erro) })),
            fotos: fotos.map(f => ({ carro: String(f.carro || ''), quantidade: Array.isArray(f.urls) ? f.urls.length : 0 })),
            agendamento: l.agendamento?.rotulo ? { rotulo: String(l.agendamento.rotulo) } : null,
            passagem: l.passagem?.motivo ? { motivo: String(l.passagem.motivo), resumo: String(l.passagem.resumo || '') } : null,
            reais,
        };
    });
}

/** Números do dia (desde 00:00 de Rio do Sul) para a barra do admin. */
export async function resumoDoDia(sessao: SupabaseClient, agora = new Date()): Promise<ResumoEnsaio | null> {
    const desde = inicioDoDiaSP(agora).toISOString();
    const { data, error } = await sessao.from('wa_ia_execucoes')
        .select('conversa_id, status, violacoes, tempo_ms, custo_usd')
        .gte('iniciada_em', desde)
        .limit(5000);
    if (error) return null;
    return resumirRodadas((data || []) as LinhaResumo[], desde);
}
