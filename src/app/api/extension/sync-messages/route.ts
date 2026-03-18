
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

import OpenAI from 'openai';
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { leadId, messages, phone, name } = body;
        console.log(`[Sync API] Recebido: leadId=${leadId}, phone=${phone}, name=${name}, msgs=${messages?.length}`);

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
        }
        let numericId: number | null = null;
        let uuidId: string | null = null;
        let leadFound = null;
        let leadType: 'main' | 'crm26' = 'crm26';

        const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
        const last8 = cleanPhone.length >= 8 ? cleanPhone.substring(cleanPhone.length - 8) : cleanPhone;
        const last9 = cleanPhone.length >= 9 ? cleanPhone.substring(cleanPhone.length - 9) : cleanPhone;
        
        // Formatos comuns: com 55, sem 55, com 9, sem 9 no DDD
        const phoneVariants = [
            cleanPhone,
            cleanPhone.startsWith('55') ? cleanPhone.substring(2) : `55${cleanPhone}`,
            last8,
            last9
        ].filter(p => p.length >= 8);

        // 1. Resolver o ID do lead - Tentar leads_manos_crm (UUID) primeiro
        if (leadId && !leadId.startsWith('crm26_')) {
            const cleanId = leadId.replace('main_', '').replace('dist_', '');
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(cleanId)) {
                const { data: leadMain } = await supabaseAdmin
                    .from('leads_manos_crm')
                    .select('*')
                    .eq('id', cleanId)
                    .maybeSingle();
                
                if (leadMain) {
                    uuidId = leadMain.id;
                    leadFound = leadMain;
                    leadType = 'main';
                }
            }
        }

        // 2. Se não encontrou por UUID, tentar por telefone em leads_manos_crm
        if (!uuidId && cleanPhone) {
            // Busca usando várias combinações
            let query = supabaseAdmin.from('leads_manos_crm').select('*');
            
            const orConditions = phoneVariants.map(v => `phone.ilike.%${v}%`).join(',');
            const { data: leadsMain } = await query.or(orConditions).order('created_at', { ascending: false }).limit(1);
            
            if (leadsMain && leadsMain.length > 0) {
                uuidId = leadsMain[0].id;
                leadFound = leadsMain[0];
                leadType = 'main';
            }
        }

        // 3. Se não encontrou UUID, tentar leads_distribuicao_crm_26 (BigInt)
        if (!uuidId) {
            if (leadId?.startsWith('crm26_')) {
                const cleanId = leadId.replace('crm26_', '');
                if (/^\d+$/.test(cleanId)) {
                    const { data: lead26 } = await supabaseAdmin
                        .from('leads_distribuicao_crm_26')
                        .select('*')
                        .eq('id', parseInt(cleanId))
                        .maybeSingle();
                    if (lead26) {
                        numericId = lead26.id;
                        leadFound = lead26;
                        leadType = 'crm26';
                    }
                }
            }
            
            if (!numericId && cleanPhone) {
                const orConditions = phoneVariants.map(v => `telefone.ilike.%${v}%`).join(',');
                const { data: leads26 } = await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .select('*')
                    .or(orConditions)
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (leads26 && leads26.length > 0) {
                    numericId = leads26[0].id;
                    leadFound = leads26[0];
                    leadType = 'crm26';
                }
            }
        }

        if (!uuidId && !numericId) {
            console.error(`[Sync API] Falha crítica: Lead não identificado para phone=${phone}`);
            return NextResponse.json({ 
                success: false, 
                error: 'Lead não encontrado no CRM. Certifique-se que o lead já está cadastrado.' 
            }, { status: 404 });
        }

        console.log(`[Sync API] Sincronizando ${messages.length} mensagens para lead (${leadType}): ${uuidId || numericId}`);

        // 2. Preparar registros para inserção
        if (leadType === 'crm26') {
            const messagesToInsert = messages.map((m: any) => ({
                lead_id: numericId,
                message_text: m.text,
                direction: m.direction,
                created_at: m.timestamp || new Date().toISOString()
            }));

            // Deduplicação básica
            const { data: existingMsgs } = await supabaseAdmin
                .from('whatsapp_messages')
                .select('message_text, direction')
                .eq('lead_id', numericId)
                .order('created_at', { ascending: false })
                .limit(messagesToInsert.length + 50);

            const filteredMessages = messagesToInsert.filter(newMsg => {
                return !existingMsgs?.some(extMsg => 
                    extMsg.message_text === newMsg.message_text && 
                    extMsg.direction === newMsg.direction
                );
            });

            if (filteredMessages.length > 0) {
                await supabaseAdmin.from('whatsapp_messages').insert(filteredMessages);
            }
        }

        // 4. Trigger AI Analysis (Laboratório de IA Flow)
        let aiAnalysisResult: any = null;
        let aiError = null;
        const nameToUse = name || leadFound.name || 'Interessado';

        try {
            const chatTextForAI = messages
                .slice(-30) // More context
                .map((m: any) => `[${m.direction === 'outbound' ? 'Vendedor' : 'Cliente'}]: ${m.text}`)
                .join('\n');

            // 1. Prioridade OpenAI (GPT-4o-mini) - Mesma lógica do Painel de Atendimento
            if (process.env.OPENAI_API_KEY) {
                try {
                    const response = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: 'Você é o Sales Copilot da Manos Veículos. Analise a conversa e extraia dados estruturados para o CRM.'
                            },
                            {
                                role: 'user',
                                content: `Analise a conversa do lead ${nameToUse}:\n\n${chatTextForAI}\n\nResponda em JSON:\n{
                                    "classificacao": "HOT" | "WARM" | "COLD" | "FASE INICIAL DE ATENDIMENTO",
                                    "score": number, // 0-100
                                    "resumo_estrategico": "string",
                                    "novo_status_sugerido": "attempt" | "contacted" | "negotiation" | "proposed" | "manter", // Se o vendedor mandou a primeira msg, é "attempt" ou "contacted". Se tão falando de preço, é "negotiation". Só mude se tiver certeza do avanço. Se não souber, "manter".
                                    "intencao_compra": "string",
                                    "estagio_negociacao": "string",
                                    "objecoes": "string",
                                    "recomendacao_abordagem": "Apenas o SCRIPT MATADOR EXATO para o vendedor copiar e colar agora."
                                }`
                            }
                        ],
                        response_format: { type: "json_object" }
                    });
                    
                    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
                    aiAnalysisResult = result;
                } catch (openaiErr) {
                    console.warn("[Sync API] OpenAI failed, falling back to Gemini:", openaiErr);
                }
            }

            // 2. Fallback Gemini (se OpenAI falhar ou não existir)
            if (!aiAnalysisResult && process.env.GOOGLE_AI_API_KEY) {
                const { analyzeMultiModalChat } = await import('@/lib/gemini');
                aiAnalysisResult = await analyzeMultiModalChat(chatTextForAI, [], nameToUse);
            }

            if (aiAnalysisResult) {
                const aiResult = aiAnalysisResult;
                
                const timestamp = new Date().toLocaleString('pt-BR');
                const newNote = `[${timestamp}] 🤖 LABORATÓRIO DE IA (SYNC):\n` +
                    `🎯 Intenção: ${aiResult.intencao_compra || 'N/A'}\n` +
                    `📊 Estágio: ${aiResult.estagio_negociacao || 'N/A'}\n` +
                    `⚠️ Objeções: ${aiResult.objecoes || 'Nenhuma detectada'}\n` +
                    `⚡ Recomendaçăo: ${aiResult.recomendacao_abordagem || 'Continuar atendimento'}\n` +
                    `📌 Resumo: ${aiResult.resumo_estrategico || 'N/A'}\n\n`;

            if (leadType === 'main' && uuidId) {
                // Update leads_manos_crm
                const currentSummary = leadFound.ai_summary || '';
                
                // HYPER-AI V2: Auto-Pipeline Status Move
                const currentStatus = leadFound.status;
                const aiSuggestedStatus = aiResult.novo_status_sugerido;
                let finalStatus = currentStatus;
                
                if (aiSuggestedStatus && aiSuggestedStatus !== 'manter' && currentStatus !== 'closed' && currentStatus !== 'lost' && currentStatus !== 'comprado') {
                     // Move forward in pipeline safely
                     const pipelineOrder = ['received', 'new', 'attempt', 'contacted', 'negotiation', 'proposed'];
                     const currentIndex = pipelineOrder.indexOf(currentStatus);
                     const suggestedIndex = pipelineOrder.indexOf(aiSuggestedStatus);
                     if (suggestedIndex > currentIndex) {
                         finalStatus = aiSuggestedStatus;
                         console.log(`[Hyper-AI] Moving lead ${uuidId} from ${currentStatus} to ${finalStatus}`);
                     }
                }

                await supabaseAdmin
                    .from('leads_manos_crm')
                    .update({
                        status: finalStatus,
                        ai_score: aiResult.score,
                        ai_classification: aiResult.classificacao?.toLowerCase(),
                        ai_reason: aiResult.recomendacao_abordagem || aiResult.resumo_estrategico, // V2 1-Click CTA replaces reason
                        ai_summary: newNote + currentSummary,
                        next_step: aiResult.proxima_acao,
                        proxima_acao: aiResult.proxima_acao,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', uuidId);
                
                // Add to interactions (LINHA DO TEMPO)
                await supabaseAdmin
                    .from('interactions_manos_crm')
                    .insert([{
                        lead_id: uuidId,
                        notes: newNote,
                        new_status: finalStatus,
                        created_at: new Date().toISOString()
                    }]);

            } else if (leadType === 'crm26' && numericId) {
                // Update leads_distribuicao_crm_26
                const currentResumoFull = leadFound.resumo || '';
                let cleanResumo = currentResumoFull;
                
                // If there's an existing ||IA_DATA|| marker, we preserve the text before it
                if (currentResumoFull.includes('||IA_DATA||')) {
                    cleanResumo = currentResumoFull.split('||IA_DATA||')[0].trim();
                }

                // HYPER-AI V2: Auto-Pipeline Status Move (CRM26 sync)
                const currentStatus = leadFound.status;
                const aiSuggestedStatus = aiResult.novo_status_sugerido;
                let finalStatus = currentStatus;
                
                if (aiSuggestedStatus && aiSuggestedStatus !== 'manter' && currentStatus !== 'closed' && currentStatus !== 'lost' && currentStatus !== 'comprado') {
                     const pipelineOrder = ['received', 'new', 'attempt', 'contacted', 'negotiation', 'proposed'];
                     const currentIndex = pipelineOrder.indexOf(currentStatus);
                     const suggestedIndex = pipelineOrder.indexOf(aiSuggestedStatus);
                     if (suggestedIndex > currentIndex) {
                         finalStatus = aiSuggestedStatus;
                     }
                }

                // Prepare the JSON metadata that the Dashboard expects
                const iaMetadataStr = JSON.stringify({
                    classification: aiResult.classificacao,
                    score: aiResult.score,
                    reason: aiResult.recomendacao_abordagem || aiResult.resumo_estrategico, // V2 CTA
                    proxima_acao: aiResult.proxima_acao || aiResult.next_step
                });

                // Final string with the marker as required by dataService.getLeadsCRM26 parsing logic
                const finalResumo = `${newNote}${cleanResumo} ||IA_DATA|| ${iaMetadataStr}`.trim();

                await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .update({
                        status: finalStatus,
                        ai_score: aiResult.score,
                        ai_classification: aiResult.classificacao,
                        ai_reason: aiResult.recomendacao_abordagem || aiResult.resumo_estrategico, // V2 CTA
                        resumo_consultor: aiResult.resumo_estrategico,
                        proxima_acao: aiResult.proxima_acao || aiResult.next_step,
                        next_step: aiResult.proxima_acao || aiResult.next_step,
                        resumo: finalResumo,
                        atualizado_em: new Date().toISOString()
                    })
                    .eq('id', numericId);
            }
            console.log(`[SyncMessages] AI analysis persisted for ${leadType} lead: ${uuidId || numericId}`);

            // --- NEW: Save formatted conversation to interactions for Main Leads ---
            if (leadType === 'main' && uuidId) {
                const chatHistory = messages
                    .map((m: any) => `[${m.direction === 'outbound' ? 'Vendedor' : 'Cliente'}] - ${m.text}`)
                    .join('\n');
                
                const interactionNote = `--- IMPORTAÇÃO WHATSAPP ---\n${chatHistory}`;

                await supabaseAdmin
                    .from('interactions_manos_crm')
                    .insert({
                        lead_id: uuidId,
                        new_status: leadFound.status,
                        notes: interactionNote, // Coluna correta é notes
                        created_at: new Date().toISOString()
                    });
                console.log(`[SyncMessages] Conversation history saved to interactions for lead ${uuidId}`);
            }
        }
    } catch (aiErr: any) {
        console.error("[Sync API] AI Analysis failed:", aiErr);
        aiError = aiErr.message || String(aiErr);
    }

        return NextResponse.json({ 
            success: true, 
            count: messages.length,
            leadId: uuidId || `crm26_${numericId}`,
            aiAnalysis: aiAnalysisResult,
            aiError: aiError
        }, {
            headers: { 'X-Sync-API-Version': '2.5.DUAL' }
        });


    } catch (err: any) {
        console.error("Sync API Error (Catch):", err);
        return NextResponse.json({ 
            success: false,
            error: `Erro Crítico na API: ${err.message}`,
            version: '1.2.DEBUG'
        }, { status: 500 });
    }
}

