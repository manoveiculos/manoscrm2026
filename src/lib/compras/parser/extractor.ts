import { callClaude } from '../ai';

export interface ExtractedOffer {
  brand: string;
  model: string;
  year_model: number;
  year_manufacture: number | null;
  fuel: 'FLEX' | 'GASOLINA' | 'DIESEL' | 'HIBRIDO' | 'ELETRICO' | null;
  transmission: 'MANUAL' | 'AUTOMATICO' | null;
  km: number;
  plate_end: string | null;
  fipe_price: number | null;
  ask_price: number;
  tires: string | null;
  optionals: string[];
  expenses: string | null;
  notes: string | null;
  has_manual: boolean | null;
  has_spare_key: boolean | null;
  recovered_accident: boolean;
  seller_name: string | null;
  seller_phone: string | null;
  location: string | null;
  confidence: number;
}

const EXTRACTION_PROMPT = `
Você é um especialista em parsing de ofertas de veículos de grupos de WhatsApp de repasse no Brasil.

A mensagem pode estar em vários formatos (Flash Car, VAAPTY, AutoPay, Alto Vale, MVJP, livre).
Extraia TUDO que conseguir identificar e devolva APENAS JSON válido neste schema. Não inclua nenhuma explicação, texto introdutório ou markdown além do próprio bloco JSON.

Schema esperado:
{
  "brand": "string (marca oficial em caixa alta, ex: CHEVROLET, VOLKSWAGEN, FIAT. DEDUZA com inteligência a partir do modelo do veículo caso a marca não esteja explícita na mensagem. Ex: se o modelo for 'Compass', preencha 'JEEP')",
  "model": "string (modelo completo, ex: TRACKER LTZ 1.2 TURBO)",
  "year_model": "number (ano modelo)",
  "year_manufacture": "number ou null (ano fabricação se diferente, ex: se '2020/2021', ano fabricação é 2020 e ano modelo é 2021)",
  "fuel": "FLEX|GASOLINA|DIESEL|HIBRIDO|ELETRICO|null",
  "transmission": "MANUAL|AUTOMATICO|null",
  "km": "number",
  "plate_end": "string ou null (última letra/dígito da placa se fornecido, ex: 'Q' ou '6')",
  "fipe_price": "number ou null (valor da FIPE mencionado na mensagem original)",
  "ask_price": "number (preço anunciado de venda)",
  "tires": "string ou null (ex: '4 BONS', '2 BONS + 2 FRACOS', etc)",
  "optionals": ["array de strings, ex: ['MULTIMIDIA', 'COURO', 'TETO SOLAR']"],
  "expenses": "string ou null (descrição de gastos pendentes mencionados, ex: '4 PEÇAS, MARTELINHO')",
  "notes": "string ou null (observações relevantes)",
  "has_manual": "boolean ou null (indicar se possui manual de instruções)",
  "has_spare_key": "boolean ou null (indicar se possui chave reserva)",
  "recovered_accident": "boolean (true se a mensagem contiver expressões como 'recuperado', 'recuperado de sinistro', 'sinistrado', 'leilão' ou 'com passagem por leilão')",
  "seller_name": "string ou null",
  "seller_phone": "string ou null (número de contato mencionado na mensagem, se houver)",
  "location": "string ou null (cidade/estado mencionado, ex: 'JOINVILLE-SC')",
  "confidence": "number 0.0-1.0 (sua confiança na exatidão da extração)"
}

REGRAS CRÍTICAS:
- Se a marca não estiver explícita na mensagem, use seu conhecimento sobre marcas e modelos do mercado brasileiro para DEDUZIR de forma inteligente a marca a partir do modelo (ex: 'Tracker' -> CHEVROLET, 'Gol' -> VOLKSWAGEN, 'Civic' -> HONDA, 'HB20' -> HYUNDAI, 'Compass' -> JEEP, 'Dolphin' -> BYD). Retorne null apenas se o veículo não puder ser identificado de forma alguma.
- Preços: ignore "R$", retire pontos de milhar, vírgula vira ponto decimal (ex: "R$ 59.900,00" vira 59900).
- KM: retire pontos e vírgulas, devolva inteiro (ex: "45.000 km" vira 45000).
- Se houver múltiplos preços (ex: "Fipe X / Venda Y" ou "Fipe R$ 80k e vendo por R$ 72k"), o ask_price is SEMPRE o preço de VENDA/REPASSE/REPASSO.
- A marca (brand) deve vir sempre em CAIXA ALTA (ex: "CHEVROLET", "FIAT", "FORD", "VOLKSWAGEN").
- Se a mensagem NÃO for de fato uma oferta de veículo, retorne {"confidence": 0, "brand": "", "model": "", "year_model": 0, "km": 0, "ask_price": 0, "recovered_accident": false, "optionals": []}.
`;

