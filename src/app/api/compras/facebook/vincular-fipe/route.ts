import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { getPricesByFipeCode, parseReferenceMonth } from '@/lib/compras/fipe/client';

const supabaseAdmin = createClient();

const extractYear = (anoStr: string): number => {
  if (!anoStr) return new Date().getFullYear() - 5;
  const matches = anoStr.match(/\d{4}/);
  if (matches) {
    return parseInt(matches[0], 10);
  }
  return new Date().getFullYear() - 5;
};

const extractKm = (kmStr: string): number => {
  if (!kmStr) return 80000;
  const clean = kmStr.replace(/[^\d]/g, '');
  if (clean) {
    return parseInt(clean, 10);
  }
  return 80000;
};

const extractValue = (valStr: string): number => {
  if (!valStr) return 0;
  const clean = valStr.replace(/[^\d]/g, '');
  if (clean) {
    return parseInt(clean, 10);
  }
  return 0;
};

export async function POST(request: NextRequest) {
  try {
    const { mensagem_id, fipe_code } = await request.json();

    if (!mensagem_id || !fipe_code) {
      return NextResponse.json(
        { success: false, error: 'mensagem_id e fipe_code são obrigatórios.' },
        { status: 400 }
      );
    }

    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('veiculosdecompraanunciofacebook')
      .update({ fipe_code })
      .eq('mensagem_id', mensagem_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    const lead = updateData;

    let dataFormatada = 'N/A';
    if (lead.data_envio) {
      try {
        const date = new Date(lead.data_envio);
        dataFormatada = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);
      } catch (e) {}
    }

    const yearModel = extractYear(lead.ano);
    const km = extractKm(lead.km);
    const valorPedido = extractValue(lead.valor_pedido);

    let fipe_price = null;
    let fipe_model = null;
    let fipe_pct = null;
    let deal_score = null;
    let is_estimated = false;

    const { data: cacheData } = await supabaseAdmin
      .from('fipe_cache')
      .select('fipe_code, model, price')
      .eq('fipe_code', fipe_code)
      .eq('year_model', yearModel)
      .limit(1);

    let fipeMatch: {
      fipe_code: string;
      fipe_price_official: number;
      model_official: string;
      confidence: number;
      is_estimated?: boolean;
    } | null = null;

    if (cacheData && cacheData.length > 0) {
      fipeMatch = {
        fipe_code: cacheData[0].fipe_code,
        fipe_price_official: Number(cacheData[0].price),
        model_official: cacheData[0].model,
        confidence: 1.0
      };
    } else {
      try {
        const prices = await getPricesByFipeCode(fipe_code);
        const priceForYear = prices.find((p: any) => p.anoModelo === yearModel);
        if (priceForYear) {
          const priceClean = Number(priceForYear.valor.replace(/[^\d]/g, '')) / 100;
          
          const referenceMonth = parseReferenceMonth(priceForYear.mesReferencia);
          await supabaseAdmin
            .from('fipe_cache')
            .upsert({
              fipe_code: fipe_code,
              reference_month: referenceMonth,
              brand: lead.veiculo ? lead.veiculo.trim().split(' ')[0].toUpperCase() : 'OUTROS',
              model: priceForYear.modelo,
              year_model: yearModel,
              fuel: priceForYear.combustivel.toUpperCase(),
              price: priceClean,
              fetched_at: new Date().toISOString()
            }, {
              onConflict: 'fipe_code,year_model,reference_month'
            });

          fipeMatch = {
            fipe_code: fipe_code,
            fipe_price_official: priceClean,
            model_official: priceForYear.modelo,
            confidence: 1.0
          };
        }
      } catch (onlineErr) {
        console.warn(`[Vincular FIPE API] Erro ao buscar preço online da FIPE:`, onlineErr);
      }
    }

    if (fipeMatch) {
      fipe_price = fipeMatch.fipe_price_official;
      fipe_model = fipeMatch.model_official;
      is_estimated = !!fipeMatch.is_estimated;

      if (fipe_price > 0 && valorPedido > 0) {
        let normalizedValorPedido = valorPedido;
        if (valorPedido / fipe_price > 15) {
          if (valorPedido % 1000 === 0) {
            normalizedValorPedido = Math.round(valorPedido / 1000);
          } else if (valorPedido % 100 === 0) {
            normalizedValorPedido = Math.round(valorPedido / 100);
          } else {
            normalizedValorPedido = Math.round(valorPedido / 1000);
          }
        }

        fipe_pct = Math.round((normalizedValorPedido / fipe_price) * 100);
        const desagio = 100 - fipe_pct;
        const currentYear = new Date().getFullYear();
        const age = Math.max(currentYear - yearModel, 1);
        const expectedKm = age * 12000;
        
        let kmBonus = 0;
        const kmDiff = expectedKm - km;
        if (expectedKm > 0) {
          if (kmDiff > 0) {
            kmBonus = Math.min(Math.round((kmDiff / expectedKm) * 10), 10);
          } else {
            kmBonus = Math.max(Math.round((kmDiff / expectedKm) * 5), -10);
          }
        }

        let baseScore = 50;
        if (desagio >= 0) {
          baseScore += desagio * 1.6;
        } else {
          baseScore += desagio * 2.0;
        }

        deal_score = Math.round(baseScore + kmBonus);
        deal_score = Math.max(0, Math.min(100, deal_score));
      }
    }

    return NextResponse.json({
      success: true,
      lead: {
        ...lead,
        data_envio_formatada: dataFormatada,
        fipe_price,
        fipe_model,
        fipe_pct,
        deal_score,
        is_estimated
      }
    });

  } catch (error: any) {
    console.error('[API Vincular FIPE] Erro:', error.message);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao vincular FIPE.' },
      { status: 500 }
    );
  }
}
