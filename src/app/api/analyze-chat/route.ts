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

        const { chatText, leadName, attachments, leadId } = await req.json();

        // 0. Recuperar histórico do lead se leadId estiver presente
        let historicalContext = "";
        if (leadId) {
            const realId = leadId.replace(/crm26_|main_|dist_/, '');
            const { data: lead } = await supabase
                .from('leads_manos_crm')
                .select('ai_summary, ai_reason, vehicle_interest')
                .eq('id', realId)
                .maybeSingle();

            if (lead) {
                historicalContext = `
                HISTÓRICO PRÉVIO DO CRM:
                Resumo Anterior: ${lead.ai_summary || 'Sem resumo prévio'}
                Motivos Anteriores: ${lead.ai_reason || 'Nenhum'}
                Interesse Registrado: ${lead.vehicle_interest || 'Nenhum'}
                `;
            }
        }


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
                const fullChatContext = historicalContext ? `${historicalContext}\n\nNOVA CONVERSA:\n${chatText}` : chatText;
                const aiData = await analyzeMultiModalChat(fullChatContext, attachments || [], leadName);


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
                        content: 'Você é um Analista Comercial Sênior da Manos Veículos. Sua análise é ácida, direta e focada em fechamento (Sales Copilot). Você deve priorizar a LINHA DO TEMPO de interações. Analise se o lead está evoluindo ou esfriando.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: "text",
                                text: `Analise o histórico e a nova conversa do cliente ${leadName || 'Interessado'}.
                
                ${historicalContext}

                NOVA CONVERSA PARA ANÁLISE (ORDEM CRONOLÓGICA):
                ${chatText || 'Nenhum texto de chat fornecido. Analise os anexos se disponíveis.'}
                    
                    REGRAS DE CLASSIFICAÇÃO:
                    1. FASE INICIAL DE ATENDIMENTO: Se houver pouco histórico (menos de 5 interações reais) ou apenas saudação inicial, classifique como "FASE INICIAL DE ATENDIMENTO".
                    2. PONTUAÇÃO (RIGOROSA 0-100): 
                       - 0-30: FASE INICIAL ou desinteresse. 
                       - 31-60: Interesse vago/frio. 
                       - 61-85: Interesse real, perguntas técnicas, financiamento ou visita. 
                       - 86-100: FECHAMENTO HOJE, documentos enviados ou vindo agora.

                    3. PADRÕES: Identifique se o lead está NEGLIGENCIADO (>24h sem resposta do vendedor) ou em RISCO DE PERDA.

                    EXTRAIA E RESPONDA EXCLUSIVAMENTE EM JSON:
                    {
                      "classificacao": "HOT" | "WARM" | "COLD" | "FASE INICIAL DE ATENDIMENTO",
                      "score": number,
                      "estagio_funil": "Qualificação" | "Apresentação" | "Negociação" | "Fechamento",
                      "proxima_acao": string,
                      "probabilidade_fechamento": number,
                      "resumo_estrategico": "Relatório ácido para o consultor.",
                      "resumo_detalhado": "Análise da linha do tempo e comportamento.",
                      "intencao_compra": string,
                      "estagio_negociacao": string,
                      "objecoes": "O que está impedindo a venda?",
                      "recomendacao_abordagem": "O que o consultor deve falar AGORA?",
                      "extracted_name": string | null,
                      "vehicle_interest": string | null,
                      "valor_investimento": string | null,
                      "carro_troca": string | null,
                      "metodo_compra": string | null,
                      "prazo_troca": string | null,
                      "behavioral_profile": {
                        "perfil": string,
                        "temperatura_emocional": string,
                        "urgencia": "Alta" | "Média" | "Baixa"
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
            const fullChatContext = historicalContext ? `${historicalContext}\n\nNOVA CONVERSA:\n${chatText}` : chatText;
            const aiData = await analyzeMultiModalChat(fullChatContext, attachments || [], leadName);


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
