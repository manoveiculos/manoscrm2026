// src/constants/lossReasons.ts — FONTE ÚNICA DOS MOTIVOS DE PERDA
//
// Lista fechada usada em TODO lugar que marca lead como perdido (Kanban de
// Atendimento, tela /lead/[id]) e validada no servidor (/api/lead/finish).
// O slug vai para motivo_perda_estruturado; o rótulo vai para a auditoria.
//
// Antes, a perda era texto livre (Kanban) ou uma lista de 9 opções (tela do
// lead), e 545 de 556 perdas de jun–jul ficaram sem motivo utilizável.

export interface MotivoPerda {
    v: string;
    l: string;
    /** Obriga o vendedor a escrever o detalhe. */
    exigeTexto?: boolean;
    /** Lead sem crédito: a IA de reversão (Karol) não tenta reengajar. */
    descarteFinanceiro?: boolean;
    /** Cliente fechou com outro: trava a reversão de vez (não insistir). */
    travaReversao?: boolean;
}

export const MOTIVOS_PERDA: readonly MotivoPerda[] = [
    { v: 'sem_entrada',            l: 'Sem entrada' },
    { v: 'credito_negado',         l: 'Crédito negado', descarteFinanceiro: true },
    { v: 'comprou_em_outro_lugar', l: 'Comprou em outro lugar', travaReversao: true },
    { v: 'carro_fora_estoque',     l: 'Carro fora do estoque' },
    { v: 'sumiu',                  l: 'Sumiu / não respondeu' },
    { v: 'so_pesquisando',         l: 'Só pesquisando' },
    { v: 'outro',                  l: 'Outro', exigeTexto: true },
];

/** Mínimo de caracteres do detalhe quando o motivo é "Outro". */
export const MIN_TEXTO_OUTRO = 10;

export function getMotivoPerda(slug: string | null | undefined): MotivoPerda | null {
    const s = (slug || '').trim().toLowerCase();
    return MOTIVOS_PERDA.find(m => m.v === s) || null;
}

/**
 * Rótulos legíveis — inclui os slugs antigos (lista de 9 opções e detector de
 * intenção) para a auditoria continuar legível nos registros já gravados.
 */
export const MOTIVO_PERDA_LABEL: Record<string, string> = {
    ...Object.fromEntries(MOTIVOS_PERDA.map(m => [m.v, m.l])),
    preco: 'Preço', parcela: 'Parcela alta', modelo: 'Queria outro modelo',
    concorrente: 'Comprou no concorrente', cpf_ruim: 'CPF com restrição',
    score_baixo: 'Score baixo', sem_interesse: 'Sem interesse',
    ja_comprou: 'Já comprou', inatividade: 'Perdido por inatividade',
    pediu_pra_parar: 'Pediu pra parar', reclamacao_spam: 'Reclamou de spam',
};

export function labelMotivoPerda(slug: string | null | undefined): string | null {
    const s = (slug || '').trim().toLowerCase();
    if (!s) return null;
    return MOTIVO_PERDA_LABEL[s] || (s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '));
}

/** Texto da auditoria: "[Rótulo] diagnóstico do vendedor". */
export function comporMotivoAuditoria(slug: string | null | undefined, diagnostico: string | null | undefined): string | null {
    const label = labelMotivoPerda(slug);
    return [label ? `[${label}]` : null, (diagnostico || '').trim() || null].filter(Boolean).join(' ') || null;
}
