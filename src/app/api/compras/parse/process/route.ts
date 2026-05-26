import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { isVehicleOffer } from '@/lib/compras/parser/classifier';
import { extractOffer } from '@/lib/compras/parser/extractor';
import { calculateNetPrice, calculateFipePercent } from '@/lib/compras/calc/net-price';
import { computeDealScore } from '@/lib/compras/intel/deal-score';
import { findFipeCode } from '@/lib/compras/fipe/matcher';

const supabaseAdmin = createClient();

export async function POST(req: NextRequest) {
  try {
    const { sourceId, limit = 5 } = await req.json();

    if (!sourceId) {
      return NextResponse.json({ error: 'ID da fonte (sourceId) não fornecido.' }, { status: 400 });
    }

    // 1. Busca mensagens pendentes de processamento para esta fonte
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('raw_messages')
      .select('*')
      .eq('source_id', sourceId)
      .eq('parsed', false)
      .order('sent_at', { ascending: true })
      .limit(limit);

    if (messagesError) {
      console.error('Erro ao buscar mensagens:', messagesError);
      return NextResponse.json({ error: 'Erro ao buscar mensagens pendentes do banco.' }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        success: true,
        finished: true,
        processed: 0,
        remaining: 0,
        message: 'Todas as mensagens já foram processadas.'
      });
    }

    let processedCount = 0;
    let offersCount = 0;

    for (const msg of messages) {
      try {
        // A. Classifica se é uma oferta
        const isOffer = await isVehicleOffer(msg.content);
        
        if (isOffer) {
          // B. Se for oferta, extrai os detalhes via Claude Sonnet (ou fallback local)
          const extracted = await extractOffer(msg.content);
          
          if (extracted) {
            // C. Efetua cálculos financeiros e tenta enriquecer com FIPE oficial
            const netPrice = calculateNetPrice(extracted.ask_price);
            
            // Tenta obter correspondência oficial da FIPE
            const fipeMatch = await findFipeCode(extracted.brand, extracted.model, extracted.year_model);
            
            let fipeCode: string | null = null;
            let fipePriceOfficial: number | null = null;
            let fipeMatchScore: number | null = null;
            let fipePct = extracted.fipe_price 
              ? calculateFipePercent(netPrice, extracted.fipe_price) 
              : null;

            if (fipeMatch) {
              fipeCode = fipeMatch.fipe_code;
              fipePriceOfficial = fipeMatch.fipe_price_official;
              fipeMatchScore = fipeMatch.confidence;
              // Recalcula o percentual FIPE usando o valor oficial em vez do informado na mensagem!
              fipePct = calculateFipePercent(netPrice, fipePriceOfficial);
            }

            // Normaliza modelo para busca (remove caracteres especiais, acentos, caixa baixa)
            const modelNormalized = extracted.model
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '') // remove acentos
              .replace(/[^a-z0-9\s]/g, '') // remove caracteres especiais
              .replace(/\s+/g, ' ') // remove espaços extras
              .trim();

            // D. Insere a oferta na tabela 'offers'
            const { data: offer, error: offerError } = await supabaseAdmin
              .from('offers')
              .insert({
                raw_message_id: msg.id,
                source_id: sourceId,
                brand: extracted.brand,
                model: extracted.model,
                model_normalized: modelNormalized,
                year_model: extracted.year_model,
                year_manufacture: extracted.year_manufacture,
                fuel: extracted.fuel,
                transmission: extracted.transmission,
                km: extracted.km,
                plate_end: extracted.plate_end,
                fipe_price: extracted.fipe_price,
                ask_price: extracted.ask_price,
                net_price: netPrice,
                fipe_pct: fipePct,
                fipe_code: fipeCode,
                fipe_price_official: fipePriceOfficial,
                fipe_match_score: fipeMatchScore,
                tires: extracted.tires,
                optionals: extracted.optionals,
                expenses: extracted.expenses,
                notes: extracted.notes,
                has_manual: extracted.has_manual,
                has_spare_key: extracted.has_spare_key,
                recovered_accident: extracted.recovered_accident,
                seller_name: extracted.seller_name,
                seller_phone: extracted.seller_phone,
                location: extracted.location,
                posted_at: msg.sent_at,
                raw_text: msg.content,
                parser_confidence: extracted.confidence,
                status: 'active'
              })
              .select()
              .single();

            if (offerError) {
              console.error('Erro ao inserir oferta:', offerError);
            } else if (offer) {
              offersCount++;

              // E. Calcula o Deal Score (com base na FIPE informada na oferta, já que não temos marketAvg ainda)
              const scoreResult = computeDealScore({
                year_model: offer.year_model,
                km: offer.km,
                fipe_pct: offer.fipe_pct,
                recovered_accident: offer.recovered_accident,
                expenses: offer.expenses,
                tires: offer.tires,
                has_manual: offer.has_manual,
                has_spare_key: offer.has_spare_key,
                net_price: offer.net_price
              });

              // F. Insere o Deal Score
              const { error: scoreError } = await supabaseAdmin
                .from('deal_scores')
                .insert({
                  offer_id: offer.id,
                  score: scoreResult.score,
                  rating: scoreResult.rating,
                  reasons: scoreResult.reasons
                });

              if (scoreError) {
                console.error('Erro ao salvar Deal Score:', scoreError);
              }
            }
          }
        }

        // G. Atualiza a mensagem como processada, salvando o status de classificação
        await supabaseAdmin
          .from('raw_messages')
          .update({
            parsed: true,
            is_offer: isOffer
          })
          .eq('id', msg.id);

      } catch (err) {
        console.error(`Erro ao processar mensagem individual ${msg.id}:`, err);
        // Mesmo em caso de falha, marca como parsed para evitar loop infinito
        await supabaseAdmin
          .from('raw_messages')
          .update({ parsed: true, is_offer: false })
          .eq('id', msg.id);
      }

      processedCount++;
    }

    // 2. Calcula as mensagens pendentes restantes
    const { count: remainingCount, error: countError } = await supabaseAdmin
      .from('raw_messages')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('parsed', false);

    const remaining = countError ? 0 : (remainingCount || 0);

    return NextResponse.json({
      success: true,
      finished: remaining === 0,
      processed: processedCount,
      offersFound: offersCount,
      remaining,
      message: `${processedCount} mensagens processadas. ${offersCount} ofertas de veículos extraídas.`
    });

  } catch (error) {
    console.error('Erro na rota de processamento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