export async function extractOffer(content: string): Promise<ExtractedOffer | null> {
  try {
    const response = await callClaude({
      model: 'claude-3-5-sonnet-20241022',
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content }],
      temperature: 0,
      maxTokens: 1200,
    });

    // Sanitiza a resposta para isolar o JSON caso a API envie tags de markdown adicionais
    let jsonString = response.trim();
    const jsonStart = jsonString.indexOf('{');
    const jsonEnd = jsonString.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
    }

    const data = JSON.parse(jsonString);

    // Se a confiança for 0 ou se dados fundamentais estiverem vazios, considera inválido
    if (data.confidence === 0 || !data.brand || !data.model || !data.ask_price) {
      return extractOfferFallback(content);
    }

    return {
      brand: data.brand.toUpperCase(),
      model: data.model,
      year_model: Number(data.year_model),
      year_manufacture: data.year_manufacture ? Number(data.year_manufacture) : null,
      fuel: data.fuel || null,
      transmission: data.transmission || null,
      km: Number(data.km) || 0,
      plate_end: data.plate_end ? String(data.plate_end) : null,
      fipe_price: data.fipe_price ? Number(data.fipe_price) : null,
      ask_price: Number(data.ask_price),
      tires: data.tires || null,
      optionals: Array.isArray(data.optionals) ? data.optionals : [],
      expenses: data.expenses || null,
      notes: data.notes || null,
      has_manual: data.has_manual !== undefined ? data.has_manual : null,
      has_spare_key: data.has_spare_key !== undefined ? data.has_spare_key : null,
      recovered_accident: !!data.recovered_accident,
      seller_name: data.seller_name || null,
      seller_phone: data.seller_phone || null,
      location: data.location || null,
      confidence: Number(data.confidence) || 0.8,
    };
  } catch (error) {
    console.warn('Erro ao fazer extração estruturada via Claude, acionando fallback local baseado em Regex:', error);
    return extractOfferFallback(content);
  }
}

