// src/constants/status.ts — FONTE ÚNICA DE VERDADE PARA STATUS

export const PIPELINE_STAGES = [
  {
    id: 'entrada',
    label: 'ENTRADA',
    sublabel: 'Novos Alvos',
    color: '#3b82f6',    // azul
    icon: '⚡',
    order: 1,
  },
  {
    id: 'triagem',
    label: 'TRIAGEM',
    sublabel: 'Qualificação',
    color: '#eab308',    // amarelo
    icon: '📋',
    order: 2,
  },
  {
    id: 'ataque',
    label: 'ATAQUE',
    sublabel: 'Em Conversa',
    color: '#dc2626',    // vermelho
    icon: '🎯',
    order: 3,
  },
  {
    id: 'fechamento',
    label: 'FECHAMENTO',
    sublabel: 'Negociação',
    color: '#22c55e',    // verde
    icon: '🤝',
    order: 4,
  },
] as const;

export const FINAL_STATES = [
  {
    id: 'vendido',
    label: 'VENDIDO',
    color: '#f59e0b',    // dourado
    icon: '🏆',
  },
  {
    id: 'perdido',
    label: 'PERDIDO',
    color: '#6b7280',    // cinza
    icon: '💀',
  },
] as const;

export const ALL_STATUS = [
  ...PIPELINE_STAGES,
  ...FINAL_STATES,
] as const;

// Mapeamento de status legados (inglês + português V1 → português V2)
// Inclui todos os status que podem vir de leads_distribuicao_crm_26 (n8n) e leads_manos_crm (V1)
export const LEGACY_STATUS_MAP: Record<string, string> = {
  // ── Inglês (V1 antigo) ──────────────────────────────────────
  'new': 'entrada',
  'received': 'entrada',
  'contacted': 'triagem',
  'attempt': 'triagem',
  'scheduled': 'ataque',
  'visited': 'ataque',
  'test_drive': 'ataque',
  'negotiation': 'fechamento',
  'proposed': 'fechamento',
  'closed': 'vendido',
  'lost': 'perdido',
  'post_sale': 'vendido',

  // ── Português (n8n / V1 crm26) ───────────────────────────────
  // ENTRADA
  'novo': 'entrada',
  'nova': 'entrada',
  'aguardando': 'entrada',
  'aguardando atendimento': 'entrada',
  'sem contato': 'entrada',
  'sem_contato': 'entrada',
  'em espera': 'entrada',

  // TRIAGEM
  'em atendimento': 'triagem',
  'em_atendimento': 'triagem',
  'contatado': 'triagem',
  'qualificando': 'triagem',
  'qualificado': 'triagem',
  'em triagem': 'triagem',

  // ATAQUE
  'agendado': 'ataque',
  'agendamento': 'ataque',
  'visitou': 'ataque',
  'visita': 'ataque',
  'visita realizada': 'ataque',
  'em ataque': 'ataque',
  'em_ataque': 'ataque',

  // FECHAMENTO
  'negociando': 'fechamento',
  'negociação': 'fechamento',
  'negociacao': 'fechamento',
  'em negociação': 'fechamento',
  'proposta': 'fechamento',
  'em fechamento': 'fechamento',
  'em_fechamento': 'fechamento',
  'avançado': 'fechamento',

  // VENDIDO
  'venda realizada': 'vendido',
  'vendido': 'vendido',
  'comprado': 'vendido',
  'fechado': 'vendido',

  // PERDIDO
  'perdido': 'perdido',
  'perda total': 'perdido',
  'perda_total': 'perdido',
  'desistiu': 'perdido',
  'sem interesse': 'perdido',
  'sem_interesse': 'perdido',
  'inativo': 'perdido',
  'lixo': 'perdido',
  'duplicado': 'perdido',
  'desqualificado': 'perdido',
  'lost_redistributed': 'perdido',
};

// Função helper para normalizar qualquer status
export function normalizeStatus(rawStatus: any): string {
  if (!rawStatus || typeof rawStatus !== 'string') return 'entrada';
  const lower = rawStatus.toLowerCase().trim();
  // Se já é um status válido do novo sistema, retorna direto
  if (ALL_STATUS.some(s => s.id === lower)) return lower;
  // Se é um status legado, converte
  if (LEGACY_STATUS_MAP[lower]) return LEGACY_STATUS_MAP[lower];
  // Fallback
  return 'entrada';
}

// Função para pegar config de um status
export function getStatusConfig(rawStatus: any) {
  const normalized = normalizeStatus(rawStatus);
  return ALL_STATUS.find(s => s.id === normalized) || ALL_STATUS[0];
}
