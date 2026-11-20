// src/lib/campanhas/tipos.ts — tipos da aba "Campanhas" (Meta Ads × Google Ads em tempo real)

export type Plataforma = 'meta' | 'google';
export type StatusCampanha = 'ativa' | 'pausada' | 'encerrada' | 'outro';

export interface CampanhaLinha {
    plataforma: Plataforma;
    id: string;
    nome: string;
    status: StatusCampanha;
    /** Status como a plataforma informa (ex.: ACTIVE, CAMPAIGN_PAUSED, ENABLED). */
    statusBruto: string;
    /** Orçamento diário em reais, quando a plataforma informa. */
    orcamentoDiario: number | null;
    gasto: number;
    impressoes: number;
    cliques: number;
    /** Em %, ex.: 1,8 */
    ctr: number;
    cpc: number;
    cpm: number;
    /** O que a PLATAFORMA conta como resultado: Meta = leads de formulário + conversas no WhatsApp; Google = conversões. */
    resultados: number;
    /** Só Meta: parte dos resultados que são conversas iniciadas no WhatsApp. */
    conversas: number | null;
    custoPorResultado: number | null;
    /** Leads que chegaram ao CRM com o anúncio desta campanha (só Meta: vem do source_id do clique no WhatsApp). */
    leadsCrm?: number;
}

export interface TotaisGrupo {
    gasto: number;
    impressoes: number;
    cliques: number;
    ctr: number;
    cpc: number;
    cpm: number;
    resultados: number;
    custoPorResultado: number | null;
}

export interface GrupoCampanhas {
    plataforma: Plataforma;
    /** false = faltam credenciais ou a plataforma recusou: `erro` diz o motivo. */
    conectado: boolean;
    erro: string | null;
    moeda: string;
    totais: TotaisGrupo;
    campanhas: CampanhaLinha[];
}

/** O funil real do CRM para um grupo de origem (Meta, Google ou o resto). */
export interface FunilCrm {
    leads: number;
    atendidos: number;
    vendas: number;
    perdidos: number;
}

export interface ForaDaPraca {
    visitantes: number;
    foraDeSc: number;
    /** % de visitantes de fora de Santa Catarina entre os que têm estado conhecido. */
    percentual: number;
    topCidades: { cidade: string; uf: string; visitantes: number }[];
}

export const GRUPO_VAZIO: TotaisGrupo = { gasto: 0, impressoes: 0, cliques: 0, ctr: 0, cpc: 0, cpm: 0, resultados: 0, custoPorResultado: null };

const arred = (n: number, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;

/** Soma as linhas e recalcula as razões (nunca soma CTR/CPC/CPM das linhas: a média ficaria errada). */
export function somarTotais(linhas: CampanhaLinha[]): TotaisGrupo {
    const gasto = linhas.reduce((a, l) => a + l.gasto, 0);
    const impressoes = linhas.reduce((a, l) => a + l.impressoes, 0);
    const cliques = linhas.reduce((a, l) => a + l.cliques, 0);
    const resultados = linhas.reduce((a, l) => a + l.resultados, 0);
    return {
        gasto: arred(gasto),
        impressoes, cliques,
        ctr: impressoes ? arred((cliques / impressoes) * 100) : 0,
        cpc: cliques ? arred(gasto / cliques) : 0,
        cpm: impressoes ? arred((gasto / impressoes) * 1000) : 0,
        resultados,
        custoPorResultado: resultados ? arred(gasto / resultados) : null,
    };
}
