
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { runEliteCloser } from '@/lib/services/ai-closer-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);


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
        const { messages, phone, consultantName } = body;
        console.log(`[Sync API] Recebido: leadId=${leadId}, msgs=${messages?.length}`);

        const consultor = consultantName || 'Consultor Especialista';

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
        }
        let numericId: number | null = null;
        let uuidId: string | null = null;
        let leadFound = null;
        let leadType: 'main' | 'crm26' | 'compra' = 'crm26';

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

        // 3.5. TENTAR em leads_compra
        let compraId: string | null = null;
        if (!uuidId && !numericId) {
            if (leadId?.startsWith('compra_')) {
                const cleanId = (leadId || '').replace('compra_', '');
                const { data: leadCompra } = await supabaseAdmin.from('leads_compra').select('*').eq('id', cleanId).maybeSingle();
                if (leadCompra) {
                    compraId = leadCompra.id;
                    leadFound = leadCompra;
                    leadType = 'compra';
                }
            }
            if (!compraId && cleanPhone) {
                const orConditions = phoneVariants.map(v => `telefone.ilike.%${v}%`).join(',');
                const { data: leadsCompra, error: errCompra } = await supabaseAdmin.from('leads_compra').select('*').or(orConditions).order('criado_em', { ascending: false }).limit(3);
                
                if (leadsCompra && leadsCompra.length > 0) {
                    const bestMatch = leadsCompra.find(l => {
                        const lClean = (l.telefone || '').replace(/\D/g, '');
                        return lClean.includes(cleanPhone.slice(-8)) || cleanPhone.includes(lClean.slice(-8));
                    }) || leadsCompra[0];

                    compraId = bestMatch.id;
                    leadFound = bestMatch;
                    leadType = 'compra';
                    console.log(`[Sync API] Lead localizado em leads_compra: ${bestMatch.nome}`);
                } else if (errCompra) console.error('[Sync API] Erro busca leads_compra:', errCompra);
            }
        }

        if (!uuidId && !numericId && !compraId) {
            const errorMsg = `Lead não identificado para phone=${phone} (clean=${cleanPhone}, id=${leadId})`;
            // Vercel FS é read-only — log apenas em stdout (visível em Vercel Logs).
            console.error(`[Sync API] Falha crítica: ${errorMsg} | payload: ${JSON.stringify(body).slice(0, 500)}`);

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

        console.log(`[Sync API] Sincronizando ${messages.length} mensagens para lead (${leadType}): ${uuidId || numericId || compraId}`);

        // 2. Preparar registros para inserção (Deduplicação Inteligente)
        if (leadType === 'crm26' || leadType === 'compra') {
            const messagesToInsert = messages.map((m: any) => ({
                [leadType === 'crm26' ? 'lead_id' : 'lead_compra_id']: leadType === 'crm26' ? numericId : compraId,
                message_text: m.text,
                direction: m.direction,
                message_id: m.id || m.messageId, // Tenta capturar o ID único do WhatsApp
                created_at: m.timestamp || new Date().toISOString()
            }));

            // Deduplicação por ID de mensagem ou Conteúdo+Direção+Recentidade
            const colName = leadType === 'crm26' ? 'lead_id' : 'lead_compra_id';
            const { data: existingMsgs } = await supabaseAdmin
                .from('whatsapp_messages')
                .select('message_text, direction, message_id')
                .eq(colName, leadType === 'crm26' ? numericId : compraId)
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
                console.log(`[Sync API] Inseridas ${filteredMessages.length} novas msgs p/ lead ${leadType === 'crm26' ? numericId : compraId}`);
                
                // V3: Atualiza timestamp de atividade manual e BOIA (atualizado_em)
                const now = new Date().toISOString();
                const activityUpdates: any = {
                    atendimento_manual_at: now,
                    respondeu_follow_up: true // Se estamos sincronizando, assumimos que houve interação
                };
                
                if (leadType === 'crm26') {
                    activityUpdates.atualizado_em = now;
                    await supabaseAdmin.from('leads_distribuicao_crm_26').update(activityUpdates).eq('id', numericId);
                } else if (leadType === 'compra') {
                    activityUpdates.updated_at = now;
                    await supabaseAdmin.from('leads_compra').update(activityUpdates).eq('id', compraId);
                } else {
                    activityUpdates.updated_at = now;
                    const table = leadFound?.source_table || 'leads_master';
                    await supabaseAdmin.from(table).update(activityUpdates).eq('id', uuidId);
                }
            }

        }

        // 4. Trigger AI Analysis — delega ao Elite Closer oficial.
        // O runEliteCloser injeta inventário, behavioral_profile, memória de ações
        // anteriores e atualiza ai_summary, ai_score, ai_classification, ai_reason,
        // proxima_acao, next_step, last_scripts_*, ai_last_run_at em uma única
        // transação. Aqui só preservamos o que é específico desta rota:
        // (a) auto-pipeline status move, (b) detecção de buying signal,
        // (c) inserção de mensagens individuais na timeline.
        let aiAnalysisResult: any = null;
        let aiError: string | null = null;

        try {
            // Mapeia o formato da extensão (m.text/m.timestamp) para o que o
            // ai-closer-service espera (m.content/m.created_at).
            const mappedMessages = messages.map((m: any) => ({
                content: m.text || m.content || m.message_text || '',
                direction: m.direction,
                created_at: m.timestamp || m.created_at || new Date().toISOString(),
            }));

            const targetLeadId = uuidId || (numericId !== null ? `crm26_${numericId}` : (compraId !== null ? `compra_${compraId}` : ''));
            if (!targetLeadId) throw new Error('Lead ID resolvido vazio antes de runEliteCloser');

            // ── Quick Buying Signal Detection (Immediate Score Impact) ──
            const inboundMsgs = messages.filter((m: any) => m.direction === 'inbound');
            const lastClientMsg = inboundMsgs[inboundMsgs.length - 1]?.text?.toLowerCase() || '';
            
            const immediateBuyingKeywords = [
                'quero comprar', 'vou fechar', 'onde assina', 'manda o pix', 
                'qual a conta', 'pode reservar', 'vou buscar', 'fechado',
                'quero esse', 'vende pra mim', 'tenho o dinheiro'
            ];
            
            const isImmediateHot = immediateBuyingKeywords.some(kw => lastClientMsg.includes(kw));
            
            if (isImmediateHot) {
                console.log(`[QuickAI] Sinal de compra (venda imediata) detectado p/ lead ${targetLeadId}. Forçando score 95.`);
                let tableToUpdate = 'leads_master';
                if (leadType === 'compra') tableToUpdate = 'leads_compra';
                else if (leadType === 'crm26') tableToUpdate = 'leads_distribuicao_crm_26';
                else if (leadFound?.source_table) tableToUpdate = leadFound.source_table;
                
                await supabaseAdmin.from(tableToUpdate)
                    .update({ 
                        ai_score: 95, 
                        ai_classification: 'hot',
                        ai_last_run_at: new Date().toISOString()
                    })
                    .eq('id', uuidId || numericId || compraId);
            }

            const eliteResult = await runEliteCloser(targetLeadId, mappedMessages, consultor);

            aiAnalysisResult = {
                diagnostico: eliteResult.diagnostico,
                orientacao: eliteResult.orientacao,
                script_whatsapp: eliteResult.scriptWhatsApp,
                script_options: eliteResult.scriptOptions,
                urgency_score: eliteResult.urgencyScore,
                temperature: eliteResult.temperature === 'hot' ? 'quente' : eliteResult.temperature === 'warm' ? 'morno' : 'frio',
                model_used: eliteResult.modelUsed,
            };

            // ── Auto-pipeline status move ──────────────────────────────
            // Deriva o próximo status do urgencyScore (substitui o
            // "novo_status_sugerido" do prompt fraco).
            let suggestedStatus: string | null = null;
            if (eliteResult.urgencyScore >= 88)      suggestedStatus = 'negotiation';
            else if (eliteResult.urgencyScore >= 70) suggestedStatus = 'contacted';
            else if (eliteResult.urgencyScore >= 50) suggestedStatus = 'attempt';

            const pipelineOrder = ['received', 'new', 'attempt', 'contacted', 'scheduled', 'visited', 'negotiation', 'proposed'];
            const isTerminalStatus = (s: string) => s === 'closed' || s === 'lost' || s === 'comprado';

            if (suggestedStatus && leadType === 'main' && uuidId) {
                const tableToUpdate = leadFound.source_table || 'leads_master';
                const currentStatus = leadFound.status;
                if (!isTerminalStatus(currentStatus)) {
                    const currentIndex = pipelineOrder.indexOf(currentStatus);
                    const suggestedIndex = pipelineOrder.indexOf(suggestedStatus);
                    if (suggestedIndex > currentIndex) {
                        await supabaseAdmin.from(tableToUpdate)
                            .update({ status: suggestedStatus })
                            .eq('id', uuidId);
                        console.log(`[Hyper-AI] Lead ${uuidId}: ${currentStatus} → ${suggestedStatus}`);
                    }
                }
            } else if (suggestedStatus && leadType === 'crm26' && numericId) {
                // Re-fetch para evitar race condition com status manual do usuário
                const { data: latestLead } = await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .select('status')
                    .eq('id', numericId)
                    .single();
                const dbStatus = latestLead?.status || leadFound.status;
                if (!isTerminalStatus(dbStatus)) {
                    const dbIndex = pipelineOrder.indexOf(dbStatus);
                    const suggestedIndex = pipelineOrder.indexOf(suggestedStatus);
                    if (suggestedIndex > dbIndex) {
                        await supabaseAdmin.from('leads_distribuicao_crm_26')
                            .update({ status: suggestedStatus })
                            .eq('id', numericId);
                        console.log(`[Hyper-AI] CRM26 lead ${numericId}: ${dbStatus} → ${suggestedStatus}`);
                    }
                }
            }

            // ── Detecção de intenção de compra ─────────────────────────
            // Independe da IA — examina mensagens raw em busca de keywords.
            if (leadType === 'main' && uuidId) {
                const clientMsgs = messages.filter((m: any) => m.direction === 'inbound').slice(-5);
                const buyingKeywords = ['quando posso', 'quanto de entrada', 'tenho o dinheiro', 'vou comprar',
                    'fechar', 'quero comprar', 'vou pegar', 'que horas', 'visita', 'test drive',
                    'buscar', 'posso ir', 'valor total', 'quanto fica', 'à vista'];
                const hasBuyingSignal = clientMsgs.some((m: any) =>
                    buyingKeywords.some(kw => (m.text || '').toLowerCase().includes(kw))
                );
                const isHighScore = eliteResult.urgencyScore >= 88;

                if (hasBuyingSignal || isHighScore) {
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
                                : `🔥 Score de urgência elevado (${eliteResult.urgencyScore}). Contato imediato recomendado.`,
                            priority: 'high',
                            status: 'pending',
                        });
                        console.log(`[BuyingSignal] Alerta criado para lead ${uuidId}`);
                    }
                }
            }

            // ── Insere mensagens individuais na timeline (main/master) ─
            if (leadType === 'main' && uuidId) {
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

                const filteredInteractions = messagesToInsert.filter(newMsg =>
                    !existingInteractions?.some(extInt =>
                        extInt.notes === newMsg.notes && extInt.type === newMsg.type
                    )
                );

                if (filteredInteractions.length > 0) {
                    await supabaseAdmin.from('interactions_manos_crm').insert(filteredInteractions);
                    console.log(`[Sync API] Inseridas ${filteredInteractions.length} interações de WhatsApp p/ lead ${uuidId}`);
                }
            }

            console.log(`[SyncMessages] runEliteCloser persisted analysis for ${leadType} lead: ${uuidId || numericId} (model=${eliteResult.modelUsed})`);
        } catch (aiErr: any) {
            console.error("[Sync API] AI Analysis failed:", aiErr);
            aiError = aiErr?.message || String(aiErr);
        }

        return NextResponse.json({ 
            success: true, 
            count: messages.length,
            leadId: uuidId || `crm26_${numericId}` || `compra_${compraId}`,
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
