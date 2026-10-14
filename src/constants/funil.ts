// src/constants/funil.ts — ETAPAS PADRONIZADAS DO FUNIL DE VENDA
//
//   triagem → em atendimento → visita agendada → visitou/test drive → proposta → vendido | perdido
//
// Os status gravados no banco NÃO mudam: cada etapa grava um status que o
// resto do sistema já conhece (views, monitor de inatividade, conversões,
// Kanban do Pipeline). Este arquivo só traduz status ↔ etapa.
//
// 'attempt' é TRIAGEM: é o que "Iniciar atendimento" grava no instante em que o
// vendedor abre o lead, antes de qualquer conversa. Em 14/10/2026 havia 198
// leads em 'attempt' (171 há mais de 24h) e 3 em 'received' — chamar 'attempt'
// de "em atendimento" esconderia exatamente o gargalo. O Kanban do Pipeline já
// tratava 'attempt' como TRIAGEM (LEGACY_STATUS_MAP). Sair da triagem exige a
// qualificação completa e grava 'contacted'.

export type EtapaFunil =
    | 'triagem'
    | 'em_atendimento'
    | 'visita_agendada'
    | 'visitou'
    | 'proposta'
    | 'vendido'
    | 'perdido';

export const ETAPAS_FUNIL: { id: EtapaFunil; label: string; ordem: number }[] = [
    { id: 'triagem',         label: 'Triagem',            ordem: 1 },
    { id: 'em_atendimento',  label: 'Em atendimento',     ordem: 2 },
    { id: 'visita_agendada', label: 'Visita agendada',    ordem: 3 },
    { id: 'visitou',         label: 'Visitou / Test drive', ordem: 4 },
    { id: 'proposta',        label: 'Proposta',           ordem: 5 },
    { id: 'vendido',         label: 'Vendido',            ordem: 6 },
    { id: 'perdido',         label: 'Perdido',            ordem: 6 },
];

/** Status gravado quando o lead é movido PARA a etapa. */
export const STATUS_DA_ETAPA: Record<EtapaFunil, string> = {
    triagem: 'attempt',
    em_atendimento: 'contacted',
    visita_agendada: 'scheduled',
    visitou: 'visited',
    proposta: 'proposed',
    vendido: 'vendido',
    perdido: 'perdido',
};

const ETAPA_DO_STATUS: Record<string, EtapaFunil> = {
    // Triagem: entrou ou foi pego, e ninguém qualificou ainda
    received: 'triagem', new: 'triagem', novo: 'triagem', nova: 'triagem', triagem: 'triagem',
    entrada: 'triagem', aguardando: 'triagem', 'aguardando atendimento': 'triagem',
    'sem contato': 'triagem', sem_contato: 'triagem', 'em triagem': 'triagem',
    attempt: 'triagem', qualificando: 'triagem', reativacao: 'triagem', frio: 'triagem',
    // Em atendimento: qualificado, conversa andando
    contacted: 'em_atendimento', 'em atendimento': 'em_atendimento', em_atendimento: 'em_atendimento',
    contatado: 'em_atendimento', qualificado: 'em_atendimento', ataque: 'em_atendimento',
    // Visita agendada
    scheduled: 'visita_agendada', agendado: 'visita_agendada', agendamento: 'visita_agendada', confirmed: 'visita_agendada',
    // Visitou / test drive
    visited: 'visitou', visitou: 'visitou', visita: 'visitou', 'visita realizada': 'visitou', test_drive: 'visitou',
    // Proposta (inclui o antigo "Fechamento" do Kanban)
    proposed: 'proposta', proposta: 'proposta', negotiation: 'proposta', negociando: 'proposta',
    negociacao: 'proposta', 'negociação': 'proposta', closing: 'proposta', fechamento: 'proposta',
    'em fechamento': 'proposta',
    // Finais
    vendido: 'vendido', closed: 'vendido', comprado: 'vendido', fechado: 'vendido', 'venda realizada': 'vendido', post_sale: 'vendido',
    perdido: 'perdido', lost: 'perdido', lost_by_inactivity: 'perdido', lost_redistributed: 'perdido',
    'perda total': 'perdido', desistiu: 'perdido', 'sem interesse': 'perdido', desqualificado: 'perdido',
    lixo: 'perdido', duplicado: 'perdido',
};

export function etapaDoStatus(status: string | null | undefined): EtapaFunil {
    return ETAPA_DO_STATUS[String(status || '').toLowerCase().trim()] || 'triagem';
}

export function ordemEtapa(e: EtapaFunil): number {
    return ETAPAS_FUNIL.find(x => x.id === e)?.ordem || 0;
}

/** Lead não pode passar mais que isso em triagem. */
export const TRIAGEM_MAX_HORAS = 24;

/** Horas em triagem (pela entrada do lead) e se já estourou o limite. */
export function triagemAtrasada(
    lead: { status?: string | null; created_at?: string | null },
    agora: number = Date.now(),
): { atrasada: boolean; horas: number } {
    if (etapaDoStatus(lead.status) !== 'triagem' || !lead.created_at) return { atrasada: false, horas: 0 };
    const horas = Math.floor((agora - new Date(lead.created_at).getTime()) / 3_600_000);
    return { atrasada: horas >= TRIAGEM_MAX_HORAS, horas };
}

/**
 * Etapas que só podem ser alcançadas com a qualificação completa
 * (carro, entrada, troca e prazo respondidos) — ou seja, sair da triagem.
 */
export const ETAPAS_EXIGEM_QUALIFICACAO: EtapaFunil[] = ['em_atendimento', 'visita_agendada', 'visitou', 'proposta'];

/** Etapas que exigem visita marcada na agenda. */
export const ETAPAS_EXIGEM_VISITA: EtapaFunil[] = ['visita_agendada', 'visitou'];
