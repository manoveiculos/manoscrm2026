import { distance } from 'fastest-levenshtein';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();

const BASE_URL_BRASIL = 'https://brasilapi.com.br/api/fipe';
const BASE_URL_PARALLELUM = 'https://parallelum.com.br/fipe/api/v1';
const BASE_URL_FIPE_ONLINE = 'https://fipe.parallelum.com.br/api/v2';
const FIPE_ONLINE_TOKEN = process.env.FIPE_ONLINE_TOKEN;

/**
 * Realiza chamadas HTTP autenticadas para o serviço fipe.online v2.
 */
async function fetchFipeOnline(path: string): Promise<any | null> {
  if (!FIPE_ONLINE_TOKEN) return null;
  
  try {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${BASE_URL_FIPE_ONLINE}${cleanPath}`;
    
    console.log(`[Fipe Online] Consultando: ${url}`);
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${FIPE_ONLINE_TOKEN.trim()}`
      }
    });

    if (res.ok) {
      return await res.json();
    }
    
    console.warn(`[Fipe Online] Resposta inválida para ${url}: Status ${res.status}`);
  } catch (err: any) {
    console.error(`[Fipe Online] Falha de conexão para ${path}:`, err.message || err);
  }
  return null;
}

export interface BrasilApiFipePrice {
  valor: string; // Ex: "R$ 98.500,00"
  marca: string;
  modelo: string;
  anoModelo: number;
  combustivel: string;
  codigoFipe: string;
  mesReferencia: string;
  tipoVeiculo: number;
  siglaCombustivel: string;
  dataConsulta: string;
}

export interface ParallelumFipePrice {
  TipoVeiculo: number;
  Valor: string; // Ex: "R$ 120.053,00"
  Marca: string; // Ex: "GM - Chevrolet"
  Modelo: string; // Ex: "TRACKER 1.0 Turbo 12V Flex Aut. "
  AnoModelo: number;
  Combustivel: string; // Ex: "Flex"
  CodigoFipe: string; // Ex: "004526-8"
  MesReferencia: string; // Ex: "maio de 2026"
  SiglaCombustivel: string;
}

/**
 * Normaliza e limpa termos comuns de um nome de modelo de veículo.
 * Mantém espaços para comparações Levenshtein.
 */
export function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ') // substitui especiais por espaço
    .replace(/\b(12v|16v|8v|v8|flex|gasol|diesel|aut|automatico|man|manual|mec|mecanico|turbo|2p|4p)\b/g, '') // remove termos genéricos
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza de forma estrita removendo espaços e caracteres especiais.
 * Ideal para chaves de mapas, dicionários ou comparações diretas de igualdade.
 */
export function normalizeStrict(name: string): string {
  const semiClean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(12v|16v|8v|v8|flex|gasol|diesel|aut|automatico|man|manual|mec|mecanico|turbo|2p|4p)\b/g, '');
  
  return semiClean.replace(/[^a-z0-9]/g, '');
}

/**
 * Normaliza o mês de referência por extenso vindo da FIPE (ex: "maio de 2026") para o formato "YYYY-MM".
 */
export function parseReferenceMonth(mesRef: string): string {
  if (!mesRef) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const clean = mesRef.toLowerCase().trim();
  const months: { [key: string]: string } = {
    janeiro: '01',
    fevereiro: '02',
    marco: '03',
    abril: '04',
    maio: '05',
    junho: '06',
    julho: '07',
    agosto: '08',
    setembro: '09',
    outubro: '10',
    novembro: '11',
    dezembro: '12',
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12'
  };

  const yearMatch = clean.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

  let month = '01';
  for (const m in months) {
    if (clean.includes(m)) {
      month = months[m];
      break;
    }
  }

  return `${year}-${month}`;
}

/**
 * Busca todos os preços históricos e modelos associados a um código FIPE específico (via BrasilAPI, com fallback Parallelum)
 */
