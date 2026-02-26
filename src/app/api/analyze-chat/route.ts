import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

// Inicializa a OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

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

        // 3. Chamada OpenAI usando SDK oficial e gpt-4o-mini
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Você é um Especialista em Vendas de Veículos de uma concessionária premium. Sua tarefa é analisar conversas de WhatsApp e extrair dados estruturados em JSON para auxiliar o vendedor.'
                },
                {
                    role: 'user',
                    content: `Analise a seguinte conversa entre o vendedor e o cliente ${leadName || 'Interessado'}:
            
            CONVERSA:
            ${chatText}
            
            EXTRAIA OS SEGUINTES DADOS (JSON estrito):
            - ai_score: (número 0-100) nível de interesse e prontidão para compra.
            - ai_classification: ('hot', 'warm', 'cold').
            - ai_reason: um resumo executivo de 1 parágrafo destacando a principal intenção do cliente, o carro de interesse e detalhes da troca.
            - behavioral_profile: {
                urgency: ('high', 'medium', 'low'),
                sentiment: (positivo, neutro, negativo, defensivo),
                intentions: (lista de strings: ex: 'quer ver o carro', 'reclamou do preço', 'curioso', etc)
            }
            - next_step: Uma recomendação curta (1 frase) de qual deve ser a próxima ação do vendedor para fechar o negócio.
            
            Retorne APENAS o JSON puro.`
                }
            ],
            response_format: { type: "json_object" }
        });

        // 4. Acesso seguro ao conteúdo usando a lógica solicitada
        const output_text = response.choices[0]?.message?.content;

        if (!output_text) {
            throw new Error("Resposta da OpenAI veio vazia");
        }

        // 5. Parse seguro e retorno em formato JSON consistente
        try {
            const aiData = JSON.parse(output_text);
            return NextResponse.json({
                success: true,
                ...aiData
            });
        } catch (parseError: any) {
            console.error('JSON Parse Error. Raw text:', output_text, parseError);
            throw new Error('A resposta da IA não está em formato JSON válido.');
        }

    } catch (error: any) {
        console.error('AI Chat Analysis Error:', error);

        // Tratamento de erros detalhado conforme solicitado
        return NextResponse.json({
            success: false,
            error: 'Falha na conexão com o servidor de IA',
            details: error.message || "Erro interno ao processar análise",
            code: error.code || "AI_MODERN_API_ERROR"
        }, { status: 500 });
    }
}
