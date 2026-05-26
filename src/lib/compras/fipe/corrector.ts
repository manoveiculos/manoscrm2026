import { createClient } from '@/lib/supabase/admin';
import { normalizeStrict } from './client';

const supabaseAdmin = createClient();

// Mapeamento dos modelos mais populares do Brasil e suas marcas reais correspondentes
export const POPULAR_MODELS_BR: { [key: string]: string } = {
  'strada': 'FIAT',
  'gol': 'VOLKSWAGEN',
  'onix': 'CHEVROLET',
  'hb20': 'HYUNDAI',
  'corolla': 'TOYOTA',
  'civic': 'HONDA',
  'uno': 'FIAT',
  'palio': 'FIAT',
  'compass': 'JEEP',
  'renegade': 'JEEP',
  'hilux': 'TOYOTA',
  'tracker': 'CHEVROLET',
  'creta': 'HYUNDAI',
  'tcross': 'VOLKSWAGEN',
  't-cross': 'VOLKSWAGEN',
  'kwid': 'RENAULT',
  'mobi': 'FIAT',
  'argo': 'FIAT',
  'polo': 'VOLKSWAGEN',
  'kicks': 'NISSAN',
  'hrv': 'HONDA',
  'hr-v': 'HONDA',
  'ka': 'FORD',
  'fiesta': 'FORD',
  'ecosport': 'FORD',
  'saveiro': 'VOLKSWAGEN',
  'fiorino': 'FIAT',
  'toro': 'FIAT',
  's10': 'CHEVROLET',
  'ranger': 'FORD',
  'clio': 'RENAULT',
  'c3': 'CITROEN',
  'c4': 'CITROEN',
  '208': 'PEUGEOT',
  '308': 'PEUGEOT',
  'fusca': 'VOLKSWAGEN',
  'celta': 'CHEVROLET',
  'prisma': 'CHEVROLET',
  'cobalt': 'CHEVROLET',
  'cruze': 'CHEVROLET',
  'spin': 'CHEVROLET',
  'vectra': 'CHEVROLET',
  'astra': 'CHEVROLET',
  'corsa': 'CHEVROLET',
  'siena': 'FIAT',
  'idea': 'FIAT',
  'punto': 'FIAT',
  'stilo': 'FIAT',
  'duster': 'RENAULT',
  'sandero': 'RENAULT',
  'logan': 'RENAULT',
  'captur': 'RENAULT',
  'oroch': 'RENAULT',
  'golf': 'VOLKSWAGEN',
  'jetta': 'VOLKSWAGEN',
  'voyage': 'VOLKSWAGEN',
  'fox': 'VOLKSWAGEN',
  'amarok': 'VOLKSWAGEN',
  'fit': 'HONDA',
  'city': 'HONDA',
  'etios': 'TOYOTA',
  'yaris': 'TOYOTA',
  'doblò': 'FIAT',
  'doblo': 'FIAT',
  'cronos': 'FIAT',
  'fastback': 'FIAT',
  'pulse': 'FIAT',
  'nivus': 'VOLKSWAGEN',
  'virtus': 'VOLKSWAGEN',
  'taos': 'VOLKSWAGEN',
  'up': 'VOLKSWAGEN',
  'up!': 'VOLKSWAGEN',
  'hb20s': 'HYUNDAI',
  'tucson': 'HYUNDAI',
  'ix35': 'HYUNDAI',
  'santa fe': 'HYUNDAI',
  'santafe': 'HYUNDAI',
  'creta action': 'HYUNDAI',
  'blazer': 'CHEVROLET',
  'equinox': 'CHEVROLET',
  'meriva': 'CHEVROLET',
  'zafira': 'CHEVROLET',
  'focus': 'FORD',
  'fusion': 'FORD',
  'ka sedan': 'FORD',
  'peugeot 208': 'PEUGEOT',
  'peugeot 2008': 'PEUGEOT',
  'citroen c3': 'CITROEN',
  'citroen c4': 'CITROEN',
  'renegade sport': 'JEEP'
};

export interface CorrectionResult {
  isValid: boolean;
  reason?: 'brand_mismatch' | 'typo';
  message?: string;
  suggestion?: {
    brand: string;
    model: string;
  };
}

/**
 * Valida a correlação entre marca e modelo inseridos pelo usuário.
 * Sugere correções se identificar marca incorreta para o modelo informado.
 */
