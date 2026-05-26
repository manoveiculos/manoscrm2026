import { getPricesByFipeCode, parseReferenceMonth } from './client';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();

// Lista de códigos FIPE populares no mercado de repasse brasileiro (carros mais vendidos de 2012 a 2026)
const POPULAR_FIPE_CODES = [
  '004383-4', // Chevrolet Onix 1.0 Flex Manual
  '004473-3', // Chevrolet Onix Hatch LT 1.0 Turbo Aut.
  '004474-1', // Chevrolet Onix Hatch LTZ 1.0 Turbo Aut.
  '004278-1', // Chevrolet Tracker LTZ 1.2 Turbo Aut.
  '004495-4', // Chevrolet Tracker Premier 1.2 Turbo Aut.
  '004245-5', // Chevrolet Cruze LT Sedan 1.4 Turbo Aut.
  '004399-0', // Chevrolet Prisma Sedan LT 1.0 Flex
  
  '005137-3', // VW Gol 1.0 Mi Total Flex 8V
  '005272-8', // VW Gol City (Trend) 1.0 Mi Total Flex 8V
  '005312-0', // VW Gol Trendline 1.0 T.Flex 12V 5p
  '005384-8', // VW Polo Hatch Comfortline 200 TSI 1.0 Flex Aut.
  '005510-7', // VW T-Cross Comfortline 200 TSI 1.0 Flex Aut.
  '005511-5', // VW T-Cross Highline 250 TSI 1.4 Flex Aut.
  '005545-0', // VW Nivus Comfortline 200 TSI 1.0 Flex Aut.
  '005546-8', // VW Nivus Highline 200 TSI 1.0 Flex Aut.
  '005370-8', // VW Voyage Trendline 1.6 T.Flex 8V 4p
  
  '015112-2', // Hyundai HB20 Comfort 1.0 Flex
  '015124-6', // Hyundai HB20 Comfort Plus 1.0 Flex
  '015147-5', // Hyundai HB20 Comfort Plus 1.0 Turbo Aut.
  '015146-7', // Hyundai Creta Pulse 1.6 Flex Aut.
  '015162-9', // Hyundai Creta Prestige 2.0 Flex Aut.
  
  '002028-1', // Toyota Corolla XEi 2.0 Flex Aut.
  '002100-8', // Toyota Corolla GLi 1.8 Flex Aut.
  '002170-9', // Toyota Corolla Altis Hybrid 1.8 Flex Aut.
  '002162-8', // Toyota Yaris Hatch XS 1.5 Flex Aut.
  '002115-6', // Toyota Hilux CD SRV 4x4 3.0 Diesel Aut.
  
  '005267-1', // Honda Civic LXS 1.8 Flex Aut.
  '005338-4', // Honda Civic LXR 2.0 Flex Aut.
  '005379-1', // Honda Civic Touring 1.5 Turbo Aut.
  '005383-0', // Honda HR-V EX 1.8 Flex Aut.
  '005382-1', // Honda HR-V EXL 1.8 Flex Aut.
  '005391-0', // Honda Fit EXL 1.5 Flex Aut.
  
  '001509-1', // Fiat Argo Drive 1.0 6V Flex
  '001525-3', // Fiat Argo Precision 1.8 16V Flex Aut.
  '001476-1', // Fiat Toro Freedom 1.8 16V Flex Aut.
  '001478-8', // Fiat Toro Volcano 2.0 16V Diesel 4x4 Aut.
  '001488-5', // Fiat Cronos Precision 1.8 16V Flex Aut.
  '001392-7', // Fiat Uno Vivace 1.0 Evo Fire Flex 8V
  '001416-8', // Fiat Mobi Easy 1.0 Fire Flex 5p
  '001452-4', // Fiat Mobi Like 1.0 Fire Flex 5p
  
  '003348-0', // Ford Ka Hatch SE 1.0 Flex
  '003434-7', // Ford Ka Hatch SE 1.5 Flex
  '003445-2', // Ford Ka Sedan SE 1.5 Flex
  '003383-9', // Ford EcoSport SE 1.5 Flex Aut.
  
  '089004-9', // Jeep Compass Longitude 2.0 Flex Aut.
  '089010-3', // Jeep Compass Limited 2.0 Diesel 4x4 Aut.
  '089001-4', // Jeep Renegade Sport 1.8 Flex Aut.
  '089003-0', // Jeep Renegade Longitude 1.8 Flex Aut.
  
  '017042-9', // Renault Sandero Expression 1.0 Flex
  '017044-5', // Renault Sandero Stepway 1.6 Flex
  '017079-8', // Renault Duster Dynamique 1.6 Flex Aut.
  
  '024223-3', // Nissan Kicks SV 1.6 Flex Aut.
  '024224-1', // Nissan Kicks SL 1.6 Flex Aut.
  
  '006323-1', // Mitsubishi L200 Triton Savana 3.2 Diesel
  
  '073007-6', // CAOA Chery Tiggo 5X TXS 1.5 Turbo Flex Aut.
  '073017-3'  // CAOA Chery Tiggo 8 TXS 1.6 Turbo GDI Aut.
];

