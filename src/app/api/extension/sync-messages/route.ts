
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
    const corsHeaders = {
        'Access-Control-Allow-Origin': 'https://web.whatsapp.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
    };

    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        // Aceita snake_case (lead_id) enviado pela extensão e camelCase (leadId) legado
        const leadId = body.lead_id || body.leadId;
        const { messages, phone, name, consultantName } = body;
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
        
        const getPhoneVariants = (p: string) => {
            if (!p) return [];
            const variants = new Set<string>();
            let base = p;
            if (p.startsWith('55')) base = p.substring(2);
            
            variants.add(p); // Original
            variants.add(base); // Sem 55
            
            // Lógica para 9º dígito (Brasil)
            if (base.length === 11 && base[2] === '9') {
                // Tem 11 dígitos e o 3º é 9 (formato novo), tenta o formato antigo
                variants.add(base.substring(0, 2) + base.substring(3));
            } else if (base.length === 10) {
                // Tem 10 dígitos (formato antigo), tenta adicionar o 9
                variants.add(base.substring(0, 2) + '9' + base.substring(2));
            }

            // Sufixos para busca broad (muito importante para casos de truncamento no banco)
            if (base.length >= 4) variants.add(base.slice(-4));
            if (base.length >= 6) variants.add(base.slice(-6));
            if (base.length >= 8) variants.add(base.slice(-8));
            if (base.length >= 9) variants.add(base.slice(-9));
            
            // Casos onde o BANCO está truncado (ex: o banco tem 12 dígitos, mas o real tem 13)
            // Se o real tem 13 e o banco 12, o banco cortou o último dígito.
            if (base.length >= 6) {
                variants.add(base.substring(0, base.length - 1)); // Sem o último
                variants.add(base.substring(0, base.length - 2)); // Sem os dois últimos
            }

            return Array.from(variants).filter(v => v.length >= 4);
        };

        const phoneVariants = getPhoneVariants(cleanPhone);
        console.log(`[Sync API] Phone Variants p/ ${cleanPhone}:`, phoneVariants);

        // 1. Resolver o ID do lead - Tentar leads_master (UUID) primeiro
        if (leadId) {
            const cleanId = leadId.replace(/^(main_|dist_|crm26_|dist_|lead_|crm25_|master_)/, '');
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            
            if (uuidRegex.test(cleanId)) {
                // Tenta leads_master
                const { data: leadMaster } = await supabaseAdmin.from('leads_master').select('*').eq('id', cleanId).maybeSingle();
                if (leadMaster) {
                    uuidId = leadMaster.id;
                    leadFound = { ...leadMaster, source_table: 'leads_master' };
                    leadType = 'main';
                } else {
                    // Tenta leads_manos_crm
                    const { data: leadMain } = await supabaseAdmin.from('leads_manos_crm').select('*').eq('id', cleanId).maybeSingle();
                    if (leadMain) {
                        uuidId = leadMain.id;
                        leadFound = { ...leadMain, source_table: 'leads_manos_crm' };
                        leadType = 'main';
                    }
                }
            }
        }

        // 2. Se não encontrou por ID, tentar por telefone em leads_master e leads_manos_crm
        if (!uuidId && cleanPhone) {
            const orConditions = phoneVariants.map(v => `phone.ilike.%${v}%`).join(',');
            
            // Tenta leads_master por telefone
            const { data: leadsMaster, error: errMaster } = await supabaseAdmin.from('leads_master').select('*').or(orConditions).order('created_at', { ascending: false }).limit(3);
            
            if (leadsMaster && leadsMaster.length > 0) {
                // Filtro extra em JS para garantir proximidade
                const bestMatch = leadsMaster.find(l => {
                    const lClean = (l.phone || '').replace(/\D/g, '');
                    return lClean.includes(cleanPhone.slice(-8)) || cleanPhone.includes(lClean.slice(-8));
                }) || leadsMaster[0];

                uuidId = bestMatch.id;
                leadFound = { ...bestMatch, source_table: 'leads_master' };
                leadType = 'main';
                console.log(`[Sync API] Lead localizado em leads_master: ${bestMatch.name}`);
            } else {
                if (errMaster) console.error('[Sync API] Erro busca leads_master:', errMaster);
                
                // Tenta leads_manos_crm por telefone
                const { data: leadsMain, error: errMain } = await supabaseAdmin.from('leads_manos_crm').select('*').or(orConditions).order('created_at', { ascending: false }).limit(3);
                
                if (leadsMain && leadsMain.length > 0) {
                    const bestMatch = leadsMain.find(l => {
                        const lClean = (l.phone || '').replace(/\D/g, '');
                        return lClean.includes(cleanPhone.slice(-8)) || cleanPhone.includes(lClean.slice(-8));
                    }) || leadsMain[0];

                    uuidId = bestMatch.id;
                    leadFound = { ...bestMatch, source_table: 'leads_manos_crm' };
                    leadType = 'main';
                    console.log(`[Sync API] Lead localizado em leads_manos_crm: ${bestMatch.name}`);
                } else if (errMain) console.error('[Sync API] Erro busca leads_manos_crm:', errMain);
            }
        }

        // 3. Se não encontrou UUID, tentar leads_distribuicao_crm_26 (BigInt)
        if (!uuidId) {
            if (leadId?.startsWith('crm26_') || /^\d+$/.test(leadId || '')) {
                const cleanId = (leadId || '').replace('crm26_', '');
                if (/^\d+$/.test(cleanId)) {
                    const { data: lead26 } = await supabaseAdmin.from('leads_distribuicao_crm_26').select('*').eq('id', parseInt(cleanId)).maybeSingle();
                    if (lead26) {
                        numericId = lead26.id;
                        leadFound = lead26;
                        leadType = 'crm26';
                    }
                }
            }
            
            if (!numericId && cleanPhone) {
                const orConditions = phoneVariants.map(v => `telefone.ilike.%${v}%`).join(',');
                const { data: leads26, error: err26 } = await supabaseAdmin.from('leads_distribuicao_crm_26').select('*').or(orConditions).order('created_at', { ascending: false }).limit(3);
                
                if (leads26 && leads26.length > 0) {
                    const bestMatch = leads26.find(l => {
                        const lClean = (l.telefone || l.phone || '').replace(/\D/g, '');
                        return lClean.includes(cleanPhone.slice(-8)) || cleanPhone.includes(lClean.slice(-8));
                    }) || leads26[0];

                    numericId = bestMatch.id;
                    leadFound = bestMatch;
                    leadType = 'crm26';
                    console.log(`[Sync API] Lead localizado em leads26: ${bestMatch.nome}`);
                } else if (err26) console.error('[Sync API] Erro busca leads26:', err26);
            }
        }

        if (!uuidId && !numericId) {
            const errorMsg = `Lead não identificado para phone=${phone} (clean=${cleanPhone}, id=${leadId})`;
            console.error(`[Sync API] Falha crítica: ${errorMsg}`);
            
            // Grava log de erro para inspeção profunda
            try {
                const fs = require('fs');
                const logPath = 'c:/Users/Usuario/OneDrive/Documentos/crm-manos/sync_errors.log';
                const logEntry = `${new Date().toISOString()} - ${errorMsg} - payload: ${JSON.stringify(body).slice(0, 500)}\n`;
                fs.appendFileSync(logPath, logEntry);
            } catch (e) {}

            return NextResponse.json({ 
                success: false, 
                error: 'Lead não encontrado no CRM. Certifique-se que o lead já está cadastrado.' 
            }, { 
                status: 404,
                headers: {
                    ...corsHeaders,
                    'Cache-Control': 'no-store, max-age=0'
                }
            });
        }

        console.log(`[Sync API] Sincronizando ${messages.length} mensagens para lead (${leadType}): ${uuidId || numericId}`);

        // 2. Preparar registros para inserção (Deduplicação Inteligente)
        if (leadType === 'crm26') {
            const messagesToInsert = messages.map((m: any) => ({
                lead_id: numericId,
                message_text: m.text,
                direction: m.direction,
                message_id: m.id || m.messageId, // Tenta capturar o ID único do WhatsApp
                created_at: m.timestamp || new Date().toISOString()
            }));

            // Deduplicação por ID de mensagem ou Conteúdo+Direção+Recentidade
            const { data: existingMsgs } = await supabaseAdmin
                .from('whatsapp_messages')
                .select('message_text, direction, message_id')
                .eq('lead_id', numericId)
                .order('created_at', { ascending: false })
                .limit(messagesToInsert.length + 100);

            const filteredMessages = messagesToInsert.filter(newMsg => {
                // Se temos message_id, usamos ele (mais preciso)
                if (newMsg.message_id) {
                    return !existingMsgs?.some(extMsg => extMsg.message_id === newMsg.message_id);
                }
                // Fallback: Conteúdo Exato + Direção
                return !existingMsgs?.some(extMsg => 
                    extMsg.message_text === newMsg.message_text && 
                    extMsg.direction === newMsg.direction
                );
            });

            if (filteredMessages.length > 0) {
                await supabaseAdmin.from('whatsapp_messages').insert(filteredMessages);
                console.log(`[Sync API] Inseridas ${filteredMessages.length} novas msgs p/ lead ${numericId}`);
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
                      "veiculo_troca": "Marca Modelo Ano do carro do CLIENTE na troca ou 'não informado'",
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
                
                const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
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
                     const pipelineOrder = ['received', 'new', 'attempt', 'contacted', 'scheduled', 'visited', 'negotiation', 'proposed'];
                     const currentIndex = pipelineOrder.indexOf(currentStatus);
                     const suggestedIndex = pipelineOrder.indexOf(aiSuggestedStatus);
                     if (suggestedIndex > currentIndex) {
                         finalStatus = aiSuggestedStatus;
                         console.log(`[Hyper-AI] Moving lead ${uuidId} from ${currentStatus} to ${finalStatus}`);
                     }
                }

                const tableToUpdate = leadFound.source_table || 'leads_master';

                await supabaseAdmin
                    .from(tableToUpdate)
                    .update({
                        status: finalStatus,
                        ai_score: aiResult.urgency_score || 0,
                        ai_classification: aiResult.temperature === 'quente' ? 'hot' : aiResult.temperature === 'morno' ? 'warm' : 'cold',
                        carro_troca: (aiResult.veiculo_troca && aiResult.veiculo_troca !== 'não informado') ? aiResult.veiculo_troca : leadFound.carro_troca,
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

                // 3.2 — DETECÇÃO DE INTENÇÃO DE COMPRA
                const clientMsgs = messages.filter((m: any) => m.direction === 'inbound').slice(-5);
                const buyingKeywords = ['quando posso', 'quanto de entrada', 'tenho o dinheiro', 'vou comprar',
                    'fechar', 'quero comprar', 'vou pegar', 'que horas', 'visita', 'test drive',
                    'buscar', 'posso ir', 'valor total', 'quanto fica', 'à vista'];
                const hasBuyingSignal = clientMsgs.some((m: any) =>
                    buyingKeywords.some(kw => (m.text || '').toLowerCase().includes(kw))
                );
                const isHighScore = (aiResult.urgency_score || 0) >= 88;

                if (hasBuyingSignal || isHighScore) {
                    if (hasBuyingSignal) {
                        await supabaseAdmin
                            .from(tableToUpdate)
                            .update({ ai_score: 92, ai_classification: 'hot' })
                            .eq('id', uuidId);
                    }

                    // Dedup: não cria se já existe alerta nas últimas 4h
                    const cutoff4h = new Date(Date.now() - 4 * 3_600_000).toISOString();
                    const { data: existingAlert } = await supabaseAdmin
                        .from('follow_ups')
                        .select('id')
                        .eq('lead_id', uuidId)
                        .eq('type', 'ai_alert_compra')
                        .gte('created_at', cutoff4h)
                        .maybeSingle();

                    if (!existingAlert) {
                        await supabaseAdmin.from('follow_ups').insert({
                            lead_id: uuidId,
                            user_id: leadFound.assigned_consultant_id || 'system',
                            scheduled_at: new Date().toISOString(),
                            type: 'ai_alert_compra',
                            note: hasBuyingSignal
                                ? `🔥 Sinal de compra detectado! Última msg: "${clientMsgs.at(-1)?.text?.slice(0, 100)}"`
                                : `🔥 Score de urgência elevado (${aiResult.urgency_score}). Contato imediato recomendado.`,
                            priority: 'high',
                            status: 'pending',
                        });
                        console.log(`[BuyingSignal] Alerta criado para lead ${uuidId}`);
                    }
                }

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
                     const pipelineOrder = ['received', 'new', 'attempt', 'contacted', 'scheduled', 'visited', 'negotiation', 'proposed'];
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

                // RE-FETCH PARA EVITAR RACE CONDITION (Proteção contra sobrescrita de status manual)
                const { data: latestLead } = await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .select('status, resumo')
                    .eq('id', numericId)
                    .single();
                
                const dbStatus = latestLead?.status || currentStatus;
                
                // Só atualiza status se a IA sugerir avanço ou se for manutenção do estado atual REAL
                // Nunca regride o status se o usuário tiver movido o lead manualmente
                const pipelineOrder = ['received', 'new', 'attempt', 'contacted', 'scheduled', 'visited', 'negotiation', 'proposed'];
                const dbIndex = pipelineOrder.indexOf(dbStatus);
                const aiIndex = pipelineOrder.indexOf(aiSuggestedStatus);
                
                let persistentStatus = dbStatus;
                if (aiSuggestedStatus && aiSuggestedStatus !== 'manter' && aiIndex > dbIndex) {
                    persistentStatus = aiSuggestedStatus;
                }

                await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .update({
                        status: persistentStatus,
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

            // --- NEW: Save individual messages to interactions for Main/Master Leads ---
            if (leadType === 'main' && uuidId) {
                // 1. Buscar interações recentes de WhatsApp para este lead para deduplicar
                const { data: existingInteractions } = await supabaseAdmin
                    .from('interactions_manos_crm')
                    .select('notes, type')
                    .eq('lead_id', uuidId)
                    .ilike('type', 'whatsapp%')
                    .order('created_at', { ascending: false })
                    .limit(100);

                const messagesToInsert = messages.map((m: any) => ({
                    lead_id: uuidId,
                    type: m.direction === 'outbound' ? 'whatsapp_out' : 'whatsapp_in',
                    notes: m.text,
                    user_name: m.direction === 'outbound' ? (consultantName || 'Consultor') : 'Cliente',
                    created_at: m.timestamp || new Date().toISOString()
                }));

                const filteredInteractions = messagesToInsert.filter(newMsg => {
                    return !existingInteractions?.some(extInt => 
                        extInt.notes === newMsg.notes && 
                        extInt.type === newMsg.type
                    );
                });

                if (filteredInteractions.length > 0) {
                    await supabaseAdmin
                        .from('interactions_manos_crm')
                        .insert(filteredInteractions);
                    console.log(`[Sync API] Inseridas ${filteredInteractions.length} interações de WhatsApp p/ lead ${uuidId}`);
                }
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

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': 'https://web.whatsapp.com',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true',
        },
    });
}
