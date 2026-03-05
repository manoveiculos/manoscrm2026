import { GoogleGenerativeAI, Part } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function analyzeMultiModalChat(
  chatText: string,
  attachments: { name: string; data: string; mimeType: string }[],
  leadName?: string
) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Analise profundamente TODO o histórico da seguinte conversa entre o vendedor e o cliente ${leadName || 'Interessado'}, de cima para baixo (cronológico). 
             
  Instruções:
  - Respeite estritamente a cronologia das DATAS e HORÁRIOS.
  - O TOPO do texto é o INÍCIO (primeira mensagem). A PARTE INFERIOR é o FINAL (última mensagem).
  - Jamais inverta a ordem dos fatos. Use os timestamps [DD/MM/AAAA HH:MM:SS] como guia.
  - Considere os arquivos anexos para contexto adicional.
  
  DIRETRIZES DE PONTUAÇÃO (SEJA RIGOROSO):
  - O score vai de 0 a 100.
  - 0-20: Descuriosidade ou erro de contato.
  - 21-45: Curiosidade vaga.
  - 46-70: Interesse real, perguntou sobre preço/condições.
  - 71-90: Interesse alto, aceitou simulação ou agendou visita.
  - 91-100: Intenção imediata, fechamendo iminente.
  
  EXTRAIA E RESPONDA EM JSON:
  {
    "classificacao": "HOT" | "WARM" | "COLD",
    "score": number,
    "estagio_funil": "Qualificação" | "Apresentação" | "Negociação" | "Fechamento",
    "proxima_acao": string,
    "probabilidade_fechamento": number,
    "resumo_estrategico": string,
    "resumo_detalhado": string,
    "intencao_compra": string,
    "estagio_negociacao": string,
    "objecoes": string,
    "recomendacao_abordagem": string,
    "extracted_name": string | null,
    "vehicle_interest": string | null,
    "valor_investimento": string | null,
    "carro_troca": string | null,
    "metodo_compra": string | null,
    "prazo_troca": string | null,
    "behavioral_profile": {
      "perfil": string,
      "temperatura_emocional": string
    }
  }`;

  const parts: (string | Part)[] = [prompt, `TEXTO DA CONVERSA: ${chatText}`];

  for (const att of attachments) {
    parts.push({
      inlineData: {
        data: att.data.split(',')[1] || att.data, // Remove data:mime;base64, if present
        mimeType: att.mimeType
      }
    });
  }

  const result = await model.generateContent(parts);
  const response = await result.response;
  const text = response.text();

  // Clean potential markdown blocks
  const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();

  return JSON.parse(cleanJson);
}
