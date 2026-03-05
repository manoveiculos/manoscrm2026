import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const maxDuration = 60; // Permite que a Edge Function rode por até 60 segundos (Vercel)

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};

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

export async function POST(req: NextRequest) {
    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return req.cookies.get(name)?.value
                    },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Acesso Negado: Usuário não autenticado.' },
                { status: 401 }
            );
        }

        const { chatText, leadName, attachments } = await req.json();

        // 1. Verificação de Chave de API
        const openaiKey = process.env.OPENAI_API_KEY;
        const googleKey = process.env.GOOGLE_AI_API_KEY;

        if (!openaiKey && !googleKey) {
            return NextResponse.json(
                { success: false, error: 'Falha na conexão com o servidor de IA. Nenhuma chave (OpenAI/Google) configurada.' },
                { status: 500 }
            );
        }

        // 2. Validação de Input
        if ((!chatText || chatText.length < 10) && (!attachments || attachments.length === 0)) {
            return NextResponse.json(
                { success: false, error: 'Conteúdo insuficiente para análise.' },
                { status: 400 }
            );
        }

        // 3. Decidir qual modelo usar
        const hasAudioVideo = attachments?.some((att: any) => att.mimeType.startsWith('audio/') || att.mimeType.startsWith('video/'));
        const hasImages = attachments?.some((att: any) => att.mimeType.startsWith('image/'));

        // SE TIVER ÁUDIO OU VÍDEO -> OBRIGATÓRIO GEMINI (único que suporta nativamente)
        if (hasAudioVideo && googleKey) {
            try {
                console.log("Roteando para Gemini 1.5 Flash (Audio/Video detectado)");
                const { analyzeMultiModalChat } = await import('@/lib/gemini');
                const aiData = await analyzeMultiModalChat(chatText, attachments || [], leadName);

                return NextResponse.json({
                    success: true,
                    ...aiData
                });
            } catch (geminiError) {
                console.error("Gemini failed for audio/video:", geminiError);
                if (!openaiKey) throw geminiError;
                // Fallback para OpenAI mesmo sem conseguir "ouvir" o audio, para não dar erro total
            }
        }

        // PRIORIDADE OPENAI PARA TEXTO E IMAGENS
        if (openaiKey) {
            try {
                const openai = getOpenAI();
                if (!openai) throw new Error("Falha ao inicializar OpenAI.");

                const messages: any[] = [
                    {
                        role: 'system',
                        content: 'Você é um Analista Comercial Sênior especialista em conversas de concessionária de veículos. Sua análise deve ser baseada em TODO o histórico da conversa enviado, respeitando estritamente a ordem cronológica real baseada nas datas/horários. IMPORTANTE: A primeira mensagem no TOPO do texto é o INÍCIO da conversa (mais antiga). A última mensagem na PARTE INFERIOR é o FINAL (mais recente). NÃO inverta a lógica. Use as datas [DD/MM/AAAA HH:MM:SS] para se orientar.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: "text",
                                text: `Analise profundamente TODO o histórico da seguinte conversa entre o vendedor e o cliente ${leadName || 'Interessado'}, seguindo a cronologia EXATA (do topo para baixo).
                
                HISTÓRICO COMPLETO (ORDEM CRONOLÓGICA):
                ${chatText || 'Nenhum texto de chat fornecido. Analise os anexos se disponíveis.'}
                    
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
                    }`
                            }
                        ]
                    }
                ];

                // Adicionar imagens ao prompt da OpenAI se existirem
                if (attachments && attachments.length > 0) {
                    for (const att of attachments) {
                        if (att.mimeType.startsWith('image/')) {
                            messages[1].content.push({
                                type: "image_url",
                                image_url: {
                                    url: att.data
                                }
                            });
                        }
                    }
                }

                const response = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    response_format: { type: "json_object" }
                }, { timeout: 45000 });

                const output_text = response.choices[0]?.message?.content;
                if (!output_text) throw new Error("Resposta da OpenAI vazia");

                return NextResponse.json({
                    success: true,
                    ...JSON.parse(output_text)
                });
            } catch (openaiError: any) {
                console.error("OpenAI failed:", openaiError);
                if (!googleKey) throw openaiError;
                // Fallback final para Gemini se OpenAI falhar
            }
        }

        // FALLBACK GERAL PARA GEMINI
        if (googleKey) {
            const { analyzeMultiModalChat } = await import('@/lib/gemini');
            const aiData = await analyzeMultiModalChat(chatText, attachments || [], leadName);

            return NextResponse.json({
                success: true,
                ...aiData
            });
        }

        throw new Error("Nenhum provedor de IA disponível para esta solicitação.");

    } catch (error: any) {
        console.error('AI Chat Analysis Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Falha na conexão com o servidor de IA',
            details: error.message
        }, { status: 500 });
    }
}
