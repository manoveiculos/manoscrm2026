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

    if (!fipeMatch) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Não foi possível encontrar este veículo na tabela FIPE oficial. Se possível, tente especificar melhor o modelo.' 
        },
        { status: 404 }
      );
    }

    // 2. Busca ofertas reais semelhantes no banco para cálculo de deságio de mercado
    // Buscaremos ofertas da mesma marca contendo o primeiro termo do modelo
    const firstWordModel = model.trim().split(' ')[0];
    const { data: similarOffers, error: similarError } = await supabaseAdmin
      .from('repassecentral')
      .select('id, modelo, ano_modelo, preco_pedido, preco_fipe, data_hora_recebimento')
      .eq('marca', brand.toUpperCase())
      .ilike('modelo', `%${firstWordModel}%`)
      .order('data_hora_recebimento', { ascending: false })
      .limit(5);

    if (similarError) {
      console.warn('[API Avaliação] Erro ao buscar ofertas similares:', similarError.message);
    }

    // Mapeia para o formato que o frontend espera
    const mappedOffers = (similarOffers || []).map((o: any) => {
      const year = o.ano_modelo && String(o.ano_modelo).toLowerCase() !== 'null'
        ? Number(String(o.ano_modelo).replace(/[^\d]/g, '').slice(0, 4))
        : yearModel;
      
      const askPrice = Number(o.preco_pedido) || 0;
      const fipePrice = Number(o.preco_fipe) || 0;

      return {
        id: o.id,
        model: o.modelo,
        year_model: year,
        ask_price: askPrice,
        net_price: askPrice, // no repasse, o preco liquido de venda repasse e o preco pedido
        fipe_price_official: fipePrice,
        fipe_price: fipePrice,
        created_at: o.data_hora_recebimento
      };
    });

    // Remove duplicados idênticos de mappedOffers
    const seen = new Set<string>();
    const uniqueSimilarOffers = mappedOffers.filter((o: any) => {
      const key = `${(o.model || '').toUpperCase()}_${o.year_model}_${o.ask_price}_${o.fipe_price_official}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      success: true,
      fipe: {
        fipe_code: fipeMatch.fipe_code,
        model_official: fipeMatch.model_official,
        fipe_price_official: fipeMatch.fipe_price_official,
        confidence: fipeMatch.confidence,
        is_estimated: !!fipeMatch.is_estimated
      },
      similarOffers: uniqueSimilarOffers
    });

  } catch (error: any) {
    console.error('[API Avaliação] Erro geral:', error.message);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao processar a avaliação.' },
      { status: 500 }
    );
  }
}
