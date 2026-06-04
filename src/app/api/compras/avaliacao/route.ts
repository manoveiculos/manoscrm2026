import { NextRequest, NextResponse } from 'next/server';
import { searchFipeOptions } from '@/lib/compras/fipe/matcher';
import { getPricesByFipeCode, parseReferenceMonth } from '@/lib/compras/fipe/client';
import { validateVehicleQuery } from '@/lib/compras/fipe/corrector';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand');
    const model = searchParams.get('model');
    const yearModelStr = searchParams.get('year_model');
    const kmStr = searchParams.get('km');

    if (!brand || !model || !yearModelStr) {
      return NextResponse.json(
        { success: false, error: 'Marca, modelo e ano modelo são obrigatórios.' },
        { status: 400 }
      );
    }

    const yearModel = parseInt(yearModelStr, 10);
    const km = kmStr ? parseInt(kmStr, 10) : 0;

    if (isNaN(yearModel)) {
      return NextResponse.json(
        { success: false, error: 'Ano modelo inválido.' },
        { status: 400 }
      );
    }

    // Validação inteligente de marca e modelo (corretor de associação marca x modelo)
    const validation = await validateVehicleQuery(brand, model);
    if (!validation.isValid && validation.suggestion) {
      console.log(`[API Avaliação] 💡 Sugestão de correção: ${brand} ${model} -> ${validation.suggestion.brand} ${validation.suggestion.model}`);
      return NextResponse.json({
        success: false,
        isCorrectionSuggested: true,
        reason: validation.reason,
        message: validation.message,
        suggestion: validation.suggestion
      });
    }

    console.log(`[API Avaliação] Buscando: ${brand} ${model} (${yearModel}) - KM: ${km}`);

    // 1. Resolve a correspondência da FIPE (Cache local, Parallelum ou busca direta por fipe_code)
    const fipeCodeParam = searchParams.get('fipe_code');
    let fipeMatch = null;
    let hasMultipleMatches = false;
    let options: any[] = [];

    if (fipeCodeParam) {
      console.log(`[API Avaliação] Busca direta por código FIPE especificado: ${fipeCodeParam} para o ano ${yearModel}`);
      
      if (!fipeCodeParam.startsWith('OFFER-')) {
        // Busca no cache local primeiro
        const { data: cacheData } = await supabaseAdmin
          .from('fipe_cache')
          .select('fipe_code, model, price')
          .eq('fipe_code', fipeCodeParam)
          .eq('year_model', yearModel)
          .limit(1);

        if (cacheData && cacheData.length > 0) {
          fipeMatch = {
            fipe_code: cacheData[0].fipe_code,
            fipe_price_official: Number(cacheData[0].price),
            model_official: cacheData[0].model,
            confidence: 1.0
          };
        } else {
          try {
            // Se não estiver no cache, busca online os preços desse código FIPE
            const prices = await getPricesByFipeCode(fipeCodeParam);
            const priceForYear = prices.find((p: any) => p.anoModelo === yearModel);
            if (priceForYear) {
              const priceClean = Number(priceForYear.valor.replace(/[^\d]/g, '')) / 100;
              
              // Salva no cache local usando a referência oficial da FIPE
              const referenceMonth = parseReferenceMonth(priceForYear.mesReferencia);
              await supabaseAdmin
                .from('fipe_cache')
                .upsert({
                  fipe_code: fipeCodeParam,
                  reference_month: referenceMonth,
                  brand: brand.toUpperCase(),
                  model: priceForYear.modelo,
                  year_model: yearModel,
                  fuel: priceForYear.combustivel.toUpperCase(),
                  price: priceClean,
                  fetched_at: new Date().toISOString()
                }, {
                  onConflict: 'fipe_code,year_model,reference_month'
                });

              fipeMatch = {
                fipe_code: fipeCodeParam,
                fipe_price_official: priceClean,
                model_official: priceForYear.modelo,
                confidence: 1.0
              };
            }
          } catch (onlineErr) {
            console.warn(`[API Avaliação] Falha ao buscar preço online do código FIPE ${fipeCodeParam}.`, onlineErr);
          }
        }
      }
    } else {
      // Caso padrão: faz a busca aproximada com detecção de múltiplas opções
      const searchRes = await searchFipeOptions(brand, model, yearModel);
      
      if (searchRes.hasMultipleMatches) {
        hasMultipleMatches = true;
        options = searchRes.options || [];
      } else {
        fipeMatch = searchRes.match || null;
      }
    }

    if (hasMultipleMatches) {
      return NextResponse.json({
        success: true,
        hasMultipleMatches: true,
        options
      });
    }

    const firstWordModel = model.trim().split(' ')[0];

    if (!fipeMatch) {
      console.log(`[API Avaliação] Veículo não encontrado na FIPE oficial: ${brand} ${model} (${yearModel})`);
      return NextResponse.json(
        { 
          success: false, 
          error: `O veículo ${brand} ${model} não foi encontrado na tabela FIPE oficial para o ano modelo ${yearModel}.` 
        },
        { status: 404 }
      );
    }
    const { data: similarOffers, error: similarError } = await supabaseAdmin
      .from('repassecentral')
      .select('id, modelo, ano_modelo, preco_pedido, preco_fipe, data_hora_recebimento')
      .eq('marca', brand.toUpperCase())
      .ilike('modelo', `%${firstWordModel}%`)
      .order('data_hora_recebimento', { ascending: false })
      .limit(10);

    if (similarError) {
      console.warn('[API Avaliação] Erro ao buscar ofertas similares repassecentral:', similarError.message);
    }

    // Busca também no histórico de vendas reais (varejo)
    let similarSales = null;
    try {
      const { data: salesData, error: salesError } = await supabaseAdmin
        .from('sales')
        .select('id, vehicle_name, sale_value, profit_margin, sale_date')
        .ilike('vehicle_name', `%${firstWordModel}%`)
        .order('sale_date', { ascending: false })
        .limit(10);

      if (salesError) throw salesError;
      similarSales = salesData;
    } catch (salErr: any) {
      console.warn('[API Avaliação] Erro ao buscar vendas similares:', salErr.message);
    }

    // Consolidação de repasses de ambas as fontes (repassecentral e offers)
    let allOffers = [];
    
    // Mapeia ofertas de repassecentral
    if (similarOffers) {
      for (const o of similarOffers) {
        const askPrice = Number(o.preco_pedido) || 0;
        const fipePrice = Number(o.preco_fipe) || 0;
        const year = o.ano_modelo && String(o.ano_modelo).toLowerCase() !== 'null'
          ? Number(String(o.ano_modelo).replace(/[^\d]/g, '').slice(0, 4))
          : yearModel;
          
        if (askPrice > 0 && fipePrice > 0) {
          allOffers.push({
            id: o.id,
            model: o.modelo,
            year_model: year,
            ask_price: askPrice,
            fipe_price: fipePrice,
            created_at: o.data_hora_recebimento,
            source: 'repassecentral'
          });
        }
      }
    }

    // Busca em offers
    try {
      const { data: offersData } = await supabaseAdmin
        .from('offers')
        .select('id, model, year_model, ask_price, fipe_price_official, fipe_price, posted_at')
        .eq('brand', brand.toUpperCase())
        .ilike('model', `%${firstWordModel}%`)
        .order('posted_at', { ascending: false })
        .limit(10);

      if (offersData) {
        for (const o of offersData) {
          const askPrice = Number(o.ask_price) || 0;
          const fipePrice = Number(o.fipe_price_official || o.fipe_price) || 0;
          if (askPrice > 0 && fipePrice > 0) {
            allOffers.push({
              id: o.id,
              model: o.model,
              year_model: o.year_model,
              ask_price: askPrice,
              fipe_price: fipePrice,
              created_at: o.posted_at,
              source: 'offers'
            });
          }
        }
      }
    } catch (offErr) {
      console.warn('[API Avaliação] Erro ao buscar em offers:', offErr);
    }

    // Remove duplicados de allOffers (por modelo+ano+preço)
    const seenOffers = new Set();
    const uniqueOffers = [];
    for (const o of allOffers) {
      const key = `${(o.model || '').toUpperCase()}_${o.year_model}_${o.ask_price}`;
      if (!seenOffers.has(key)) {
        seenOffers.add(key);
        uniqueOffers.push(o);
      }
    }

    // Ordena do mais recente para o mais antigo e limita a 10 ofertas
    uniqueOffers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const finalOffers = uniqueOffers.slice(0, 10);

    // Calcula o deságio médio de repasse verificado historicamente
    let avgRepasseDiscount = 15; // Padrão
    if (finalOffers.length > 0) {
      const discounts = finalOffers.map(o => {
        return ((o.fipe_price - o.ask_price) / o.fipe_price) * 100;
      }).filter(d => d >= 3 && d <= 45); // Filtra outliers absurdos
      
      if (discounts.length > 0) {
        const sum = discounts.reduce((acc, d) => acc + d, 0);
        avgRepasseDiscount = Math.round((sum / discounts.length) * 10) / 10;
      }
    }

    // Mapeia vendas similares
    const finalSales = [];
    let avgRetailPrice = 0;
    if (similarSales && similarSales.length > 0) {
      let salesSum = 0;
      let validSalesCount = 0;
      
      for (const s of similarSales) {
        const val = Number(s.sale_value) || 0;
        if (val > 0) {
          salesSum += val;
          validSalesCount++;
          finalSales.push({
            id: s.id,
            vehicle_name: s.vehicle_name,
            sale_value: val,
            profit_margin: Number(s.profit_margin) || 0,
            sale_date: s.sale_date
          });
        }
      }
      
      if (validSalesCount > 0) {
        avgRetailPrice = Math.round(salesSum / validSalesCount);
      }
    }

    return NextResponse.json({
      success: true,
      fipe: {
        fipe_code: fipeMatch.fipe_code,
        model_official: fipeMatch.model_official,
        fipe_price_official: fipeMatch.fipe_price_official,
        confidence: fipeMatch.confidence,
        is_estimated: !!fipeMatch.is_estimated
      },
      similarOffers: finalOffers.map(o => ({
        id: o.id,
        model: o.model,
        year_model: o.year_model,
        ask_price: o.ask_price,
        net_price: o.ask_price,
        fipe_price_official: o.fipe_price,
        created_at: o.created_at
      })),
      similarSales: finalSales,
      avgRepasseDiscount,
      avgRetailPrice
    });

  } catch (error: any) {
    console.error('[API Avaliação] Erro geral:', error.message);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao processar a avaliação.' },
      { status: 500 }
    );
  }
}
