// src/lib/qualificacao.ts — QUALIFICAÇÃO DO LEAD (funções puras, client + server)
//
// Quatro perguntas decidem se vale gastar tempo com o lead:
//   1. Carro / faixa de valor   → vehicle_interest   (ex.: "Onix 2020 até 60 mil")
//   2. Entrada em R$            → valor_investimento (ex.: "R$ 10.000" | "Sem entrada")
//   3. Carro na troca           → carro_troca        (ex.: "Gol 2012" | "Sem troca")
//   4. Prazo de compra          → prazo_compra       (lista fechada abaixo)
//
// Em 14/10/2026, 0% dos leads dos últimos 45 dias tinha entrada, troca ou forma
// de compra preenchidos. Sem isso o vendedor não sabe quem atender primeiro.
//
// "Não sei" (campo vazio) é diferente de "não tem" ("Sem entrada", "Sem troca"):
// só a resposta explícita conta como qualificado.

export type PrazoCompra = 'esta_semana' | 'este_mes' | '1_3_meses' | 'pesquisando';

export const PRAZOS_COMPRA: { v: PrazoCompra; l: string; ate30dias: boolean }[] = [
    { v: 'esta_semana', l: 'Esta semana', ate30dias: true },
    { v: 'este_mes',    l: 'Este mês',    ate30dias: true },
    { v: '1_3_meses',   l: '1 a 3 meses', ate30dias: false },
    { v: 'pesquisando', l: 'Só pesquisando', ate30dias: false },
];

/** Tabelas de lead de VENDA que têm os 4 campos (leads_compra é outro fluxo). */
export const TABELAS_COM_QUALIFICACAO = ['leads_distribuicao_crm_26', 'leads_manos_crm'] as const;

export function tabelaComQualificacao(table: string | null | undefined): boolean {
    return (TABELAS_COM_QUALIFICACAO as readonly string[]).includes(String(table || ''));
}

export const SEM_ENTRADA = 'Sem entrada';
export const SEM_TROCA = 'Sem troca';

export interface QualificacaoCampos {
    vehicle_interest?: string | null;
    valor_investimento?: string | null;
    carro_troca?: string | null;
    prazo_compra?: string | null;
}

export type Selo = 'quente' | 'morno' | 'fora_do_perfil' | 'sem_qualificacao';

export const SELO_META: Record<Selo, { label: string; emoji: string; className: string }> = {
    quente:           { label: 'Quente',           emoji: '🔥', className: 'bg-red-600/20 text-red-200 border-red-500/50' },
    morno:            { label: 'Morno',            emoji: '🌡️', className: 'bg-amber-600/20 text-amber-200 border-amber-500/50' },
    fora_do_perfil:   { label: 'Fora do perfil',   emoji: '⛔', className: 'bg-zinc-700/40 text-zinc-300 border-zinc-500/50' },
    sem_qualificacao: { label: 'Sem qualificação', emoji: '❔', className: 'bg-blue-900/30 text-blue-200 border-blue-500/40' },
};

// Texto que o n8n grava quando não sabe o que o cliente quer — não é veículo.
const INTERESSE_GENERICO = [
    /^analisar\s+perfil/i,
    /^lead\s+(google|whatsapp|facebook|meta|instagram)/i,
    /n[aã]o\s+especificad/i,
    /^sem\s+(interesse|info)/i,
    /^entrada\s+manual/i,
    /^-+$/,
];

export function interesseGenerico(v: string | null | undefined): boolean {
    const s = (v || '').trim();
    if (s.length < 2) return true;
    return INTERESSE_GENERICO.some(rx => rx.test(s));
}

const NEGATIVA = /^(n[aã]o|nao tem|n[aã]o tem|nenhum[a]?|nada|zero|sem\b|---?$|0+([.,]0+)?$|r\$\s*0+([.,]0+)?$)/i;

/**
 * Converte texto livre em reais: "30 mil", "30k", "R$ 30.000,00", "30000",
 * "1,5 mil". Retorna null quando não há número reconhecível.
 */
export function parseValorBR(texto: string | null | undefined): number | null {
    if (texto == null) return null;
    const s = String(texto).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s) return null;
    const m = s.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(mil\b|k\b)?/);
    if (!m) return null;
    let numStr = m[1];
    const mult = m[2] ? 1000 : 1;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(numStr)) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');   // 30.000,00
    } else if (mult === 1000) {
        numStr = numStr.replace(',', '.');                      // 1,5 mil
    } else if (/^\d+,\d{1,2}$/.test(numStr)) {
        numStr = numStr.replace(',', '.');                      // 30000,00
    } else {
        numStr = numStr.replace(/[.,]/g, '');                   // 30.000 sem centavos já tratado; 30,000
    }
    const n = Number(numStr) * mult;
    return Number.isFinite(n) ? n : null;
}

/** Entrada: null = não respondeu; 0 = respondeu que não tem; >0 = valor. */
export function entradaEmReais(valor_investimento: string | null | undefined): number | null {
    const s = (valor_investimento || '').trim();
    if (!s) return null;
    if (NEGATIVA.test(s)) return 0;
    const n = parseValorBR(s);
    return n == null ? null : Math.max(0, n);
}

