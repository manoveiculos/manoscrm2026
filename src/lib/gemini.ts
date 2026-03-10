import { GoogleGenerativeAI, Part } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function analyzeMultiModalChat(
  chatText: string,
  attachments: { name: string; data: string; mimeType: string }[],
  leadName?: string
) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Você é o Especialista de Vendas e IA da Manos Veículos. Sua missão é analisar TODO o histórico da conversa entre o vendedor e o cliente ${leadName || 'Interessado'} de forma estratégica e cronológica.

  REGRAS DE OURO DAANÁLISE:
  1. PRIORIDADE TOTAL À LINHA DO TEMPO: Analise a evolução do interesse de cima para baixo. O que importa não é como começou, mas como está agora.
  2. REGRA "FASE INICIAL DE ATENDIMENTO": Se a conversa for curta (menos de 5-8 interações substanciais) ou apenas uma saudação inicial sem resposta clara do cliente, classifique OBRIGATORIAMENTE como "FASE INICIAL DE ATENDIMENTO".
  3. RIGOROSIDADE NO SCORE (0-100): Não use valores genéricos. 
     - 0-30: Leads iniciais, curiosos ou sem resposta.
     - 31-60: Interesse real mas frio, pouca interação.
     - 61-85: Leads quentes, perguntas técnicas, interesse em visita/financiamento.
     - 86-100: Fechamento iminente, documentação enviada ou visita confirmada HOJE.
  4. IDENTIFICAÇÃO DE PADRÕES:
     - LEADS NEGLIGENCIADOS: Identifique se o consultor demorou mais de 24h para responder uma pergunta direta.
     - LEADS EM RISCO: Cliente que estava quente mas parou de responder após o último contato do vendedor.
     - POTENCIAL DE FECHAMENTO: Cliente que avançou em etapas (preço -> troca -> financiamento).

  DIRETRIZES DE SAÍDA:
  - Responda INTEIRAMENTE em Português do Brasil.
  - O resumo deve ser ácido, direto e focado em ação (Sales Copilot).

  EXTRAIA E RESPONDA EXCLUSIVAMENTE EM JSON:
  {
    "classificacao": "HOT" | "WARM" | "COLD" | "FASE INICIAL DE ATENDIMENTO",
    "score": number,
    "estagio_funil": "Qualificação" | "Apresentação" | "Negociação" | "Fechamento",
    "proxima_acao": string,
    "probabilidade_fechamento": number,
    "resumo_estrategico": "Texto curto para o consultor sobre o estado atual do lead.",
    "resumo_detalhado": "Análise da linha do tempo e comportamento do cliente.",
    "intencao_compra": string,
    "estagio_negociacao": string,
    "objecoes": "Liste as objeções encontradas na conversa.",
    "recomendacao_abordagem": "Script ou gatilho matador para o consultor usar agora.",
    "extracted_name": string | null,
    "vehicle_interest": string | null,
    "valor_investimento": string | null,
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
