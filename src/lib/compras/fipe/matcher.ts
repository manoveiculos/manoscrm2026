import { distance } from 'fastest-levenshtein';
import { createClient } from '@/lib/supabase/admin';
import { getFipePricesFromParallelum, normalizeModelName } from './client';

const supabaseAdmin = createClient();

export interface FipeMatchResult {
  fipe_code: string;
  fipe_price_official: number;
  model_official: string;
  confidence: number;
  is_estimated?: boolean;
}

export interface FipeSearchResponse {
  hasMultipleMatches: boolean;
  match?: FipeMatchResult;
  options?: FipeMatchResult[];
}

/**
 * Busca por correspondência aproximada do veículo e retorna opções se houver ambiguidade.
 */
export async function searchFipeOptions(
  brand: string,
  model: string,
  yearModel: number
): Promise<FipeSearchResponse> {
  try {
    if (!brand || !model || !yearModel) return { hasMultipleMatches: false };

    // 1. Busca os candidatos no banco com a mesma marca e ano modelo
    const { data: candidates, error } = await supabaseAdmin
      .from('fipe_cache')
      .select('fipe_code, model, price')
      .eq('brand', brand.toUpperCase())
      .eq('year_model', yearModel);

    const cleanInputModel = normalizeModelName(model);

    // 2. Calcula score de similaridade para cada candidato local
    const scoredCandidates = (candidates || []).map(c => {
      const cleanCandidateModel = normalizeModelName(c.model);
      const dist = distance(cleanInputModel, cleanCandidateModel);
      const maxLen = Math.max(cleanInputModel.length, cleanCandidateModel.length);
      let similarity = maxLen > 0 ? 1 - dist / maxLen : 0;

      // Bônus de substring: se o input for parte do modelo oficial, garante passagem pelo threshold (0.65)
      if (cleanCandidateModel.includes(cleanInputModel)) {
        similarity = Math.max(similarity, 0.70);
      }

      return {
        fipe_code: c.fipe_code,
        fipe_price_official: Number(c.price),
        model_official: c.model,
        confidence: Math.round(Math.min(similarity, 1) * 100) / 100
      };
    });

    // Ordena do maior score para o menor
    scoredCandidates.sort((a, b) => b.confidence - a.confidence);

    // Filtra candidatos locais válidos
    const validLocalCandidates = scoredCandidates.filter(c => c.confidence >= 0.65);

    // Se o melhor match do banco for dominante e excelente (>= 0.92), assume match exato local
    const bestLocal = validLocalCandidates[0];
    if (bestLocal && bestLocal.confidence >= 0.92 && (validLocalCandidates.length === 1 || bestLocal.confidence - validLocalCandidates[1].confidence >= 0.15)) {
      return { hasMultipleMatches: false, match: bestLocal };
    }

    // 3. Se não houver correspondência exata dominante no banco local, busca online no Parallelum
    console.log(`[Fipe Matcher] Sem match exato dominante local para: ${brand} ${model} (${yearModel}). Buscando online...`);
    try {
      const onlinePrices = await getFipePricesFromParallelum(brand, model, yearModel);

      if (onlinePrices && onlinePrices.length > 0) {
        const options: FipeMatchResult[] = onlinePrices.map(o => {
          const priceClean = Number(o.Valor.replace(/[^\d]/g, '')) / 100;
          return {
            fipe_code: o.CodigoFipe,
            fipe_price_official: priceClean,
            model_official: o.Modelo,
            confidence: 0.95
          };
        });

        // Se encontrou apenas 1 modelo online, retorna ele como match
        if (options.length === 1) {
          return { hasMultipleMatches: false, match: options[0] };
        }

        // Se encontrou múltiplos modelos, retorna como opções para escolha do lojista
        return {
          hasMultipleMatches: true,
          options
        };
      }
    } catch (apiErr) {
      console.warn('[Fipe Matcher] Erro ao consumir API online da FIPE. Ativando fallback resiliente local.', apiErr);
    }

    // 4. Se a busca online falhar/estiver indisponível, retorna o melhor match local se ele for minimamente útil (>= 0.50)
    if (bestLocal && bestLocal.confidence >= 0.50) {
      if (validLocalCandidates.length > 1) {
        return {
          hasMultipleMatches: true,
          options: validLocalCandidates
        };
      }
      return { hasMultipleMatches: false, match: bestLocal };
    }

    return { hasMultipleMatches: false };
  } catch (err) {
    console.error('Erro ao buscar opções da FIPE:', err);
    return { hasMultipleMatches: false };
  }
}

/**
 * Wrapper de busca única retrocompatível.
 */
export async function findFipeCode(
  brand: string,
  model: string,
  yearModel: number
): Promise<FipeMatchResult | null> {
  const res = await searchFipeOptions(brand, model, yearModel);
  if (res.hasMultipleMatches && res.options && res.options.length > 0) {
    return res.options[0];
  }
  return res.match || null;
}
