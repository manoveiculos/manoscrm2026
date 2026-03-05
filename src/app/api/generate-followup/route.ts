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
        const { leadName, context, lastInteractions, vehicle, image } = await req.json();

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ success: false, error: 'Chave de API não configurada.' }, { status: 500 });
        }

        const openai = getOpenAI();
        if (!openai) throw new Error("Falha ao inicializar OpenAI.");

        const messages: any[] = [
            {
                role: 'system',
                content: `Você é um Especialista em Reativação de Clientes IA para a Manos Veículos.
                Sua missão é analisar o histórico de um lead e gerar um diagnóstico estratégico + uma mensagem de reativação altamente persuasiva.
                
                Você deve retornar OBRIGATORIAMENTE um JSON no formato:
                {
                    "resumo_estrategico": "Breve resumo do que aconteceu com esse lead",
                    "intencao_compra": "Nível e tipo de interesse (ex: Alta - busca SUV familiar)",
                    "motivo_perda": "Por que o lead parou de responder? (baseado no histórico)",
                    "oportunidade": "Qual a melhor brecha para reativar agora?",
                    "mensagem": "Texto para WhatsApp (curto, direto, persuasivo)"
                }`
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Analise as informações abaixo e gere o diagnóstico e a mensagem de reativação para o cliente ${leadName || 'Interessado'}.
                
                        DADOS DO LEAD:
                        - Nome: ${leadName || 'Não informado'}
                        - Veículo de Interesse: ${vehicle || 'veículo do estoque'}
                        
                        CONTEXTO DA PARADA (FORNECIDO PELO VENDEDOR OU ANALISADO NO PRINT):
                        ${context || 'Analise o print da conversa se disponível.'}
                        
                        LINHA DO TEMPO (HISTÓRICO COMPLETO PARA CONTEXTO):
                        ${lastInteractions || 'Sem histórico prévio.'}
                        
                        REGRAS PARA A MENSAGEM:
                        1. Use emojis moderadamente.
                        2. Comece com uma abordagem que quebre o gelo baseada no contexto.
                        3. Termine com uma pergunta poderosa de fechamento ou convite para visita.
                        4. Máximo 3-4 parágrafos pequenos.
                        
                        Retorne APENAS o JSON.`
                    }
                ]
            }
        ];

        if (image) {
            messages[1].content.push({
                type: 'image_url',
                image_url: { url: image }
            });
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            temperature: 0.7,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("IA não retornou conteúdo.");

        const result = JSON.parse(content);

        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('Follow-up generation error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