export function deduceBrandFromText(textUpper: string): string | null {
  const modelToBrandMap: { [key: string]: string[] } = {
    CHEVROLET: ['TRACKER', 'ONIX', 'PRISMA', 'CRUZE', 'S10', 'SPIN', 'MONTANA', 'CELTA', 'CORSA', 'ASTRA', 'VECTRA', 'MERIVA', 'ZAFIRA', 'TRAILBLAZER', 'EQUINOX', 'CHEVY', 'CLASSIC', 'COBALT', 'JOY', 'OPALA', 'KADETT', 'MONZA', 'CAPTIVA', 'SONIC'],
    VOLKSWAGEN: ['GOL', 'VOYAGE', 'SAVEIRO', 'POLO', 'VIRTUS', 'T-CROSS', 'TCROSS', 'NIVUS', 'AMAROK', 'JETTA', 'UP!', 'UP ', 'FOX', 'GOLF', 'TIGUAN', 'FUSCA', 'CROSSFOX', 'SPACEFOX', 'BORA', 'PASSAT', 'SANTANA', 'TAOS', 'KOMBI'],
    FIAT: ['UNO', 'PALIO', 'ARGO', 'CRONOS', 'MOBI', 'TORO', 'STRADA', 'SIENA', 'PUNTO', 'LINEA', 'DUCATO', 'FIORINO', 'FASTBACK', 'PULSE', 'MAREA', 'STILO', 'IDEA', 'DOBLO', 'BRAVO', 'TEMPRA'],
    FORD: ['KA ', 'KA+', 'FIESTA', 'FOCUS', 'ECOSPORT', 'RANGER', 'FUSION', 'TERRITORY', 'BRONCO', 'ESCORT', 'MONDEO', 'EDGE', 'COURIER'],
    TOYOTA: ['COROLLA', 'HILUX', 'ETIOS', 'YARIS', 'SW4', 'PRIUS', 'RAV4', 'CAMRY', 'CORONA', 'FIELDER', 'BANDEIRANTE'],
    HONDA: ['CIVIC', 'FIT', 'CITY', 'HR-V', 'HRV', 'CR-V', 'CRV', 'WR-V', 'WRV', 'ACCORD'],
    HYUNDAI: ['HB20', 'CRETA', 'TUCSON', 'IX35', 'SANTA FE', 'AZERA', 'ELANTRA', 'I30', 'VELOSTER', 'SONATA', 'HR '],
    RENAULT: ['SANDERO', 'LOGAN', 'DUSTER', 'KWID', 'OROCH', 'CAPTUR', 'MEGANE', 'CLIO', 'FLUENCE', 'SCENIC', 'MASTER', 'SYMBOL', 'KANGOO'],
    PEUGEOT: ['208', '2008', '3008', '308', '408', '207', '206', '307', 'PARTNER', 'BOXER'],
    CITROEN: ['C3', 'C4', 'AIRCROSS', 'JUMPER', 'XSARA', 'PICASSO', 'BERLINGO'],
    JEEP: ['COMPASS', 'RENEGADE', 'COMMANDER', 'WRANGLER', 'CHEROKEE', 'GRAND CHEROKEE'],
    NISSAN: ['KICKS', 'FRONTIER', 'VERSA', 'MARCH', 'SENTRA', 'TIIDA', 'LIVINA'],
    MITSUBISHI: ['L200', 'PAJERO', 'ASX', 'OUTLANDER', 'ECLIPSE CROSS', 'LANCER', 'TRITON'],
    CHERY: ['TIGGO', 'ARRIZO', 'QQ'],
    BYD: ['DOLPHIN', 'SEAL', 'SONG', 'YASAN', 'HAN', 'TAN', 'YUAN'],
    GWM: ['HAVAL', 'ORA', 'POER'],
    BMW: ['320I', '328I', '316I', '318I', 'X1', 'X3', 'X5', 'X6', 'M3', 'M4', 'M5', '118I', '120I', '325I', '330I'],
    MERCEDES: ['C180', 'C200', 'C250', 'A200', 'CLA', 'GLA', 'GLC', 'GLE', 'SPRINTER', 'SLK'],
    AUDI: ['A3', 'A4', 'A5', 'Q3', 'Q5', 'A1', 'A6', 'Q7', 'TT'],
    VOLVO: ['XC40', 'XC60', 'XC90', 'V40', 'V60', 'C30'],
    LAND_ROVER: ['EVOQUE', 'DISCOVERY', 'RANGE ROVER', 'DEFENDER', 'VELAR'],
    KIA: ['SPORTAGE', 'CERATO', 'PICANTO', 'SORENTO', 'SOUL', 'BONGO'],
    RAM: ['RAM 1500', 'RAM 2500', 'RAM 3500', 'RAMPAGE'],
    PORSCHE: ['911', 'CAYENNE', 'MACAN', 'BOXSTER', 'CAYMAN', 'PANAMERA', 'TAYCAN'],
    SUZUKI: ['JIMNY', 'VITARA', 'GRAND VITARA', 'SWIFT'],
    TROLLER: ['T4'],
  };

  for (const [brand, models] of Object.entries(modelToBrandMap)) {
    for (const model of models) {
      const escapedModel = model.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp('\\b' + escapedModel + '\\b|\\b' + escapedModel + '$', 'i');
      if (regex.test(textUpper)) {
        return brand;
      }
    }
  }
  
  return null;
}

