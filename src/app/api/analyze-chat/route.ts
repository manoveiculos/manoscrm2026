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
                      "score": number,
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
                      "valor_investimento": string | null,
                      "carro_troca": string | null,
                      "metodo_compra": string | null,
                      "prazo_troca": string | null,
                      "behavioral_profile": {
                        "perfil": "Analítico, Pragmático, Expressivo ou Afetivo",
                        "temperatura_emocional": "Alta, Média ou Baixa",
                        "urgencia": "Alta, Média ou Baixa"
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
