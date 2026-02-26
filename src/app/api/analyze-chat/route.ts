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
            
            DIRETRIZES DE PONTUAÇÃO:
            - Se o cliente NÃO demonstrou interesse claro, se a conversa foi muito curta ou se não há resumo possível, o score DEVE ser 0.
            - O score vai de 0 a 100, onde 100 é intenção imediata de fechar negócio.
            
            EXTRAIA E RESPONDA EM JSON:
            {
              "classificacao": "HOT" | "WARM" | "COLD",
              "score": number (0-100),
              "estagio_funil": string (ex: 'Qualificação', 'Negociação'),
              "proxima_acao": string (sugestão prática para o vendedor),
              "probabilidade_fechamento": number (0-100),
              "resumo_estrategico": string (resumo de 1 frase),
              "resumo_detalhado": string (parágrafo detalhado com tudo o que foi extraído para histórico),
              
              "extracted_name": string | null,
              "vehicle_interest": string | null,
              "valor_investimento": string | null,
              "carro_troca": string | null,
              "metodo_compra": string | null,
              "prazo_troca": string | null
            }
            
            Considere: Urgência, Interesse financeiro, Interesse em visita, Tempo de resposta, Clareza na intenção.
            Retorne APENAS o JSON.`
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
