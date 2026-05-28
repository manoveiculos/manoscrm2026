import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { deduceBrandFromText } from '@/lib/compras/parser/extractor';
import { distance } from 'fastest-levenshtein';

const supabaseAdmin = createClient();

// Algoritmo dinâmico de Deal Score reestruturado com base na Liquidez (30%) e Preço (70%)
function calculateDealScore(offer: any) {
  const parseVal = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = val.replace(/[^\d]/g, '');
    return clean ? parseFloat(clean) / (val.includes(',') ? 100 : 1) : 0;
  };

  const askPrice = parseVal(offer.preco_pedido);
  const referenceFipe = parseVal(offer.preco_fipe);

  if (referenceFipe <= 0 || askPrice <= 0) {
    return {
      score: 30,
      rating: 'MEDIO' as const,
      reasons: [{ type: 'info' as const, text: 'Sem referência FIPE para calcular score' }]
    };
  }

  const fipePct = (askPrice / referenceFipe) * 100;
  const discount = Math.round(100 - fipePct);
  let reasons: { type: 'fipe' | 'bonus' | 'penalty' | 'info'; text: string }[] = [];

  // 1. SCORE DE PREÇO (Máximo 70 pontos)
  let precoScore = 20;
  if (fipePct <= 75) {
    precoScore = 70;
    reasons.push({ type: 'fipe', text: `Preço excelente: ${discount}% abaixo da FIPE (+70 pts)` });
  } else if (fipePct <= 82) {
    precoScore = 63;
    reasons.push({ type: 'fipe', text: `Preço ótimo: ${discount}% abaixo da FIPE (+63 pts)` });
  } else if (fipePct <= 88) {
    precoScore = 56;
    reasons.push({ type: 'fipe', text: `Preço bom: ${discount}% abaixo da FIPE (+56 pts)` });
  } else if (fipePct <= 92) {
    precoScore = 45;
    reasons.push({ type: 'fipe', text: `Preço regular: ${discount}% abaixo da FIPE (+45 pts)` });
  } else if (fipePct <= 95) {
    precoScore = 35;
    reasons.push({ type: 'fipe', text: `Margem apertada: ${discount}% abaixo da FIPE (+35 pts)` });
  } else if (fipePct <= 100) {
    precoScore = 20;
    reasons.push({ type: 'fipe', text: `Preço próximo da tabela FIPE (+20 pts)` });
  } else {
    precoScore = 5;
    reasons.push({ type: 'penalty', text: `Preço acima da FIPE (-15 pts)` });
  }

  // 2. SCORE DE LIQUIDEZ (Máximo 30 pontos)
  const brandUpper = String(offer.marca || '').toUpperCase();
  const modelUpper = String(offer.modelo || '').toUpperCase();
  const currentYear = new Date().getFullYear();
  const yearNum = offer.ano_modelo && String(offer.ano_modelo).toLowerCase() !== 'null' 
    ? Number(String(offer.ano_modelo).replace(/[^\d]/g, '').slice(0, 4)) 
    : currentYear - 5;

  let liquidezScore = 15;
  let isMico = false;

  // Líderes de revenda no varejo brasileiro (Alta Liquidez)
  const liders = /(STRADA|ONIX|GOL|HB20|COROLLA|COMPASS|UNO|PALIO|KA|PRISMA|ARGO|MOBI|CIVIC|HILUX|TORO|CRETA|RENEGADE|HR-V|HRV|TRACKER|SAVEIRO)/i;
  // Veículos de nicho ou manutenção complexa ("micos" ou rejeitados no pátio)
  const micos = /(MAREA|TEMPRA|BRAVA|HOGGAR|POWERSHIFT|DUALOGIC|IMOTION|EASYTRONIC)/i;
  const marcasComplexas = /(PEUGEOT|CITROEN|LIFAN|EFFA|CHERY|GEELY|JAC)/i;
  const premiumAntigo = /(AUDI|BMW|MERCEDES|LAND ROVER|VOLVO|PORSCHE)/i;

  const isLider = liders.test(modelUpper) || liders.test(brandUpper);
  const isComplexo = micos.test(modelUpper) || 
                     marcasComplexas.test(brandUpper) || 
                     (premiumAntigo.test(brandUpper) && (currentYear - yearNum) > 10);

  if (isLider && !isComplexo) {
    liquidezScore = 30;
    reasons.push({ type: 'bonus', text: 'Alta liquidez: Líder consolidado de revenda (+30 pts)' });
  } else if (isComplexo) {
    liquidezScore = 0;
    isMico = true;
    reasons.push({ type: 'penalty', text: 'Baixa liquidez: Risco de manutenção complexa ou rejeição (+0 pts)' });
  } else {
    reasons.push({ type: 'info', text: 'Liquidez média: Giro regular de estoque (+15 pts)' });
  }

  // Score Base (Preço + Liquidez)
  let finalScore = precoScore + liquidezScore;

  // 3. AJUSTES E MODIFICADORES DE SAÚDE
  const age = Math.max(currentYear - yearNum, 1);
  const expectedKm = age * 12000;
  const km = offer.km ? Number(String(offer.km).replace(/[^\d]/g, '')) : 80000;

  if (km > 0 && expectedKm > 0) {
    if (km < expectedKm * 0.4) {
      finalScore += 8;
      reasons.push({ type: 'bonus', text: 'Extremamente pouco rodado para o ano (+8 pts)' });
    } else if (km > expectedKm * 1.5) {
      finalScore -= 10;
      reasons.push({ type: 'penalty', text: 'Desgaste por uso intenso: alta quilometragem (-10 pts)' });
    }
  }

  // Penalidade adicional na nota se for mico
  if (isMico) {
    finalScore -= 15;
    reasons.push({ type: 'penalty', text: 'Penalidade de mercado: manutenção ou giro complexo (-15 pts)' });
  }

  // Penalidade de histórico (caso passe do filtro ou para fins administrativos)
  const rawText = `${offer.modelo || ''} ${offer.detalhes_mecanica_estetica || ''} ${offer.texto_bruto_original || ''}`.toLowerCase();
  const isRecovered = /sinistr|leil[aã]o|recuperad|rsv|média monta/i.test(rawText);
  if (isRecovered) {
    finalScore -= 30;
    reasons.push({ type: 'penalty', text: 'Histórico de leilão ou sinistro detectado (-30 pts)' });
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  let rating: 'EXCELENTE' | 'BOM' | 'MEDIO' | 'RUIM' | 'EVITAR' = 'MEDIO';
  if (finalScore >= 85) {
    rating = 'EXCELENTE';
  } else if (finalScore >= 70) {
    rating = 'BOM';
  } else if (finalScore >= 50) {
    rating = 'MEDIO';
  } else if (finalScore >= 30) {
    rating = 'RUIM';
  } else {
    rating = 'EVITAR';
  }

  return {
    score: finalScore,
    rating,
    reasons
  };
}

