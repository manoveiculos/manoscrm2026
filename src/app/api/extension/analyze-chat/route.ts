
import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
        const { chatText, leadName, leadId } = await req.json();

        if (!leadId) {
            return NextResponse.json({ success: false, error: 'Lead ID é obrigatório' }, { status: 400 });
        }

        const realId = leadId.replace(/crm26_|main_|dist_/, '');
        const isCrm26 = leadId.startsWith('crm26_');
        const table = isCrm26 ? 'leads_distribuicao_crm_26' : 'leads_manos_crm';

        // 1. Recuperar contexto histórico
        const { data: lead, error: fetchError } = await supabaseAdmin
            .from(table)
            .select('*')
            .eq('id', realId)
            .maybeSingle();

        if (fetchError) {
            console.error(`[AI Sync] Erro ao buscar lead ${realId} em ${table}:`, fetchError);
        }

        let historicalContext = "";
        const leadData = lead as any;
        if (leadData) {
            historicalContext = `
            HISTÓRICO PRÉVIO DO CRM:
            Resumo Anterior: ${leadData.ai_summary || leadData.resumo || 'Sem resumo prévio'}
            Motivos Anteriores: ${leadData.ai_reason || 'Nenhum'}
            Interesse Registrado: ${leadData.vehicle_interest || leadData.interesse || 'Nenhum'}
            `;
        }

        const openai = getOpenAI();
        if (!openai) throw new Error("OpenAI API Key não configurada.");

        console.log(`[AI Sync] Iniciando análise para: ${leadName} (${realId})`);

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Você é um Analista Comercial Sênior da Manos Veículos. Sua análise é focada em fechamento e organização da linha do tempo.'
                },
                {
                    role: 'user',
                    content: `Analise a nova conversa do cliente ${leadName || 'Interessado'}.
                
                    ${historicalContext}

                    NOVA CONVERSA PARA ANÁLISE:
                    ${chatText}
                        
                    EXTRAIA E RESPONDA EXCLUSIVAMENTE EM JSON:
                    {
                      "classificacao": "HOT" | "WARM" | "COLD" | "FASE INICIAL DE ATENDIMENTO",
                      "score": number,
                      "resumo_detalhado": "Análise da linha do tempo e comportamento para fixar no CRM.",
                      "proxima_acao": "O que o consultor deve fazer agora?"
                    }`
                }
            ],
            response_format: { type: "json_object" }
        });

        const aiContent = response.choices[0]?.message?.content || '{}';
        console.log("[AI Sync] Resposta OpenAI:", aiContent);
        const aiData = JSON.parse(aiContent);

        // 2. Atualizar o Lead com o novo resumo na linha do tempo
        const now = new Date();
        const timestamp = now.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const newSummaryEntry = `[SYNC ${timestamp}]: ${aiData.resumo_detalhado || 'Sem resumo detalhado'}`;

        let finalSummary = "";
        if (isCrm26) {
            const currentResumo = leadData?.resumo || "";
            finalSummary = `${newSummaryEntry}\n\n${currentResumo}`;
        } else {
            const currentSummary = leadData?.ai_summary || "";
            finalSummary = `${newSummaryEntry}\n\n${currentSummary}`;
        }

        const updatePayload: any = {
            ai_classification: aiData.classificacao || 'WARM',
            ai_score: aiData.score || 50,
            proxima_acao: aiData.proxima_acao || ''
        };

        if (isCrm26) {
            updatePayload.resumo = finalSummary;
        } else {
            updatePayload.ai_summary = finalSummary;
        }

        console.log("[AI Sync] Atualizando lead com payload:", updatePayload);

        const { error: updateError } = await supabaseAdmin
            .from(table)
            .update(updatePayload)
            .eq('id', realId);

        if (updateError) {
            console.error("[AI Sync] Erro no update Supabase:", updateError);
            throw updateError;
        }

        return NextResponse.json({
            success: true,
            ai_summary: newSummaryEntry,
            classification: aiData.classificacao
        });

    } catch (err: any) {
        console.error("Extension Analyze AI Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
