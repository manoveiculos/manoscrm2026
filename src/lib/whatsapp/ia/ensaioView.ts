// src/lib/whatsapp/ia/ensaioView.ts — tipos e contas da tela de ensaio (PURO)
//
// Usado pelo servidor (API) e pelo navegador (tela Conversas, admin/gestor).

export type StatusRodada = 'rodando' | 'ok' | 'erro' | 'pulada' | 'abandonada';

export interface RespostaReal {
    autor: 'laura' | 'vendedor';
    texto: string;
    em: string;
}

export interface RodadaEnsaio {
    id: string;
    status: StatusRodada;
    motivo: string | null;
    modo: 'ensaio' | 'envia';
    iniciadaEm: string;
    terminadaEm: string | null;
    tempoMs: number | null;
    custoUsd: number | null;
    /** Mensagem do cliente que disparou a rodada. */
    gatilho: { texto: string; em: string } | null;
    /** O que a Laura do CRM mandaria (já passado pelo filtro). */
    rascunho: string | null;
    /** Texto antes do filtro, só quando o filtro trocou. */
    original: string | null;
    violacoes: string[];
    ferramentas: { nome: string; erro: boolean }[];
    fotos: { carro: string; quantidade: number }[];
    agendamento: { rotulo: string } | null;
    passagem: { motivo: string; resumo: string } | null;
    /** O que foi de fato enviado ao cliente pelo fluxo atual (n8n ou vendedor). */
    reais: RespostaReal[];
}

export interface ResumoEnsaio {
    desde: string;
    rodadas: number;
    ok: number;
    erro: number;
    puladas: number;
    /** Rascunhos em que o filtro trocou o texto da IA. */
    barradas: number;
    violacoes: Record<string, number>;
    tempoMedioMs: number | null;
    custoTotalUsd: number;
    conversas: number;
    custoPorConversaUsd: number | null;
}

export interface LinhaResumo {
    conversa_id: string;
    status: string;
    violacoes: string[] | null;
    tempo_ms: number | null;
    custo_usd: number | string | null;
}

export function resumirRodadas(linhas: LinhaResumo[], desde: string): ResumoEnsaio {
    const r: ResumoEnsaio = {
        desde, rodadas: 0, ok: 0, erro: 0, puladas: 0, barradas: 0, violacoes: {},
        tempoMedioMs: null, custoTotalUsd: 0, conversas: 0, custoPorConversaUsd: null,
    };
    const conversas = new Set<string>();
    let somaTempo = 0, comTempo = 0;
    for (const l of linhas) {
        if (l.status === 'pulada') { r.puladas++; continue; }
        if (l.status === 'rodando' || l.status === 'abandonada') { if (l.status === 'abandonada') r.erro++; continue; }
        r.rodadas++;
        if (l.status === 'ok') r.ok++; else r.erro++;
        conversas.add(l.conversa_id);
        const v = l.violacoes || [];
        if (v.length) r.barradas++;
        for (const x of v) r.violacoes[x] = (r.violacoes[x] || 0) + 1;
        if (l.status === 'ok' && typeof l.tempo_ms === 'number') { somaTempo += l.tempo_ms; comTempo++; }
        r.custoTotalUsd += Number(l.custo_usd) || 0;
    }
    r.conversas = conversas.size;
    r.tempoMedioMs = comTempo ? Math.round(somaTempo / comTempo) : null;
    r.custoTotalUsd = Math.round(r.custoTotalUsd * 10000) / 10000;
    r.custoPorConversaUsd = r.conversas ? Math.round((r.custoTotalUsd / r.conversas) * 10000) / 10000 : null;
    return r;
}

export const ROTULO_VIOLACAO: Record<string, string> = {
    simulou_parcela: 'simulou parcela',
    avaliou_carro: 'avaliou carro',
    fechou_negocio: 'fechou negócio',
    preco_fora_do_anuncio: 'preço fora do anúncio',
    pediu_documento: 'pediu documento',
};

export const ROTULO_FERRAMENTA: Record<string, string> = {
    buscar_estoque: 'estoque',
    enviar_fotos: 'fotos',
    salvar_ficha: 'ficha',
    agendar_visita: 'agenda',
    passar_para_consultor: 'consultor',
};

export function segundos(ms: number | null | undefined): string {
    if (ms == null) return '—';
    return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
}

/** Custo em US$ com 4 casas (centavo de dólar é grande demais para uma rodada). */
export function dolares(v: number | null | undefined): string {
    if (v == null) return '—';
    return `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}