export async function getPricesByFipeCode(fipeCode: string): Promise<BrasilApiFipePrice[]> {
  const cleanCode = fipeCode.replace(/[^\d-]/g, '');

  // 1. Tenta Fipe.online v2 prioritariamente se o token estiver ativo
  if (FIPE_ONLINE_TOKEN) {
    try {
      console.log(`[Fipe Client] Consultando anos para FIPE ${cleanCode} via fipe.online v2...`);
      const yearsData = await fetchFipeOnline(`/cars/${cleanCode}/years`);
      if (yearsData && Array.isArray(yearsData) && yearsData.length > 0) {
        // Limita a concorrência para evitar rate limit (máximo de 15 anos)
        const activeYears = yearsData.slice(0, 15);
        console.log(`[Fipe Client] Carregando preços para ${activeYears.length} anos concorrentemente...`);
        
        const detailsList = await Promise.all(
          activeYears.map(async (y: any) => {
            try {
              const detail = await fetchFipeOnline(`/cars/${cleanCode}/years/${y.code}`);
              if (detail && detail.price) {
                return {
                  valor: detail.price,
                  marca: detail.brand,
                  modelo: detail.model,
                  anoModelo: Number(detail.modelYear),
                  combustivel: detail.fuel,
                  codigoFipe: detail.codeFipe || cleanCode,
                  mesReferencia: detail.referenceMonth,
                  tipoVeiculo: Number(detail.vehicleType || 1),
                  siglaCombustivel: detail.fuelAcronym,
                  dataConsulta: new Date().toISOString()
                } as BrasilApiFipePrice;
              }
            } catch (err: any) {
              console.warn(`[Fipe Client] Falha ao obter preço para o ano ${y.code}:`, err.message || err);
            }
            return null;
          })
        );

        const validPrices = detailsList.filter(d => d !== null) as BrasilApiFipePrice[];
        if (validPrices.length > 0) {
          console.log(`[Fipe Client] ${validPrices.length} preços obtidos com sucesso via fipe.online v2.`);
          return validPrices;
        }
      }
    } catch (fipeOnlineErr: any) {
      console.warn(`[Fipe Client] Falha ao buscar na fipe.online v2. Prosseguindo para BrasilAPI...`, fipeOnlineErr.message || fipeOnlineErr);
    }
  }
  
  // Tenta BrasilAPI com retentativas inteligentes em caso de oscilações ou rate limit
  let attempts = 3;
  while (attempts > 0) {
    try {
      const res = await fetch(`${BASE_URL_BRASIL}/preco/v1/${cleanCode}`);
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 429) {
        console.warn(`[BrasilAPI] Limite de requisições (429) para FIPE ${fipeCode}. Aguardando 1s para nova tentativa...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts--;
        continue;
      }
      break; // Outros erros (ex: 404) não se aplicam retentativa
    } catch (error) {
      console.warn(`[BrasilAPI] Erro ao consultar FIPE ${fipeCode} (Restam ${attempts - 1} tentativas):`, error);
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts--;
    }
  }

  // FALLBACK ATIVO: Se a BrasilAPI falhar, busca no banco a marca/modelo para este código e faz consulta na Parallelum
  try {
    console.log(`[Fipe Client] [Fallback] Buscando marca/modelo no banco para o código FIPE ${fipeCode}...`);
    let brand = '';
    let model = '';
    let year = 0;

    // 1. Tenta achar no fipe_cache local de qualquer ano/mes
    const { data: cacheData } = await supabaseAdmin
      .from('fipe_cache')
      .select('brand, model, year_model')
      .eq('fipe_code', cleanCode)
      .limit(1);

    if (cacheData && cacheData.length > 0) {
      brand = cacheData[0].brand;
      model = cacheData[0].model;
      year = cacheData[0].year_model;
    } else {
      // 2. Se não achar no cache, tenta na tabela de ofertas históricas
      const { data: offersData } = await supabaseAdmin
        .from('offers')
        .select('brand, model, year_model')
        .eq('fipe_code', cleanCode)
        .limit(1);

      if (offersData && offersData.length > 0) {
        brand = offersData[0].brand;
        model = offersData[0].model;
        year = offersData[0].year_model;
      }
    }

    // Se identificamos qual é o veículo a partir do código FIPE histórico
    if (brand && model) {
      console.log(`[Fipe Client] [Fallback] Veículo identificado: ${brand} ${model}. Consultando preços na Parallelum...`);
      const targetYear = year || 2018; // Fallback de ano caso não conste no banco
      const onlinePrices = await getFipePricesFromParallelum(brand, model, targetYear);

      if (onlinePrices && onlinePrices.length > 0) {
        return onlinePrices.map(o => ({
          valor: o.Valor,
          marca: o.Marca,
          modelo: o.Modelo,
          anoModelo: o.AnoModelo,
          combustivel: o.Combustivel,
          codigoFipe: o.CodigoFipe,
          mesReferencia: o.MesReferencia,
          tipoVeiculo: o.TipoVeiculo,
          siglaCombustivel: o.SiglaCombustivel,
          dataConsulta: new Date().toISOString()
        }));
      }
    }
  } catch (fallbackErr) {
    console.error(`[Fipe Client] Erro crítico no fallback da Parallelum para FIPE ${fipeCode}:`, fallbackErr);
  }

  return [];
}

/**
 * Busca e calcula o preço FIPE oficial na API da Parallelum de forma dinâmica e aproximada.
 */
export async function getFipePricesFromParallelum(
  brand: string,
  model: string,
  yearModel: number
): Promise<ParallelumFipePrice[]> {
  try {
    const isOnlineActive = !!FIPE_ONLINE_TOKEN;
    
    // 1. Busca todas as marcas de carros
    let brands: { codigo: string; nome: string }[] = [];
    if (isOnlineActive) {
      console.log(`[Fipe Client] Buscando marcas via fipe.online v2...`);
      const res = await fetchFipeOnline('/cars/brands');
      if (res && Array.isArray(res)) {
        brands = res.map((b: any) => ({
          codigo: String(b.code),
          nome: b.name
        }));
      }
    }
    
    if (brands.length === 0) {
      console.log(`[Fipe Client] Buscando marcas via Parallelum v1 pública...`);
      const brandsRes = await fetch(`${BASE_URL_PARALLELUM}/carros/marcas`);
      if (!brandsRes.ok) throw new Error('Falha ao buscar marcas do Parallelum');
      brands = await brandsRes.json();
    }
    
    // Faz o matching da marca
    const cleanBrandInput = brand.toUpperCase().trim();
    const matchedBrand = brands.find(b => {
      const nameUpper = b.nome.toUpperCase();
      return (
        cleanBrandInput.includes(nameUpper) || 
        nameUpper.includes(cleanBrandInput) ||
        (cleanBrandInput === 'CHEVROLET' && nameUpper.includes('GM')) ||
        (cleanBrandInput === 'VOLKSWAGEN' && nameUpper === 'VW')
      );
    });

    if (!matchedBrand) {
      console.warn(`Marca "${brand}" não encontrada na FIPE.`);
      return [];
    }

    // 2. Busca todos os modelos da marca encontrada
    let modelsList: { codigo: number; nome: string }[] = [];
    if (isOnlineActive) {
      console.log(`[Fipe Client] Buscando modelos para marca ${matchedBrand.nome} (${matchedBrand.codigo}) via fipe.online v2...`);
      const res = await fetchFipeOnline(`/cars/brands/${matchedBrand.codigo}/models`);
      if (res && Array.isArray(res)) {
        modelsList = res.map((m: any) => ({
          codigo: Number(m.code),
          nome: m.name
        }));
      }
    }
    
    if (modelsList.length === 0) {
      console.log(`[Fipe Client] Buscando modelos para marca ${matchedBrand.nome} (${matchedBrand.codigo}) via Parallelum v1 pública...`);
      const modelsRes = await fetch(`${BASE_URL_PARALLELUM}/carros/marcas/${matchedBrand.codigo}/modelos`);
      if (!modelsRes.ok) throw new Error('Falha ao buscar modelos do Parallelum');
      const modelsData = await modelsRes.json();
      modelsList = modelsData.modelos || [];
    }
    
    // Fuzzy matching do modelo usando Levenshtein
    const cleanInputModel = normalizeModelName(model);

    // Mapeia todos os candidatos com seus respectivos scores
    const scoredModels = modelsList.map(m => {
      const cleanCandidateModel = normalizeModelName(m.nome);
      const dist = distance(cleanInputModel, cleanCandidateModel);
      const maxLen = Math.max(cleanInputModel.length, cleanCandidateModel.length);
      
      let score = 0;
      if (cleanCandidateModel.includes(cleanInputModel)) {
        score = 0.85 + (cleanInputModel.length / cleanCandidateModel.length) * 0.14;
      } else {
        score = maxLen > 0 ? 1 - dist / maxLen : 0;
      }

      // Bônus de desempate: prioriza ligeiramente modelos comuns de 4/5 portas contra 2/3 portas
      const nameUpper = m.nome.toUpperCase();
      if (nameUpper.includes('5P') || nameUpper.includes('4P') || nameUpper.includes('5 PORTAS') || nameUpper.includes('4 PORTAS')) {
        score += 0.01;
      }

      return { model: m, score };
    });

    // Ordena do maior score para o menor
    scoredModels.sort((a, b) => b.score - a.score);

    // Filtra apenas candidatos razoáveis (score >= 0.50)
    const validCandidates = scoredModels.filter(c => c.score >= 0.50);

    if (validCandidates.length === 0) {
      console.warn(`Nenhum modelo aproximado de "${model}" encontrado na FIPE (Melhor score abaixo de 0.50).`);
      return [];
    }

    // 3. Busca concorrente otimizada: Limita o paralelismo de 45 para 8 candidatos
    const yearStr = String(yearModel);
    const candidatesToTest = validCandidates.slice(0, 8);
    console.log(`[Fipe Client] Testando ${candidatesToTest.length} candidatos concorrentemente para o ano ${yearModel}...`);

    const testResults = await Promise.all(
      candidatesToTest.map(async (candidate) => {
        try {
          let years: { codigo: string; nome: string }[] = [];
          if (isOnlineActive) {
            const res = await fetchFipeOnline(`/cars/brands/${matchedBrand.codigo}/models/${candidate.model.codigo}/years`);
            if (res && Array.isArray(res)) {
              years = res.map((y: any) => ({
                codigo: y.code,
                nome: y.name
              }));
            }
          }
          
          if (years.length === 0) {
            const yearsRes = await fetch(`${BASE_URL_PARALLELUM}/carros/marcas/${matchedBrand.codigo}/modelos/${candidate.model.codigo}/anos`);
            if (yearsRes.ok) {
              years = await yearsRes.json();
            }
          }

          const matchedYear = years.find(y => y.codigo.startsWith(yearStr) || y.nome.includes(yearStr));
          if (matchedYear) {
            return { candidate: candidate.model, matchedYear };
          }
        } catch (err: any) {
          console.warn(`[Fipe Client] Erro ao buscar ano do modelo "${candidate.model.nome}":`, err.message);
        }
        return null;
      })
    );

    const matchedCandidates = testResults.filter(r => r !== null) as { candidate: { codigo: number; nome: string }; matchedYear: { codigo: string; nome: string } }[];

    if (matchedCandidates.length === 0) {
      console.warn(`Ano modelo ${yearModel} não encontrado em nenhum dos candidatos aproximados para "${model}".`);
      return [];
    }

    // Busca o preço final limitando o paralelismo para no máximo as 5 melhores correspondências
    const targets = matchedCandidates.slice(0, 5);
    console.log(`[Fipe Client] Buscando preços finais para ${targets.length} correspondências em paralelo...`);

    const prices = await Promise.all(
      targets.map(async (m) => {
        try {
          let priceData: ParallelumFipePrice | null = null;
          
          if (isOnlineActive) {
            const res = await fetchFipeOnline(`/cars/brands/${matchedBrand.codigo}/models/${m.candidate.codigo}/years/${m.matchedYear.codigo}`);
            if (res && res.price) {
              priceData = {
                TipoVeiculo: Number(res.vehicleType || 1),
                Valor: res.price,
                Marca: res.brand,
                Modelo: res.model,
                AnoModelo: Number(res.modelYear),
                Combustivel: res.fuel,
                CodigoFipe: res.codeFipe,
                MesReferencia: res.referenceMonth,
                SiglaCombustivel: res.fuelAcronym
              };
            }
          }
          
          if (!priceData) {
            const priceRes = await fetch(`${BASE_URL_PARALLELUM}/carros/marcas/${matchedBrand.codigo}/modelos/${m.candidate.codigo}/anos/${m.matchedYear.codigo}`);
            if (priceRes.ok) {
              priceData = await priceRes.json();
            }
          }

          if (priceData) {
            const priceClean = Number(priceData.Valor.replace(/[^\d]/g, '')) / 100;
            const referenceMonth = parseReferenceMonth(priceData.MesReferencia);

            await supabaseAdmin
              .from('fipe_cache')
              .upsert({
                fipe_code: priceData.CodigoFipe,
                reference_month: referenceMonth,
                brand: brand.toUpperCase(),
                model: priceData.Modelo,
                year_model: yearModel,
                fuel: priceData.Combustivel.toUpperCase(),
                price: priceClean,
                fetched_at: new Date().toISOString()
              }, { 
                onConflict: 'fipe_code,year_model,reference_month' 
              });

            return priceData;
          }
        } catch (priceErr: any) {
          console.error(`[Fipe Client] Erro ao buscar preço final do modelo "${m.candidate.nome}":`, priceErr.message);
        }
        return null;
      })
    );

    return prices.filter(p => p !== null) as ParallelumFipePrice[];
  } catch (err: any) {
    console.error(`Erro ao buscar dados na FIPE para ${brand} ${model} ${yearModel}:`, err.message);
    return [];
  }
}
