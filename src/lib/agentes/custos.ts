// src/lib/agentes/custos.ts — gasto de IA por dia, semana e mês (PURO)
//
// Pedido do Alexandre (13/11/2026): a Central dos Agentes mostra quanto a IA gastou por período.
// Fontes (todas em US$): wa_ia_execucoes (Laura), wa_followups (follow-up), ia_custos (triagem, analista).
// Período = calendário de Brasília (UTC-3 fixo, mesma premissa do resto do CRM):
//   dia = desde 00:00 de hoje · semana = desde a segunda 00:00 · mês = desde o dia 1º 00:00.

export type Periodo = 'dia' | 'semana' | 'mes';

export interface LinhaCusto { agente: string; em: string; usd: number }

export const ROTULO_AGENTE_CUSTO: Record<string, string> = {
    laura: 'Laura (atendimento)',
    followup: 'Follow-up',
    triagem: 'Triagem de leads',
    analista: 'Analista de contexto',
    classificador: 'Classificador de leads',
};

export const ROTULO_PERIODO: Record<Periodo, string> = { dia: 'Hoje', semana: 'Semana', mes: 'Mês' };

const BR = 3 * 3_600_000;

/** Início do período em ms UTC. */
export function inicioDoPeriodo(periodo: Periodo, agora: Date): number {
    const br = new Date(agora.getTime() - BR);
    const a = br.getUTCFullYear(), m = br.getUTCMonth(), d = br.getUTCDate();
    if (periodo === 'dia') return Date.UTC(a, m, d, 3);
    if (periodo === 'mes') return Date.UTC(a, m, 1, 3);
    const dow = (br.getUTCDay() + 6) % 7; // segunda = 0
    return Date.UTC(a, m, d - dow, 3);
}

/** Dia (AAAA-MM-DD) em Brasília de um instante ISO. */
export const diaBR = (iso: string): string => new Date(Date.parse(iso) - BR).toISOString().slice(0, 10);

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface ResumoCusto {
    periodo: Periodo;
    inicio: string;
    total: number;
    porAgente: { agente: string; rotulo: string; usd: number; chamadas: number }[];
    porDia: { dia: string; usd: number }[];
    /** Média por dia corrido do período (até hoje). */
    mediaDia: number;
    /** Projeção do mês (só no período "mês"): média por dia × dias do mês. */
    projecaoMes: number | null;
}

export function resumirCustos(linhas: LinhaCusto[], periodo: Periodo, agora: Date): ResumoCusto {
    const ini = inicioDoPeriodo(periodo, agora);
    const dentro = linhas.filter(l => { const t = Date.parse(l.em); return Number.isFinite(t) && t >= ini && t <= agora.getTime() && Number.isFinite(l.usd); });
    const ag = new Map<string, { usd: number; chamadas: number }>();
    const dias = new Map<string, number>();
    let total = 0;
    for (const l of dentro) {
        total += l.usd;
        const x = ag.get(l.agente) || { usd: 0, chamadas: 0 };
        x.usd += l.usd; x.chamadas++; ag.set(l.agente, x);
        const d = diaBR(l.em);
        dias.set(d, (dias.get(d) || 0) + l.usd);
    }
    // todos os dias do período aparecem, mesmo os sem gasto (o gráfico não pula dias)
    const porDia: { dia: string; usd: number }[] = [];
    const hoje = diaBR(agora.toISOString());
    for (let t = ini; ; t += 86_400_000) {
        const d = diaBR(new Date(t + 4 * 3_600_000).toISOString()); // 01:00 BR do dia, longe da virada
        if (d > hoje) break;
        porDia.push({ dia: d, usd: r4(dias.get(d) || 0) });
        if (porDia.length > 40) break;
    }
    const diasCorridos = Math.max(1, porDia.length);
    const br = new Date(agora.getTime() - BR);
    const diasNoMes = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() + 1, 0)).getUTCDate();
    const mediaDia = total / diasCorridos;
    return {
        periodo, inicio: new Date(ini).toISOString(), total: r4(total),
        porAgente: [...ag.entries()].map(([agente, v]) => ({ agente, rotulo: ROTULO_AGENTE_CUSTO[agente] || agente, usd: r4(v.usd), chamadas: v.chamadas })).sort((a, b) => b.usd - a.usd),
        porDia, mediaDia: r4(mediaDia),
        projecaoMes: periodo === 'mes' ? r4(mediaDia * diasNoMes) : null,
    };
}
