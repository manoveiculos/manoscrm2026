export interface DealScoreResult {
  score: number;
  rating: 'EXCELENTE' | 'BOM' | 'MEDIO' | 'RUIM' | 'EVITAR';
  reasons: Record<string, number>;
}

interface DealScoreInput {
  year_model: number;
  km: number;
  fipe_pct: number | null;
  recovered_accident: boolean;
  expenses: string | null;
  tires: string | null;
  has_manual: boolean | null;
  has_spare_key: boolean | null;
  net_price: number;
}

export function computeDealScore(offer: DealScoreInput, marketAvg?: number | null): DealScoreResult {
  let score = 50;
  const reasons: Record<string, number> = {};

  // 1. Preço vs FIPE (peso 35)
  if (offer.fipe_pct !== null && offer.fipe_pct > 0) {
    const fipeDiff = offer.fipe_pct; // % do net_price sobre FIPE
    if (fipeDiff < 80) {
      score += 25;
      reasons.fipe = +25;
    } else if (fipeDiff < 90) {
      score += 15;
      reasons.fipe = +15;
    } else if (fipeDiff < 100) {
      score += 5;
      reasons.fipe = +5;
    } else if (fipeDiff > 105) {
      score -= 20;
      reasons.fipe = -20;
    }
  }

  // 2. Preço vs média de mercado (peso 25)
  if (marketAvg && marketAvg > 0) {
    const marketDiff = ((offer.net_price - marketAvg) / marketAvg) * 100;
    if (marketDiff < -10) {
      score += 15;
      reasons.market = +15;
    } else if (marketDiff < 0) {
      score += 8;
      reasons.market = +8;
    } else if (marketDiff > 10) {
      score -= 15;
      reasons.market = -15;
    }
  } else if (offer.fipe_pct !== null && offer.fipe_pct > 0) {
    // Se não houver média de mercado calculada, usa uma comparação simplificada com base na FIPE como substituto do mercado
    const mockMarketDiff = offer.fipe_pct - 94; // considera 94% da FIPE a "média de repasse"
    if (mockMarketDiff < -6) {
      score += 10;
      reasons.market_estimate = +10;
    } else if (mockMarketDiff > 6) {
      score -= 10;
      reasons.market_estimate = -10;
    }
  }

  // 3. KM vs idade (peso 15)
  const currentYear = new Date().getFullYear();
  const age = Math.max(1, currentYear - offer.year_model);
  const expectedKm = age * 15000; // 15k km/ano padrão
  const kmRatio = offer.km / expectedKm;

  if (kmRatio < 0.7) {
    score += 10;
    reasons.km = +10; // baixa quilometragem para a idade
  } else if (kmRatio > 1.5) {
    score -= 10;
    reasons.km = -10; // alta quilometragem para a idade
  }

  // 4. Estado do veículo (peso 15)
  if (offer.recovered_accident) {
    score -= 25;
    reasons.sinistro = -25;
  }
  
  if (offer.expenses && /4 peças|martelinho|pintura|funilaria|retoc|parachoque|arranh|amass/i.test(offer.expenses)) {
    score -= 5;
    reasons.gastos = -5;
  }
  
  if (offer.tires) {
    if (/4 bons|novos|zero/i.test(offer.tires)) {
      score += 3;
      reasons.pneus = +3;
    } else if (/fraco|ruim|careca|meia vida/i.test(offer.tires)) {
      score -= 5;
      reasons.pneus = -5;
    }
  }

  // 5. Documentação (peso 10)
  if (offer.has_manual) {
    score += 2;
    reasons.manual = +2;
  }
  if (offer.has_spare_key) {
    score += 2;
    reasons.chave = +2;
  }

  // Garante limite entre 0 e 100
  score = Math.max(0, Math.min(100, score));

  let rating: 'EXCELENTE' | 'BOM' | 'MEDIO' | 'RUIM' | 'EVITAR';
  if (score >= 80) rating = 'EXCELENTE';
  else if (score >= 65) rating = 'BOM';
  else if (score >= 50) rating = 'MEDIO';
  else if (score >= 35) rating = 'RUIM';
  else rating = 'EVITAR';

  return { score, rating, reasons };
}
