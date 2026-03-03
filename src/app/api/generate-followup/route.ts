import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

let openaiInstance: OpenAI | null = null;

function getOpenAI() {
    if (!openaiInstance && process.env.OPENAI_API_KEY) {
        openaiInstance = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiInstance;
}

export async function POST(req: NextRequest) {
    try {
        const { leadName, context, lastInteractions, vehicle } = await req.json();

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ success: false, error: 'Chave de API não configurada.' }, { status: 500 });
        }

        const openai = getOpenAI();
        if (!openai) throw new Error("Falha ao inicializar OpenAI.");

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Você é um Consultor de Vendas de Alta Performance em uma concessionária de luxo (Manos Veículos). 
                    Sua especialidade é a REATIVAÇÃO de leads que pararam de responder.
                    Sua linguagem deve ser profissional, porém próxima, gerando curiosidade ou urgência, sem ser invasivo.`
                },
                {
                    role: 'user',
                    content: `Gere uma mensagem persuasiva de WhatsApp para reativar o cliente ${leadName || 'Interessado'}.
                    
                    DADOS DO LEAD:
                    - Nome: ${leadName || 'Não informado'}
                    - Veículo de Interesse: ${vehicle || 'veículo do estoque'}
                    
                    CONTEXTO DA PARADA (O QUE ACONTECEU):
                    ${context}
                    
                    ÚLTIMAS INTERAÇÕES DO HISTÓRICO:
                    ${lastInteractions || 'Sem histórico prévio.'}
                    
                    REGRAS:
                    1. Use emojis moderadamente.
                    2. Comece com uma abordagem que quebre o gelo baseada no contexto.
                    3. Termine com uma pergunta poderosa de fechamento ou convite para visita.
                    4. Seja curto e direto (máximo 4 parágrafos pequenos).
                    5. Se o contexto mencionar preço, foque em condições de parcelamento ou valor de avaliação da troca.
                    
                    Retorne APENAS a mensagem pronta para enviar.`
                }
            ],
            temperature: 0.7,
        });

        const message = response.choices[0]?.message?.content;

        return NextResponse.json({ success: true, message });
    } catch (error: any) {
        console.error('Follow-up generation error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
