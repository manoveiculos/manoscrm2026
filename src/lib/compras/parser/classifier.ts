import { callClaude } from '../ai';

export async function isVehicleOffer(content: string): Promise<boolean> {
  // Heurística rápida primeiro (evita chamar IA para a grande maioria das mensagens)
  const hasFipe = /fipe/i.test(content);
  const hasPrice = /R\$|venda|valor|preço|por:|repasse|tabela|quiti|entrada|parcela/i.test(content);
  
  // Ano de 1980 a 2029
  const hasYear = /\b(19[89]\d|20[0-2]\d)\b/.test(content);
  
  // Sinais de KM (ex: 80.000km, 120mil km, km: 50000)
  const hasKm = /\b\d{1,3}(?:\.\d{3})?\s*(?:km|mil km|rodados)\b|km\s*[:\-]?\s*\b\d{1,3}(?:\.\d{3})?\b/i.test(content);

  // Calcula a quantidade de sinais presentes
  const signals = [hasFipe, hasPrice, hasYear, hasKm].filter(Boolean).length;
  
  // Se tiver 3 ou 4 sinais, é oferta com certeza
  if (signals >= 3) return true;
  
  // Se tiver 0 ou 1 sinal, não é oferta com certeza
  if (signals <= 1) return false;

  // Borderline (exatamente 2 sinais) → consulta Claude Haiku para decidir
  try {
    const response = await callClaude({
      model: 'claude-3-5-haiku-20241022',
      system: 'Você é um classificador especializado em classificar mensagens de grupos de WhatsApp. Responda APENAS "sim" ou "nao". A mensagem a seguir é uma oferta de venda ou repasse de veículo (carro/moto/caminhão)?',
      messages: [{ role: 'user', content }],
      maxTokens: 5,
    });
    
    return /sim/i.test(response);
  } catch (error) {
    console.error('Falha na classificação por IA, aplicando fallback heurístico conservador:', error);
    // Em caso de erro na API do Claude, vamos considerar verdadeiro se tiver pelo menos o preço e o ano
    return hasPrice && hasYear;
  }
}