// Fallback robusto baseado em regex e heurísticas locais para extração de ofertas em português
export function extractOfferFallback(content: string): ExtractedOffer | null {
  const BRANDS = [
    'CHEVROLET', 'FIAT', 'VOLKSWAGEN', 'FORD', 'TOYOTA', 'HONDA', 'HYUNDAI',
    'RENAULT', 'PEUGEOT', 'CITROEN', 'JEEP', 'NISSAN', 'MITSUBISHI', 'CHERY',
    'BMW', 'MERCEDES', 'AUDI', 'VOLVO', 'LAND ROVER', 'KIA', 'RAM', 'PORSCHE',
    'BYD', 'GWM', 'SUZUKI', 'TROLLER'
  ];

  const contentUpper = content.toUpperCase();
  
  // 1. Detectar Marca
  let brand = '';
  for (const b of BRANDS) {
    if (contentUpper.includes(b)) {
      brand = b;
      break;
    }
  }
  
  if (!brand) {
    if (contentUpper.includes('CHEVY') || contentUpper.includes('GM ')) brand = 'CHEVROLET';
    else if (contentUpper.includes('VW')) brand = 'VOLKSWAGEN';
    else if (contentUpper.includes('MERCEDES-BENZ') || contentUpper.includes('MB ')) brand = 'MERCEDES';
    else {
      const deduced = deduceBrandFromText(contentUpper);
      brand = deduced || 'OUTROS';
    }
  }

  // 2. Preços (ask_price e fipe_price)
  // Busca valores precedidos por cifrão ou termos chave
  const priceMatches = content.match(/(?:R\$|R\s*\$|valor|por|venda|repasse|vender|fipe)\s*[:\-]?\s*(\d{2,3}(?:\.\d{3})*(?:,\d{2})?)/gi) || [];
  let prices = priceMatches.map(m => {
    const clean = m.replace(/[^\d]/g, '');
    return parseInt(clean, 10);
  }).filter(p => p > 5000 && p < 1500000);

  // Fallback geral de números para preço se não achar marcadores
  if (prices.length === 0) {
    const rawNumbers = content.match(/\b\d{2,3}\.\d{3}\b/g) || [];
    prices = rawNumbers.map(n => parseInt(n.replace('.', ''), 10));
  }

  let ask_price = 0;
  let fipe_price: number | null = null;

  // Tenta encontrar FIPE de forma específica no texto
  const fipeIndex = contentUpper.indexOf('FIPE');
  if (fipeIndex !== -1) {
    const fipeSection = content.substring(Math.max(0, fipeIndex - 20), Math.min(content.length, fipeIndex + 30));
    const fipePriceMatch = fipeSection.match(/(\d{2,3}(?:\.\d{3})+)/);
    if (fipePriceMatch) {
      fipe_price = parseInt(fipePriceMatch[1].replace(/[^\d]/g, ''), 10);
    }
  }

  if (prices.length > 0) {
    if (fipe_price) {
      const nonFipePrices = prices.filter(p => Math.abs(p - fipe_price!) > 2000);
      ask_price = nonFipePrices.length > 0 ? nonFipePrices[0] : prices[0];
      
      // No repasse, o preço de venda é menor que a FIPE
      if (ask_price > fipe_price) {
        const temp = ask_price;
        ask_price = fipe_price;
        fipe_price = temp;
      }
    } else {
      ask_price = Math.min(...prices);
      if (prices.length > 1) {
        fipe_price = Math.max(...prices);
      }
    }
  }

  // Se mesmo assim não achou o preço anunciado, tenta pegar qualquer valor isolado de 5 ou 6 dígitos
  if (ask_price === 0) {
    const anyPrice = content.match(/\b\d{2,3}\.?\d{3}\b/);
    if (anyPrice) {
      ask_price = parseInt(anyPrice[0].replace(/[^\d]/g, ''), 10);
    }
  }

  // Se não tem preço anunciado, desiste
  if (ask_price === 0) {
    return null;
  }

  // 3. Ano Modelo / Fabricação
  const yearRangeMatch = content.match(/\b(20[0-2]\d)\/(20[0-2]\d)\b/);
  let year_model = 0;
  let year_manufacture: number | null = null;

  if (yearRangeMatch) {
    year_manufacture = parseInt(yearRangeMatch[1], 10);
    year_model = parseInt(yearRangeMatch[2], 10);
  } else {
    const singleYearMatches = content.match(/\b(19[89]\d|20[0-2]\d)\b/g) || [];
    if (singleYearMatches.length > 0) {
      const years = singleYearMatches.map(y => parseInt(y, 10));
      year_model = Math.max(...years);
    } else {
      year_model = new Date().getFullYear();
    }
  }

  // 4. KM
  const kmMatch = content.match(/(\d{1,3}(?:\.\d{3})?)\s*(?:km|mil\s*km|rodados)/i) || 
                  content.match(/km\s*[:\-]?\s*(\d{1,3}(?:\.\d{3})?)/i);
  let km = 0;
  if (kmMatch) {
    km = parseInt(kmMatch[1].replace(/[^\d]/g, ''), 10);
    if (km < 1000 && (contentUpper.includes('MIL') || contentUpper.includes('K'))) {
      km = km * 1000;
    }
  } else {
    // Procura número entre 5 e 300 que possa ser KM em "mil" (ex: 80 mil, 120k)
    const numbers = content.match(/\b\d{2,3}\b/g) || [];
    for (const num of numbers) {
      const numIdx = contentUpper.indexOf(num);
      const afterNum = contentUpper.substring(numIdx, numIdx + 15);
      if (afterNum.includes('MIL') || afterNum.includes(' K') || afterNum.includes('K ')) {
        km = parseInt(num, 10) * 1000;
        break;
      }
    }
  }

  // 5. Câmbio e combustível
  const transmission = /aut/i.test(content) ? 'AUTOMATICO' : (/man/i.test(content) ? 'MANUAL' : null);
  const fuel = /flex/i.test(content) ? 'FLEX' : 
               (/diesel/i.test(content) ? 'DIESEL' : 
               (/gasol/i.test(content) ? 'GASOLINA' : 
               (/eletri/i.test(content) ? 'ELETRICO' : 
               (/hibrid/i.test(content) ? 'HIBRIDO' : null))));

  // 6. Final de placa
  const plateMatch = content.match(/final\s*(\d)/i) || content.match(/placa\s*[a-z]{3}\s*\d[a-z0-9]\d(\d)/i);
  const plate_end = plateMatch ? plateMatch[1] : null;

  // 7. Recuperado/Sinistrado
  const recovered_accident = /recuperad|sinistr|leil[aã]o|passagem|spm/i.test(content);

  // 8. Opcionais
  const optionals: string[] = [];
  if (/teto/i.test(content)) optionals.push('TETO SOLAR');
  if (/couro/i.test(content)) optionals.push('COURO');
  if (/multimidia|tela|kit/i.test(content)) optionals.push('MULTIMIDIA');
  if (/ar\s*cond/i.test(content)) optionals.push('AR CONDICIONADO');
  if (/dire[cç][aã]o/i.test(content)) optionals.push('DIRECAO HIDRAULICA');

  // 9. Modelo do carro (busca padrão "Modelo: Valor" ou primeira linha se não achar)
  let model = '';
  const modelMatch = content.match(/(?:Modelo|Veículo)\s*:\s*\*?([^*:\n]+)\*?/i);
  if (modelMatch) {
    model = modelMatch[1].trim();
  } else {
    model = content.split('\n')[0].trim();
  }

  if (brand && model.toUpperCase().startsWith(brand)) {
    model = model.substring(brand.length).trim();
  }
  // Limpa anos e termos comuns da primeira linha do modelo
  model = model
    .replace(/\b(19[89]\d|20[0-2]\d)(?:\/(20[0-2]\d))?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (model.length < 3) {
    model = 'VEÍCULO REPASSE';
  }

  // Limites e normalização adicionais
  return {
    brand: brand || 'OUTROS',
    model: model.substring(0, 100),
    year_model,
    year_manufacture,
    fuel,
    transmission,
    km: km || 95000, // KM mediana se não encontrada
    plate_end,
    fipe_price,
    ask_price,
    tires: /pneu/i.test(content) ? 'USADO' : null,
    optionals,
    expenses: /gasto|pendencia|debit|retoc/i.test(content) ? 'REPAROS PENDENTES' : null,
    notes: 'Processado por Fallback Regex (Claude API Offline)',
    has_manual: /manual/i.test(content),
    has_spare_key: /chave/i.test(content),
    recovered_accident,
    seller_name: null,
    seller_phone: null,
    location: null,
    confidence: 0.6
  };
}