export interface SyncProgress {
  processed: number;
  total: number;
  inserted: number;
  errors: number;
  logs: string[];
}

/**
 * Executa a sincronização dos dados da FIPE para a lista de veículos populares.
 * Faz chamadas à BrasilAPI e salva no banco de dados.
 */
export async function syncFipeCache(onProgress?: (progress: SyncProgress) => void): Promise<SyncProgress> {
  const logs: string[] = [];
  const status: SyncProgress = {
    processed: 0,
    total: POPULAR_FIPE_CODES.length,
    inserted: 0,
    errors: 0,
    logs
  };

  const logMessage = (msg: string) => {
    console.log(msg);
    logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);
    if (onProgress) onProgress({ ...status });
  };

  logMessage(`Iniciando sincronização de ${POPULAR_FIPE_CODES.length} códigos FIPE populares...`);

  for (const fipeCode of POPULAR_FIPE_CODES) {
    try {
      logMessage(`Consultando FIPE ${fipeCode} na BrasilAPI...`);
      const prices = await getPricesByFipeCode(fipeCode);

      if (prices && prices.length > 0) {
        logMessage(`Encontrados ${prices.length} anos/modelos para o código ${fipeCode}. Gravando no banco...`);
        
        const rowsToUpsert = prices.map(p => {
          // Remove formatação de preço da BrasilAPI (ex: "R$ 98.500,00" -> 98500)
          const priceClean = Number(p.valor.replace(/[^\d]/g, '')) / 100;
          
          return {
            fipe_code: p.codigoFipe,
            reference_month: parseReferenceMonth(p.mesReferencia),
            brand: p.marca.toUpperCase(),
            model: p.modelo,
            year_model: p.anoModelo,
            fuel: p.combustivel.toUpperCase(),
            price: priceClean,
            fetched_at: new Date().toISOString()
          };
        });

        // Grava no banco usando upsert baseado na nova chave composta
        const { error: upsertError } = await supabaseAdmin
          .from('fipe_cache')
          .upsert(rowsToUpsert, { 
            onConflict: 'fipe_code,year_model,reference_month' 
          });

        if (upsertError) {
          console.error(`Erro ao inserir dados FIPE ${fipeCode}:`, upsertError);
          logMessage(`❌ Erro ao salvar dados no banco para o código ${fipeCode}.`);
          status.errors++;
        } else {
          status.inserted += rowsToUpsert.length;
          logMessage(`✅ Código FIPE ${fipeCode} atualizado com sucesso.`);
        }
      } else {
        logMessage(`⚠️ Código FIPE ${fipeCode} não retornou dados de preço.`);
        status.errors++;
      }
    } catch (err: any) {
      console.error(`Erro ao processar código FIPE ${fipeCode}:`, err);
      logMessage(`❌ Falha crítica ao processar código ${fipeCode}: ${err.message}`);
      status.errors++;
    }

    status.processed++;
    if (onProgress) onProgress({ ...status });

    // Pequeno intervalo entre requisições para evitar rate limiting da BrasilAPI
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  logMessage(`Sincronização concluída! Total de registros gravados no cache: ${status.inserted}.`);
  return status;
}