/** Troca: null = não respondeu; false = não tem; true = tem carro. */
export function temTroca(carro_troca: string | null | undefined): boolean | null {
    const s = (carro_troca || '').trim();
    if (!s) return null;
    if (NEGATIVA.test(s)) return false;
    return true;
}

export function getPrazo(v: string | null | undefined) {
    return PRAZOS_COMPRA.find(p => p.v === v) || null;
}

/**
 * Teto de preço que o cliente pediu, lido do texto do interesse:
 * "Onix até 50 mil" → 50000; "carro de 30k" → 30000; "Gol 2014" → null.
 * Ano (19xx/20xx) sozinho não é preço.
 */
export function faixaMaximaDoInteresse(vehicle_interest: string | null | undefined): number | null {
    const s = (vehicle_interest || '').toLowerCase();
    if (!s || interesseGenerico(s)) return null;
    const candidatos: number[] = [];
    const rx = /(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(mil\b|k\b)?/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(s))) {
        const temMarca = !!m[1] || !!m[3] || /\./.test(m[2]);
        const n = parseValorBR(m[0]);
        if (n == null) continue;
        if (!temMarca && n >= 1950 && n <= 2100) continue;   // é ano
        if (!temMarca && n < 1000) continue;                 // "1.0", "16v", "4p"
        if (n < 3000) continue;
        candidatos.push(n);
    }
    return candidatos.length ? Math.max(...candidatos) : null;
}

export interface ResultadoQualificacao {
    selo: Selo;
    /** Quais das 4 perguntas ainda não têm resposta. */
    faltando: ('carro' | 'entrada' | 'troca' | 'prazo')[];
    completa: boolean;
    entrada: number | null;
    troca: boolean | null;
    faixaMaxima: number | null;
    motivo: string;
}

/**
 * Regras (decididas com o Alexandre em 14/10/2026):
 *  - Fora do perfil: sem entrada (declarado), sem troca e pede carro abaixo da
 *    faixa do estoque (pisoEstoque = carro mais barato à venda).
 *  - Quente: tem entrada OU troca, E prazo até 30 dias.
 *  - Sem qualificação: nenhuma das perguntas de entrada/troca/prazo respondida.
 *  - Morno: o resto.
 */
export function classificarLead(campos: QualificacaoCampos, pisoEstoque: number | null): ResultadoQualificacao {
    const entrada = entradaEmReais(campos.valor_investimento);
    const troca = temTroca(campos.carro_troca);
    const prazo = getPrazo(campos.prazo_compra);
    const faixaMaxima = faixaMaximaDoInteresse(campos.vehicle_interest);

    const faltando: ResultadoQualificacao['faltando'] = [];
    if (interesseGenerico(campos.vehicle_interest)) faltando.push('carro');
    if (entrada == null) faltando.push('entrada');
    if (troca == null) faltando.push('troca');
    if (!prazo) faltando.push('prazo');

    const base = { faltando, completa: faltando.length === 0, entrada, troca, faixaMaxima };
    const temRecurso = (entrada ?? 0) > 0 || troca === true;

    if (entrada === 0 && troca !== true && faixaMaxima != null && pisoEstoque != null && faixaMaxima < pisoEstoque) {
        return { ...base, selo: 'fora_do_perfil', motivo: `Sem entrada e procura até R$ ${faixaMaxima.toLocaleString('pt-BR')} (estoque começa em R$ ${pisoEstoque.toLocaleString('pt-BR')})` };
    }
    if (temRecurso && prazo?.ate30dias) {
        return { ...base, selo: 'quente', motivo: `${(entrada ?? 0) > 0 ? 'Tem entrada' : 'Tem troca'} e quer comprar ${prazo.l.toLowerCase()}` };
    }
    if (entrada == null && troca == null && !prazo) {
        return { ...base, selo: 'sem_qualificacao', motivo: 'Entrada, troca e prazo ainda não perguntados' };
    }
    return { ...base, selo: 'morno', motivo: faltando.length ? `Falta: ${faltando.join(', ')}` : 'Sem urgência ou sem recurso de entrada' };
}

export const ROTULO_CAMPO: Record<ResultadoQualificacao['faltando'][number], string> = {
    carro: 'Carro / faixa de valor',
    entrada: 'Entrada (R$)',
    troca: 'Carro na troca',
    prazo: 'Prazo de compra',
};

/** Modelos de moto vendidos na loja — ficam fora do piso de preço de CARRO. */
const MOTO = /\b(biz|cg|cb\s?\d|cbr|xre|bros|titan|fan|pop\s?1|fazer|factor|lander|nmax|pcx|xmax|crosser|tenere|mt[- ]?0?\d|xj6|hornet|twister|ninja|burgman|scooter|elite|lead\s?1|neo|crypton|xtz|falcon|shineray|dafra)\b/i;

export function ehMoto(marcaModelo: string): boolean {
    return MOTO.test(marcaModelo);
}
