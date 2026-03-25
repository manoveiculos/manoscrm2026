
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

import OpenAI from 'openai';
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { leadId, messages, phone, name, consultantName } = body;
        console.log(`[Sync API] Recebido: leadId=${leadId}, msgs=${messages?.length}`);

        const consultor = consultantName || 'Consultor Especialista';

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

            // 1. OpenAI Elite Closer Protocol (V2)
            if (process.env.OPENAI_API_KEY) {
                try {
                    const prompt = `Você é o "Mano’s Elite Closer" – o maior fechador de carros do Brasil. Sua missão não é apenas analisar, é ENTREGAR A VENDA na mão do consultor ${consultor}.
                    
                    ### PERFIL DO LEAD (CONTEXTO CIRÚRGICO)
                    - Nome: ${nameToUse}
                    
                    ### CONVERSA REAL (ESTUDE A DOR E O TOM):
                    ${chatTextForAI}
                    
                    ### PROTOCOLO ELITE DE FECHAMENTO (Siga Rigorosamente):
                    1. **PONTO DE CONTATO (HOOK)**: Nunca comece com "Oi, tudo bem?". Comece com algo real do chat ou uma oferta de valor.
                    2. **GATILHOS PSICOLÓGICOS**:
                       - **Escassez**: O carro está sendo muito procurado.
                       - **Autoridade**: Você (Consultor) conseguiu uma condição única com a gerência.
                    3. **ZERO ROBOTIZAÇÃO**: Banido 100% o uso de listas, tópicos ou verbos no infinitivo no script final.
                    4. **BANIMENTO DE GERUNDISMO**: Não use "vou estar verificando". Use "vi aqui agora", "consegui pra você".
                    5. **LINGUAGEM REGIONAL**: Seja humano, use gírias leves de vendas ("fera", "meu amigo", "opa").
                    6. **SCORING CIRÚRGICO**: 90-100 é só pra quem vai fechar HOJE. 70-89 é interesse alto. Abaixo de 40 é gelado.
                    
                    ### JSON OBRIGATÓRIO (Elite Mode):
                    {
                      "diagnostico_do_mentor": "Sua análise psicológica curta (2 linhas).",
                      "script_whatsapp_agora": "O texto EXATO: 1-2 frases CURTAS, IMPACTANTES, HUMANAS. SEM LISTAS. SEM INFINITIVO.",
                      "por_que_este_script": "A técnica de fechamento usada.",
                      "urgency_score": number,
                      "temperature": "frio" | "morno" | "quente",
                      "novo_status_sugerido": "attempt" | "contacted" | "negotiation" | "proposed" | "manter"
                    }`;

                    const response = await openai.chat.completions.create({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: `Você é o Mano’s Elite Closer. Você é ambicioso e focado em fechar negócios. Use o nome do consultor (${consultor}).` },
                            { role: 'user', content: prompt }
                        ],
                        response_format: { type: "json_object" },
                        temperature: 0.7
                    });
                    
                    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
                    aiAnalysisResult = {
                        ...result,
                        diagnostico: result.diagnostico_do_mentor || result.diagnostico,
                        script_whatsapp: result.script_whatsapp_agora,
                        por_que: result.por_que_este_script || "Abordagem cirúrgica."
                    };
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
                const newNote = `[${timestamp}] 🤖 IA CIRÚRGICA V2 (SYNC):\n` +
                    `🔥 Temperatura: ${aiResult.temperature || 'N/A'} (Score: ${aiResult.urgency_score || 0})\n` +
                    `📌 Diagnóstico: ${aiResult.diagnostico || 'N/A'}\n` +
                    `Estratégia: ${aiResult.por_que || 'Abordagem tática.'}\n\n`;

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
                        ai_score: aiResult.urgency_score || 0,
                        ai_classification: aiResult.temperature === 'quente' ? 'hot' : aiResult.temperature === 'morno' ? 'warm' : 'cold',
                        ai_reason: aiResult.diagnostico,
                        ai_summary: newNote + currentSummary,
                        next_step: aiResult.script_whatsapp || '',
                        proxima_acao: aiResult.script_whatsapp || '',
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
                    classification: aiResult.temperature === 'quente' ? 'hot' : aiResult.temperature === 'morno' ? 'warm' : 'cold',
                    score: aiResult.urgency_score || 0,
                    summary: aiResult.diagnostico,
                    next_step: aiResult.script_whatsapp || ''
                });

                // Final string with the marker as required by dataService.getLeadsCRM26 parsing logic
                const finalResumo = `${newNote}${cleanResumo} ||IA_DATA|| ${iaMetadataStr}`.trim();

                await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .update({
                        status: finalStatus,
                        ai_score: aiResult.urgency_score || 0,
                        ai_classification: aiResult.temperature === 'quente' ? 'hot' : aiResult.temperature === 'morno' ? 'warm' : 'cold',
                        ai_reason: aiResult.diagnostico,
                        resumo_consultor: aiResult.diagnostico,
                        proxima_acao: aiResult.script_whatsapp || '',
                        next_step: aiResult.script_whatsapp || '',
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

