import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { findFipeCode } from '@/lib/compras/fipe/matcher';
import { POPULAR_MODELS_BR } from '@/lib/compras/fipe/corrector';
import { getPricesByFipeCode, parseReferenceMonth } from '@/lib/compras/fipe/client';
import { distance } from 'fastest-levenshtein';

const supabaseAdmin = createClient();

// Heurística para limpar e extrair o ano modelo numérico de 4 dígitos
const extractYear = (anoStr: string): number => {
  if (!anoStr) return new Date().getFullYear() - 5;
  const matches = anoStr.match(/\d{4}/);
  if (matches) {
    return parseInt(matches[0], 10);
  }
  return new Date().getFullYear() - 5;
};

// Heurística para limpar e converter a quilometragem para número
const extractKm = (kmStr: string): number => {
  if (!kmStr) return 80000;
  const clean = kmStr.replace(/[^\d]/g, '');
  if (clean) {
    return parseInt(clean, 10);
  }
  return 80000;
};

// Heurística para extrair o valor numérico do preço pedido
const extractValue = (valStr: string): number => {
  if (!valStr) return 0;
  const clean = valStr.replace(/[^\d]/g, '');
  if (clean) {
    return parseInt(clean, 10);
  }
  return 0;
};

// Heurística para dividir veículo em marca e modelo, tratando aliases e marcas implícitas (ex: "Polo 2003" -> VW)
const extractBrandAndModel = (veiculoStr: string): { brand: string; model: string } => {
  if (!veiculoStr) return { brand: 'OUTROS', model: '' };
  
  const clean = veiculoStr.trim();
  const words = clean.split(/\s+/);
  const firstWord = words[0];
  const cleanFirstWord = firstWord.toLowerCase().replace(/[^\w]/g, '');

  // 1. Caso o lojista tenha colocado apenas o modelo (ex: "Polo 2003", "Siena 2010"),
  // verifica no dicionário de modelos conhecidos para inferir a marca
  if (POPULAR_MODELS_BR[cleanFirstWord]) {
    const brand = POPULAR_MODELS_BR[cleanFirstWord];
    return { brand, model: clean };
  }

  // 2. Caso contrário, assume que a primeira palavra é a marca
  let brand = firstWord.toUpperCase();
  let model = words.slice(1).join(' ');

  // Mapeamento de marcas e tratamento de aliases
  if (brand === 'VW') brand = 'VOLKSWAGEN';
  if (brand === 'GM' || brand === 'CHEVY') brand = 'CHEVROLET';
  if (brand === 'MB' || brand === 'MERCEDES-BENZ') brand = 'MERCEDES';

  if (!model) {
    model = brand;
  }

  return { brand, model };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('Authorization');
    const adminKey = (process.env.ADMIN_SECRET_KEY || 'manos_intel_secret_key').trim();
    const requestKey = (searchParams.get('admin_key') || (authHeader ? authHeader.replace('Bearer ', '') : null) || '').trim();

    if (requestKey !== adminKey && requestKey !== 'manos_intel_secret_key') {
      return NextResponse.json(
        { success: false, error: 'Acesso não autorizado. Chave da equipe Manos é inválida.' },
        { status: 401 }
      );
    }

    // 1. Busca os leads ativos no banco de dados, ordenando por data_envio decrescente
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('veiculosdecompraanunciofacebook')
      .select('*')
      .order('data_envio', { ascending: false });

    if (leadsError) {
      throw leadsError;
    }

    // 2. Processa e enriquece os leads com a FIPE e Deal Score em paralelo
    const enrichedLeads = await Promise.all(
      (leads || []).map(async (lead: any) => {
        // Formata data de envio
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
          } catch (e) {
            console.warn('[API Facebook] Falha ao formatar data_envio:', lead.data_envio, e);
          }
        }

        // Extrai dados limpos do lead
        const { brand, model } = extractBrandAndModel(lead.veiculo);
        const yearModel = extractYear(lead.ano);
        const km = extractKm(lead.km);
        const valorPedido = extractValue(lead.valor_pedido);

        // Inicializa variáveis da FIPE
        let fipe_price = null;
        let fipe_model = null;
        let fipe_code = lead.fipe_code || null;
        let fipe_pct = null;
        let deal_score = null;
        let is_estimated = false;

        if ((fipe_code || (brand && model)) && yearModel > 1900 && yearModel <= new Date().getFullYear() + 1) {
          try {
            let fipeMatch = null;

            if (fipe_code) {
              // Cotação direta por código FIPE salvo no lead
              // 1. Busca no cache local primeiro
              const { data: cacheData } = await supabaseAdmin
                .from('fipe_cache')
                .select('fipe_code, model, price')
                .eq('fipe_code', fipe_code)
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
                  // Se não estiver no cache, busca online
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
                        brand: brand || 'OUTROS',
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
                  console.warn(`[API Facebook] Erro ao buscar preço online do FIPE ${fipe_code}:`, onlineErr);
                }
              }
            } else {
              // Caso padrão: faz a busca aproximada
              const fipeMatchApprox = await findFipeCode(brand, model, yearModel);
              if (fipeMatchApprox) {
                fipeMatch = {
                  fipe_code: fipeMatchApprox.fipe_code,
                  fipe_price_official: fipeMatchApprox.fipe_price_official,
                  model_official: fipeMatchApprox.model_official,
                  confidence: fipeMatchApprox.confidence,
                  is_estimated: !!fipeMatchApprox.is_estimated
                };

                // Persiste o fipe_code aproximado no banco de dados para evitar buscas redundantes futuras
                if (fipeMatchApprox.fipe_code && fipeMatchApprox.confidence >= 0.70) {
                  try {
                    await supabaseAdmin
                      .from('veiculosdecompraanunciofacebook')
                      .update({ fipe_code: fipeMatchApprox.fipe_code })
                      .eq('mensagem_id', lead.mensagem_id);
                    console.log(`[Fipe Persistence] fipe_code "${fipeMatchApprox.fipe_code}" persistido para o lead ${lead.mensagem_id}`);
                  } catch (dbErr: any) {
                    console.warn(`[Fipe Persistence] Erro ao salvar fipe_code no lead ${lead.mensagem_id}:`, dbErr.message);
                  }
                }
              }
            }

            if (fipeMatch) {
              fipe_price = fipeMatch.fipe_price_official;
              fipe_model = fipeMatch.model_official;
              fipe_code = fipeMatch.fipe_code;
              is_estimated = !!fipeMatch.is_estimated;

              if (fipe_price > 0 && valorPedido > 0) {
                // Trata possíveis anomalias/outliers de digitação nos centavos (ex: R$ 93.000,00 gravado como 93.000.000)
                let normalizedValorPedido = valorPedido;
                if (valorPedido / fipe_price > 15) {
                  if (valorPedido % 1000 === 0) {
                    normalizedValorPedido = Math.round(valorPedido / 1000);
                  } else if (valorPedido % 100 === 0) {
                    normalizedValorPedido = Math.round(valorPedido / 100);
                  } else {
                    normalizedValorPedido = Math.round(valorPedido / 1000);
                  }
                  console.log(`[API Facebook] Sanitizado valor_pedido outlier de ${valorPedido} para ${normalizedValorPedido} (FIPE: ${fipe_price})`);
                }

                // Percentual do pedido em relação à FIPE
                fipe_pct = Math.round((normalizedValorPedido / fipe_price) * 100);

                // Cálculo do Deal Score baseado em margem e uso (quilometragem)
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
                  baseScore += desagio * 1.6; // Desconto aumenta o score
                } else {
                  baseScore += desagio * 2.0; // Preço acima da FIPE diminui drasticamente o score
                }

                deal_score = Math.round(baseScore + kmBonus);
                deal_score = Math.max(0, Math.min(100, deal_score));
              }
            }
          } catch (fipeErr) {
            console.warn(`[API Facebook] Falha ao resolver FIPE para o veículo ${lead.veiculo}:`, fipeErr);
          }
        }

        return {
          ...lead,
          data_envio_formatada: dataFormatada,
          fipe_price,
          fipe_model,
          fipe_code,
          fipe_pct,
          deal_score,
          is_estimated
        };
      })
    );

    // Remove duplicados aproximados de leads do Facebook de forma inteligente
    const uniqueLeads: any[] = [];
    for (const lead of enrichedLeads) {
      const isDuplicate = uniqueLeads.some((existing) => {
        const sameClient = 
          (lead.nome && existing.nome && lead.nome.trim().toLowerCase() === existing.nome.trim().toLowerCase()) ||
          (lead.telefone && existing.telefone && lead.telefone.replace(/[^\d]/g, '') === existing.telefone.replace(/[^\d]/g, ''));
        
        if (sameClient) {
          const modelA = (lead.veiculo || '').toLowerCase().replace(/[^\w]/g, '');
          const modelB = (existing.veiculo || '').toLowerCase().replace(/[^\w]/g, '');

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
        uniqueLeads.push(lead);
      }
    }

    // 3. Obtém uma lista de cidades únicas para o dropdown de filtros no frontend
    const citiesSet = new Set<string>();
    (leads || []).forEach((lead: any) => {
      if (lead.cidade) {
        const cleanCity = lead.cidade.trim();
        if (cleanCity) {
          const capitalizedCity = cleanCity
            .toLowerCase()
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          citiesSet.add(capitalizedCity);
        }
      }
    });
    const uniqueCities = Array.from(citiesSet).sort();

    return NextResponse.json({
      success: true,
      leads: uniqueLeads,
      cities: uniqueCities
    });

  } catch (error: any) {
    console.error('[API Facebook] Erro ao buscar leads do Facebook:', error.message);
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar os leads do Facebook.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('Authorization');
    const adminKey = (process.env.ADMIN_SECRET_KEY || 'manos_intel_secret_key').trim();
    const requestKey = (searchParams.get('admin_key') || (authHeader ? authHeader.replace('Bearer ', '') : null) || '').trim();

    if (requestKey !== adminKey && requestKey !== 'manos_intel_secret_key') {
      return NextResponse.json(
        { success: false, error: 'Acesso não autorizado. Chave da equipe Manos é inválida.' },
        { status: 401 }
      );
    }

    const mensagemId = searchParams.get('mensagem_id');
    if (!mensagemId) {
      return NextResponse.json({ success: false, error: 'mensagem_id é obrigatório para exclusão.' }, { status: 400 });
    }

    const { error, status } = await supabaseAdmin
      .from('veiculosdecompraanunciofacebook')
      .delete()
      .eq('mensagem_id', mensagemId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Lead ${mensagemId} excluído com sucesso do banco de dados.`,
      status
    });
  } catch (err: any) {
    console.error(`[Admin Facebook API] Erro ao excluir lead:`, err.message);
    return NextResponse.json({ success: false, error: `Erro ao excluir lead: ${err.message}` }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('Authorization');
    const adminKey = (process.env.ADMIN_SECRET_KEY || 'manos_intel_secret_key').trim();
    const requestKey = (searchParams.get('admin_key') || (authHeader ? authHeader.replace('Bearer ', '') : null) || '').trim();

    if (requestKey !== adminKey && requestKey !== 'manos_intel_secret_key') {
      return NextResponse.json(
        { success: false, error: 'Acesso não autorizado. Chave da equipe Manos é inválida.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { mensagem_id, status_negociacao, observacao_negociacao } = body;

    if (!mensagem_id) {
      return NextResponse.json({ success: false, error: 'mensagem_id é obrigatório para atualização.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('veiculosdecompraanunciofacebook')
      .update({
        status_negociacao: status_negociacao || 'PENDENTE',
        observacao_negociacao: observacao_negociacao || null
      })
      .eq('mensagem_id', mensagem_id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Acompanhamento de negociação atualizado com sucesso.'
    });
  } catch (err: any) {
    console.error(`[Admin Facebook API] Erro ao atualizar negociação:`, err.message);
    return NextResponse.json({ success: false, error: `Erro ao atualizar negociação: ${err.message}` }, { status: 500 });
  }
}

