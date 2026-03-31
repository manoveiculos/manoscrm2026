// src/utils/calculateScore.ts

interface ScoreInput {
  status: string;           // Status normalizado
  tempoFunilHoras: number;  // Horas desde created_at
  totalInteracoes: number;  // Count de interactions_manos_crm
  ultimaInteracaoH: number; // Horas desde última interação
  temValorDefinido: boolean; // valor_investimento preenchido
  temVeiculoInteresse: boolean; // vehicle_interest preenchido
}

export function calculateLeadScore(input: ScoreInput): number {
  // REGRA INEGOCIÁVEL: Se PERDIDO ou VENDIDO, retorna direto (são estados finais)
  if (input.status === 'perdido') return 0;
  if (input.status === 'vendido') return 100;

  let score = 0;

  // 1. BASE POR STATUS (peso mais alto — 40 pontos max)
  const statusBase: Record<string, number> = {
    'entrada': 20,
    'triagem': 35,
    'ataque': 55,
    'fechamento': 75,
  };
  score += statusBase[input.status] || 10;

  // 2. ENGAJAMENTO — interações reais (+20 pontos max)
  if (input.totalInteracoes >= 10) score += 20;
  else if (input.totalInteracoes >= 5) score += 15;
  else if (input.totalInteracoes >= 2) score += 10;
  else if (input.totalInteracoes >= 1) score += 5;
  // 0 interações = 0 pontos extra

  // 3. RECÊNCIA — última interação (+20 pontos max)
  if (input.ultimaInteracaoH < 2) score += 20;       // Interagiu nas últimas 2h
  else if (input.ultimaInteracaoH < 12) score += 15;  // Hoje
  else if (input.ultimaInteracaoH < 48) score += 10;  // Ontem
  else if (input.ultimaInteracaoH < 168) score += 5;  // Esta semana
  // Mais de 1 semana = 0 pontos extra

  // 4. QUALIFICAÇÃO — dados preenchidos (+15 pontos max)
  if (input.temValorDefinido) score += 8;
  if (input.temVeiculoInteresse) score += 7;

  // 5. PENALIDADE POR TEMPO PARADO
  // Lead parado muito tempo no mesmo status = score cai
  if (input.status === 'entrada' && input.tempoFunilHoras > 48) {
    score -= 15; // Lead na entrada há mais de 2 dias = penalidade forte
  }
  if (input.status === 'triagem' && input.tempoFunilHoras > 120) {
    score -= 10; // Na triagem há mais de 5 dias
  }
  if (input.ultimaInteracaoH > 336) { // Sem interação há mais de 2 semanas
    score -= 20;
  }

  // Clamp entre 1-99 (100% é reservado EXCLUSIVAMENTE para VENDIDO, 0 para PERDIDO)
  const final = Math.max(1, Math.round(score));
  return Math.min(99, final);
}

// Classificação textual
export function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'QUENTE', color: '#dc2626' };
  if (score >= 60) return { label: 'MORNO', color: '#f59e0b' };
  if (score >= 30) return { label: 'FRIO', color: '#3b82f6' };
  return { label: 'GELADO', color: '#6b7280' };
}