function normalizeUnicodeFonts(text: string): string {
  if (!text) return text;
  
  let normalized = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i);
    if (code === undefined) continue;

    if (code > 0xffff) {
      i++;
    }

    let lat = '';
    if (code >= 120064 && code <= 120089) lat = String.fromCharCode(65 + (code - 120064));
    else if (code >= 120090 && code <= 120115) lat = String.fromCharCode(97 + (code - 120090));
    else if (code >= 120120 && code <= 120145) lat = String.fromCharCode(65 + (code - 120120));
    else if (code >= 120146 && code <= 120171) lat = String.fromCharCode(97 + (code - 120146));
    else if (code >= 120172 && code <= 120197) lat = String.fromCharCode(65 + (code - 120172));
    else if (code >= 120198 && code <= 120223) lat = String.fromCharCode(97 + (code - 120198));
    else if (code >= 120224 && code <= 120275) lat = String.fromCharCode(65 + (code - 120224));
    else if (code >= 120276 && code <= 120301) lat = String.fromCharCode(65 + (code - 120276));
    else if (code >= 120302 && code <= 120327) lat = String.fromCharCode(97 + (code - 120302));
    else if (code >= 120328 && code <= 120353) lat = String.fromCharCode(65 + (code - 120328));
    else if (code >= 120354 && code <= 120379) lat = String.fromCharCode(97 + (code - 120354));

    if (lat) {
      normalized += lat;
    } else {
      normalized += String.fromCodePoint(code);
    }
  }
  return normalized;
}

