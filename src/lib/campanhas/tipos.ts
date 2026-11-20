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

/** Conversões que o CRM devolve à plataforma (lead qualificado, visita agendada, venda). */
export interface ConversoesDevolvidas {
    modo: 'off' | 'test' | 'live';
    itens: { evento: 'QualifiedLead' | 'Schedule' | 'Purchase'; aEnviar: number; enviadas: number; falhas: number; semIdentificador: number }[];
}

/** Conta a fila por evento. `ignorados` só entra em "sem identificador" quando o motivo NÃO é "não é do grupo". */
export function resumirFila(linhas: { event_name: string; status: string; last_error?: string | null }[], modo: ConversoesDevolvidas['modo'], doutroGrupo = 'lead não é do Google'): ConversoesDevolvidas {
    const eventos = ['QualifiedLead', 'Schedule', 'Purchase'] as const;
    const itens = eventos.map(evento => {
        const l = linhas.filter(x => x.event_name === evento);
        return {
            evento,
            aEnviar: l.filter(x => x.status === 'pending').length,
            enviadas: l.filter(x => x.status === 'sent').length,
            falhas: l.filter(x => x.status === 'failed').length,
            semIdentificador: l.filter(x => (x.status === 'ignored' || x.status === 'skipped') && x.last_error !== doutroGrupo).length,
        };
    });
    return { modo, itens };
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
