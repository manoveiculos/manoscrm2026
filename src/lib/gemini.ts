import { GoogleGenerativeAI, Part } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function analyzeMultiModalChat(
  chatText: string,
  attachments: { name: string; data: string; mimeType: string }[],
  leadName?: string
) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Você é o maior Especialista de Vendas Automotivas e IA da Manos Veículos. Sua missão é atuar como um "Sales Copilot" cirúrgico. Analise TODO o histórico cronológico de conversa entre o vendedor e o cliente ${leadName || 'Interessado'}.

  DIRETRIZES CIRÚRGICAS PARA O RESUMO:
  1. FOCO NO DIAGNÓSTICO: O resumo deve ir direto ao ponto. Qual a dor do cliente? O que o impede de comprar agora? Tem capacidade de pagamento clara?
  2. OBJEÇÕES OCULTAS: Leia nas entrelinhas. Se o cliente parou de responder após saber o preço, a objeção é valor. Se faz muitas perguntas técnicas, ele precisa de segurança.
  3. REGRA DO SCORE (0-100): 
     - 0-30: Sem intenção clara, curioso, ou não responde.
     - 31-60: Frio/Morno. Sondando mercado, indeciso.
     - 61-85: Quente! Discutindo parcelas, avaliando troca, pronto para test drive.
     - 86-100: Fechamento iminente. Exigindo contrato ou enviando documentos.
  4. PLANO DE AÇÃO: A "recomendação_abordagem" deve ser O QUÊ O VENDEDOR DEVE ESCREVER EXATAMENTE para destravar a venda ou forçar um SIM/NÃO. Nada de "tente ligar". Dê o script matador.

  EXTRAIA E RESPONDA EXCLUSIVAMENTE NO FORMATO JSON ABAIXO:
  {
    "classificacao": "HOT" | "WARM" | "COLD" | "FASE INICIAL DE ATENDIMENTO",
    "score": number, // Seja rigoroso
    "estagio_funil": "Qualificação" | "Apresentação" | "Negociação" | "Fechamento",
    "proxima_acao": "Ação clara (ex: Solicitar CPF para ficha)",
    "probabilidade_fechamento": number,
    "resumo_estrategico": "Resumo executivo de 2 linhas: Qual o real cenário deste Lead hoje?",
    "resumo_detalhado": "Análise profunda: Comportamento, objeções ocultas e real interesse.",
    "intencao_compra": "Baixa, Média, Alta ou Imediata",
    "estagio_negociacao": "Pesquisa, Comparação ou Decisão",
    "objecoes": "Qual o real gargalo atual? (ex: Preço, Distância, Taxa, Veículo)",
    "recomendacao_abordagem": "Script prático e matador para o vendedor enviar AGORA mesmo.",
    "extracted_name": string | null,
    "vehicle_interest": string | null,
    "valor_investimento": string | null, // Valor da parcela ou entrada que ele pode pagar
    "carro_troca": string | null,
    "metodo_compra": string | null,
    "prazo_troca": string | null,
    "behavioral_profile": {
      "perfil": "Analítico, Pragmático, Expressivo ou Afetivo",
      "temperatura_emocional": "Alta, Média ou Baixa",
      "urgencia": "Alta, Média ou Baixa"
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