function cleanSecrets(text: string): string {
  if (!text) return text;
  
  let cleaned = normalizeUnicodeFonts(text);
  
  const secrets = [
    /repasse alto vale vip/gi,
    /mvjp repasses/gi,
    /autopay express/gi,
    /flash car sc/gi,
    /alto vale vip/gi,
    /autopay/gi,
    /mvjp/gi,
    /flash car/gi,
  ];
  
  secrets.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });
  
  cleaned = cleaned
    .replace(/[\u{1F3E6}\u{1F6AA}\u{1F697}\u{1F699}\u{2699}\u{267B}\u{1F4CD}\u{1F527}\u{1F4B5}\u{1F4B0}\u{1F556}\u{1F6DE}\u{1F5E3}\u{2705}]/gu, '')
    .replace(/\*/g, '')
    .replace(/^\s*[-/\\|:]\s*/g, '')
    .replace(/\s*[-/\\|:]\s*$/g, '')
    .replace(/\s+[-/\\|:]\s+/g, ' ');

  return cleaned.replace(/\s+/g, ' ').trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandParam = searchParams.get('brand');
    const ratingParam = searchParams.get('rating');
    const limitParam = Number(searchParams.get('limit') || 1000);

    const authHeader = request.headers.get('Authorization');
    const adminKey = process.env.ADMIN_SECRET_KEY || 'manos_intel_secret_key';
    const requestAdminKey = searchParams.get('admin_key') || (authHeader ? authHeader.replace('Bearer ', '') : null);
    const isAdmin = requestAdminKey === adminKey;

    // Limpeza física automática de anúncios lixo do banco de dados (marca/modelo "Não Identificado" ou nulo)
    try {
      await supabaseAdmin
        .from('repassecentral')
        .delete()
        .or('marca.is.null,modelo.is.null,ano_modelo.is.null,marca.eq.,modelo.eq.,ano_modelo.eq.,marca.eq.null,modelo.eq.null,ano_modelo.eq.null,marca.eq.NaN,modelo.eq.NaN,ano_modelo.eq.NaN');
      
      await supabaseAdmin
        .from('repassecentral')
        .delete()
        .or('marca.ilike.%não%identifica%,modelo.ilike.%não%identifica%,marca.ilike.%não%informad%,modelo.ilike.%não%informad%');
      
      console.log('[Cleanup] Executada limpeza física automática de anúncios inválidos da tabela repassecentral.');
    } catch (cleanupErr: any) {
      console.warn('[Cleanup Error] Falha ao limpar anúncios inválidos do banco:', cleanupErr.message);
    }

    // Busca repasses ativos da tabela central ordenados por data_hora_recebimento decrescente (mais recentes primeiro)
    const { data: offers, error } = await supabaseAdmin
      .from('repassecentral')
      .select('*')
      .order('data_hora_recebimento', { ascending: false });

    if (error) {
      throw error;
    }

    // Calcula os deal scores dinamicamente para 100% das ofertas
    let opportunities = (offers || []).map((o: any) => {
      const { score, rating, reasons } = calculateDealScore(o);
      
      const parseVal = (val: any) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const clean = val.replace(/[^\d]/g, '');
        return clean ? parseFloat(clean) / (val.includes(',') ? 100 : 1) : 0;
      };

      const repVal = parseVal(o.preco_pedido);
      const fipeVal = parseVal(o.preco_fipe);
      const fipePct = fipeVal > 0 ? (repVal / fipeVal) * 100 : 100;

      let model = normalizeUnicodeFonts(o.modelo);
      const rawText = normalizeUnicodeFonts(o.detalhes_mecanica_estetica || '');

      // Correção retroativa do modelo
      if (/autopay|mvjp|alto\s*vale|flash\s*car/i.test(model)) {
        const modelMatch = rawText.match(/(?:Modelo|Veículo)\s*:?\s*\*?([^*:\n]+)\*?/i);
        if (modelMatch) {
          model = modelMatch[1].trim();
        }
      }

      // Dedução de marca
      let brand = o.marca;
      if (!brand || brand.toUpperCase() === 'OUTROS') {
        const deduced = deduceBrandFromText(model.toUpperCase());
        if (deduced) {
          brand = deduced;
        }
      }

      const deducedBrand = deduceBrandFromText(model.toUpperCase());
      if (deducedBrand && brand.toUpperCase() !== deducedBrand) {
        brand = deducedBrand;
      }

      let details = o.detalhes_mecanica_estetica;
      let cleanReasons = reasons;

      if (!isAdmin) {
        model = cleanSecrets(model);
        if (details) details = cleanSecrets(details);
        if (cleanReasons) {
          cleanReasons = cleanReasons.map((r: any) => ({
            ...r,
            text: cleanSecrets(r.text)
          }));
        }
      }

      const isRecovered = /sinistr|leil[aã]o|recuperad|rsv|média monta/i.test(rawText);

      const responseOpp = {
        id: o.id || o.mensagem_id || Math.random().toString(36).substring(2, 9),
        brand: brand.toUpperCase(),
        model,
        year_model: o.ano_modelo && String(o.ano_modelo).toLowerCase() !== 'null' ? Number(String(o.ano_modelo).replace(/[^\d]/g, '').slice(0, 4)) : 0,
        km: o.km ? Number(String(o.km).replace(/[^\d]/g, '')) : 80000,
        ask_price: repVal,
        fipe_price: fipeVal,
        fipe_price_official: fipeVal,
        recovered_accident: isRecovered,
        expenses_estimated: 0,
        has_manual: false,
        has_spare_key: false,
        seller_name: isAdmin ? (o.contato_nome_whatsapp || 'Não informado') : 'Particular',
        seller_phone: isAdmin ? (o.whatsapp_remetente || 'Não informado') : 'Removido por segurança',
        location: null,
        posted_at: o.data_hora_recebimento,
        notes: details,
        deal_score: score,
        rating,
        reasons: cleanReasons,
        fipe_pct: Math.round(fipePct),
        grupo_anuncio: isAdmin ? o.grupo_origem : 'Canal Privado'
      };

      return responseOpp;
    });

    // 1. Ordena do mais recente para o mais antigo (posted_at decrescente) primeiro
    opportunities.sort((a: any, b: any) => {
      const timeA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const timeB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return timeB - timeA;
    });

    // 2. Remove duplicados aproximados de forma inteligente (o mais recente prevalece)
    const finalOpps: any[] = [];
    for (const opp of opportunities) {
      const isDuplicate = finalOpps.some((existing) => {
        const hasSellerPhone = 
          opp.seller_phone && existing.seller_phone &&
          opp.seller_phone !== 'Removido por segurança' &&
          existing.seller_phone !== 'Removido por segurança';
        
        const sameSeller = hasSellerPhone && opp.seller_phone === existing.seller_phone;
        const sameContext = opp.grupo_anuncio === existing.grupo_anuncio;

        const sameSpecs = 
          opp.brand === existing.brand &&
          opp.year_model === existing.year_model &&
          Math.abs(opp.km - existing.km) <= 200;

        if (sameSpecs && (sameSeller || (!hasSellerPhone && sameContext))) {
          const modelA = opp.model.toLowerCase().replace(/[^\w]/g, '');
          const modelB = existing.model.toLowerCase().replace(/[^\w]/g, '');

          const maxLen = Math.max(modelA.length, modelB.length);
          const dist = distance(modelA, modelB);
          const similarity = maxLen > 0 ? (1 - dist / maxLen) : 1;

          if (similarity >= 0.75 || modelA.includes(modelB) || modelB.includes(modelA)) {
            return true;
          }
        }
        return false;
      });

      if (!isDuplicate) {
        finalOpps.push(opp);
      }
    }

    opportunities = finalOpps;

    // Filtra apenas registros totalmente inválidos (sem marca/modelo ou ano inválido)
    opportunities = opportunities.filter((o: any) => {
      if (!o.brand || !o.model) return false;
      const brandClean = o.brand.toUpperCase();
      const modelClean = o.model.toUpperCase();
      
      const isUnidentified = 
        brandClean.includes('NÃO IDENTIFICAD') || 
        modelClean.includes('NÃO IDENTIFICAD') ||
        (brandClean === 'OUTROS' && modelClean === 'OUTROS') ||
        (brandClean === 'OUTRO' && modelClean === 'OUTRO');

      const isInvalidYear = !o.year_model || String(o.year_model).toLowerCase() === 'null' || o.year_model <= 1900;

      return !isUnidentified && !isInvalidYear;
    });

    // Filtros adicionais
    if (ratingParam) {
      opportunities = opportunities.filter((o: any) => o.rating === ratingParam.toUpperCase());
    }

    if (brandParam) {
      opportunities = opportunities.filter((o: any) => o.brand === brandParam.toUpperCase());
    }

    const totalCount = opportunities.length;
    const excelentesCount = opportunities.filter((o: any) => o.deal_score >= 85).length;
    const bonsCount = opportunities.filter((o: any) => o.deal_score >= 70 && o.deal_score < 85).length;

    let avgDiscount = 0;
    if (totalCount > 0) {
      const sum = opportunities.reduce((acc: number, o: any) => acc + (100 - o.fipe_pct), 0);
      avgDiscount = Math.round(sum / totalCount);
    }

    const slicedOpportunities = opportunities.slice(0, limitParam);

    return NextResponse.json({
      success: true,
      opportunities: slicedOpportunities,
      totalCount,
      excelentesCount,
      bonsCount,
      avgDiscount
    });

  } catch (err: any) {
    console.error('[API Oportunidades] Erro:', err.message);
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar oportunidades de compra.' },
      { status: 500 }
    );
  }
}
