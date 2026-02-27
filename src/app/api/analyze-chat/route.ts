import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

// OpenAI initialization will happen inside the handler to ensure env vars are loaded
let openaiInstance: OpenAI | null = null;

function getOpenAI() {
    if (!openaiInstance && process.env.OPENAI_API_KEY) {
        openaiInstance = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiInstance;
}

export async function POST(req: Request) {
    try {
        const { chatText, leadName } = await req.json();

        // 1. Verificação de Chave de API
        if (!process.env.OPENAI_API_KEY) {
            console.error("ERRO: OPENAI_API_KEY não configurada no .env.local");
            return NextResponse.json(
                { success: false, error: 'Falha na conexão com o servidor de IA. Chave não configurada.' },
                { status: 500 }
            );
        }

        // 2. Validação de Input
        if (!chatText || chatText.length < 10) {
            return NextResponse.json(
                { success: false, error: 'Texto da conversa muito curto para análise.' },
                { status: 400 }
            );
        }

        const openai = getOpenAI();
        if (!openai) {
            throw new Error("Falha ao inicializar OpenAI. Chave não encontrada.");
        }

        // 3. Chamada OpenAI usando SDK oficial e gpt-4o-mini
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Você é um Analista Comercial Sênior especialista em conversas de concessionária de veículos.'
                },
                {
                    role: 'user',
                    content: `Analise profundamente a seguinte conversa entre o vendedor e o cliente ${leadName || 'Interessado'}.
            
            CONVERSA:
            ${chatText}
            
            DIRETRIZES DE PONTUAÇÃO (SEJA RIGOROSO):
            - O score vai de 0 a 100. NÃO use valores padrão (como 50). Seja preciso.
            - 0-20: Descuriosidade, erro de contato, ou "descadastre-me".
            - 21-45: Curiosidade vaga, sem intenção de visita ou prazo definido.
            - 46-70: Interesse real, perguntou sobre preço/condições, mas sem pressa imediata.
            - 71-90: Interesse alto, aceitou simulação, agendou ou demonstrou interesse em visitar.
            - 91-100: Intenção imediata, pronto para fechar, documentos enviados ou vindo à loja hoje.
            
            CRITÉRIOS DE RIGOR:
            - Urgência (Quer o carro para quando?)
            - Poder de Compra (Tem entrada? Tem carro na troca?)
            - Engajamento (Responde rápido? Faz perguntas específicas?)
            - Intenção de Visita (Aceita vir à loja?)
            
            Se a conversa for insuficiente para uma análise séria, o score deve ser baixo (abaixo de 20) e a classificação COLD.
            
            EXTRAIA E RESPONDA EM JSON:
            {
              "classificacao": "HOT" | "WARM" | "COLD",
              "score": number (deve ser um valor específico, ex: 67, 82, não 50),
              "estagio_funil": "Qualificação" | "Apresentação" | "Negociação" | "Fechamento",
              "proxima_acao": string (sugestão prática e direta para o vendedor),
              "probabilidade_fechamento": number (0-100),
              "resumo_estrategico": string (Uma frase de impacto para o consultor),
              "resumo_detalhado": string (Resumo técnico completo para o histórico),
              
              "extracted_name": string | null,
              "vehicle_interest": string | null,
              "valor_investimento": string | null,
              "carro_troca": string | null,
              "metodo_compra": string | null,
              "prazo_troca": string | null,
              "behavioral_profile": {
                "perfil": string, (ex: 'Analítico', 'Decidido', 'Inseguro')
                "temperatura_emocional": string (ex: 'Calmo', 'Ansioso', 'Entusiasmado')
              }
            }
            
            Retorne APENAS o JSON. SEM blocos de código markdown.`
                }
            ],
            response_format: { type: "json_object" }
        });

        // 4. Acesso seguro ao conteúdo
        const output_text = response.choices[0]?.message?.content;

        if (!output_text) {
            throw new Error("Resposta da OpenAI veio vazia");
        }

        // 5. Parse seguro
        try {
            const aiData = JSON.parse(output_text);
            return NextResponse.json({
                success: true,
                ...aiData
            });
        } catch (parseError: any) {
            console.error('JSON Parse Error:', output_text);
            throw new Error('A resposta da IA não está em formato JSON válido.');
        }

    } catch (error: any) {
        console.error('AI Chat Analysis Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Falha na conexão com o servidor de IA',
            details: error.message
        }, { status: 500 });
    }
}