export async function validateVehicleQuery(
  brand: string,
  model: string
): Promise<CorrectionResult> {
  const cleanBrandInput = normalizeStrict(brand).toUpperCase();
  const cleanModelInput = normalizeStrict(model);
  const modelWords = model.trim().split(/\s+/);
  const firstWord = modelWords[0] ? normalizeStrict(modelWords[0]) : '';

  // 1. Busca rápida no dicionário de modelos conhecidos (Fast Track)
  // Tenta casar o nome completo ou a primeira palavra do modelo
  let matchedRealBrand = POPULAR_MODELS_BR[cleanModelInput];
  
  if (!matchedRealBrand) {
    // Tenta casar por correspondência estrita das chaves do dicionário
    const cleanKeys = Object.keys(POPULAR_MODELS_BR);
    const matchedKey = cleanKeys.find(key => {
      const cleanKey = normalizeStrict(key);
      return cleanKey === cleanModelInput || cleanModelInput.startsWith(cleanKey);
    });
    if (matchedKey) {
      matchedRealBrand = POPULAR_MODELS_BR[matchedKey];
    }
  }

  if (!matchedRealBrand && firstWord) {
    matchedRealBrand = POPULAR_MODELS_BR[firstWord];
  }

  // Se encontramos a marca oficial no dicionário e ela difere da digitada pelo lojista
  if (matchedRealBrand && cleanBrandInput !== normalizeStrict(matchedRealBrand).toUpperCase()) {
    // Tratamento de aliases comuns (ex: VW / Volkswagen, GM / Chevrolet)
    const isAlias = 
      (cleanBrandInput === 'VW' && matchedRealBrand === 'VOLKSWAGEN') ||
      (cleanBrandInput === 'VOLKSWAGEN' && matchedRealBrand === 'VOLKSWAGEN') ||
      (cleanBrandInput === 'GM' && matchedRealBrand === 'CHEVROLET') ||
      (cleanBrandInput === 'CHEVROLET' && matchedRealBrand === 'CHEVROLET');

    if (!isAlias) {
      const formattedBrand = matchedRealBrand.charAt(0) + matchedRealBrand.slice(1).toLowerCase();
      const userBrandFormatted = brand.charAt(0) + brand.slice(1).toLowerCase();
      
      return {
        isValid: false,
        reason: 'brand_mismatch',
        message: `Você buscou por ${userBrandFormatted} ${model}. Mas o modelo ${model.toUpperCase()} pertence à marca ${formattedBrand}.`,
        suggestion: {
          brand: matchedRealBrand,
          model: model
        }
      };
    }
  }

  // 2. Fallback: Consulta no histórico do cache do banco de dados (fipe_cache)
  // Caso o modelo não esteja no dicionário estático popular
  try {
    const { data: cacheMatches } = await supabaseAdmin
      .from('fipe_cache')
      .select('brand, model')
      .ilike('model', `%${model.trim()}%`)
      .limit(5);

    if (cacheMatches && cacheMatches.length > 0) {
      // Conta as marcas associadas a esse modelo no cache
      const brandCounts: { [key: string]: number } = {};
      cacheMatches.forEach(c => {
        const b = c.brand.toUpperCase();
        brandCounts[b] = (brandCounts[b] || 0) + 1;
      });

      // Pega a marca mais frequente associada
      const dominantBrand = Object.keys(brandCounts).reduce((a, b) => brandCounts[a] > brandCounts[b] ? a : b);

      if (cleanBrandInput !== normalizeStrict(dominantBrand).toUpperCase()) {
        const isAlias = 
          (cleanBrandInput === 'VW' && dominantBrand === 'VOLKSWAGEN') ||
          (cleanBrandInput === 'VOLKSWAGEN' && dominantBrand === 'VOLKSWAGEN') ||
          (cleanBrandInput === 'GM' && dominantBrand === 'CHEVROLET') ||
          (cleanBrandInput === 'CHEVROLET' && dominantBrand === 'CHEVROLET');

        if (!isAlias) {
          const formattedBrand = dominantBrand.charAt(0) + dominantBrand.slice(1).toLowerCase();
          const userBrandFormatted = brand.charAt(0) + brand.slice(1).toLowerCase();

          return {
            isValid: false,
            reason: 'brand_mismatch',
            message: `Você buscou por ${userBrandFormatted} ${model}. No entanto, identificamos que ${model.toUpperCase()} está associado à marca ${formattedBrand}.`,
            suggestion: {
              brand: dominantBrand,
              model: model
            }
          };
        }
      }
    }
  } catch (dbErr) {
    console.warn('[Corrector Fallback] Erro ao consultar o banco de dados:', dbErr);
  }

  return { isValid: true };
}
