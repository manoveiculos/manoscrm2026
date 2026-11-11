// src/lib/agentes/painel.ts — NÚMEROS DO TELÃO (função pura; a leitura do banco fica em carregar.ts)
//
// Só contagens reais. ai_classification vem em vários formatos (hot/HOT/LEAD MORNO/…) e a
// maioria dos leads ainda não tem classificação — isso aparece como "Sem classificação",
// não é escondido nem distribuído entre as temperaturas.

export interface PainelTelao {
    /** Leads ATIVOS por temperatura (ai_classification normalizada). */
    leads: { quente: number; morno: number; frio: number; semClassificacao: number };
    vendasHoje: number;
    vendasMes: number;
    funil: { rotulo: string; n: number }[];
}

export type Temperatura = 'quente' | 'morno' | 'frio' | 'sem';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function normalizarTemperatura(c: string | null | undefined): Temperatura {
    const x = semAcento(String(c || ''));
    if (/desqualific|perda/.test(x)) return 'sem';
    if (/\bhot\b|quente/.test(x)) return 'quente';
    if (/\bwarm\b|morno/.test(x)) return 'morno';
    if (/\bcold\b|frio/.test(x)) return 'frio';
    return 'sem';
}

const ETAPA: Record<string, { rotulo: string; ordem: number }> = {
    received: { rotulo: 'Recebidos', ordem: 0 },
    new: { rotulo: 'Recebidos', ordem: 0 },
    attempt: { rotulo: 'Em triagem', ordem: 1 },
    triagem: { rotulo: 'Em triagem', ordem: 1 },
    contacted: { rotulo: 'Em contato', ordem: 2 },
};

export function montarPainel(leads: { status: string | null; ai_classification: string | null }[], vendasHoje: number, vendasMes: number): PainelTelao {
    const temp = { quente: 0, morno: 0, frio: 0, semClassificacao: 0 };
    const etapas = new Map<string, { n: number; ordem: number }>();
    for (const l of leads) {
        const t = normalizarTemperatura(l.ai_classification);
        if (t === 'sem') temp.semClassificacao += 1; else temp[t] += 1;
        const st = String(l.status || '').trim().toLowerCase() || 'sem etapa';
        const e = ETAPA[st] || { rotulo: st.charAt(0).toUpperCase() + st.slice(1), ordem: 9 };
        const atual = etapas.get(e.rotulo);
        etapas.set(e.rotulo, { n: (atual?.n || 0) + 1, ordem: e.ordem });
    }
    const funil = [...etapas.entries()]
        .sort((a, b) => a[1].ordem - b[1].ordem || b[1].n - a[1].n)
        .slice(0, 4)
        .map(([rotulo, v]) => ({ rotulo, n: v.n }));
    funil.push({ rotulo: 'Vendidos no mês', n: vendasMes });
    return { leads: temp, vendasHoje, vendasMes, funil };
}
