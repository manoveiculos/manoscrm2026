import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { pickNextConsultant } from '@/lib/services/consultantService';
import { scheduleFirstContact } from '@/lib/services/aiSdrService';
import { notifyLeadArrival } from '@/lib/services/vendorNotifyService';

// Handler para Verificação do Webhook (GET)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    // Você pode definir este VERIFY_TOKEN no seu .env.local
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'manos_crm_token_2026';

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verificado com sucesso!');
            return new NextResponse(challenge, { status: 200 });
        } else {
            return new NextResponse('Forbidden', { status: 403 });
        }
    }

    return new NextResponse('Bad Request', { status: 400 });
}

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();

        // Evolution API manda em payload.data.{key,message,pushName}.
        // Filtramos eventos não-mensagem cedo (CONNECTION_UPDATE, etc).
        const evt = payload.event || payload.type || '';
        const evolutionData = payload.data;

        // Pula eventos que não são mensagem (status conexão, presence, etc)
        if (evt && !/messages\.?upsert|messages\.?new/i.test(evt)) {
            return NextResponse.json({ success: true, ignored: evt }, { status: 200 });
        }

        // Pula mensagens que NÓS enviamos (fromMe=true). Senão eco-loop.
        if (evolutionData?.key?.fromMe === true) {
            return NextResponse.json({ success: true, ignored: 'fromMe' }, { status: 200 });
        }

        // Extrai campos com suporte a 4 formatos: Evolution, n8n, Cloud API, direto.
        const phoneRaw =
            // Evolution API: data.key.remoteJid = "554799...@s.whatsapp.net"
            (evolutionData?.key?.remoteJid && String(evolutionData.key.remoteJid).split('@')[0]) ||
            payload.phone ||
            payload.wa_id ||
            payload.sender;

        const messageText =
            // Evolution API: text na message.conversation OU message.extendedTextMessage.text
            evolutionData?.message?.conversation ||
            evolutionData?.message?.extendedTextMessage?.text ||
            evolutionData?.message?.imageMessage?.caption ||
            evolutionData?.message?.videoMessage?.caption ||
            payload.message ||
            payload.text ||
            payload.body;

        const messageId =
            evolutionData?.key?.id ||
            payload.message_id ||
            payload.id;

        const senderName =
            evolutionData?.pushName ||
            payload.name ||
            payload.pushName ||
            'Lead WhatsApp';

        if (!phoneRaw || !messageText) {
            console.error(`[Webhook WA] Rejeitado: campos faltando. Event=${evt} Phone=${phoneRaw} Msg=${typeof messageText} Payload keys=${Object.keys(payload).join(',')}`);
            return NextResponse.json({ success: false, error: 'Campos phone e message são obrigatórios' }, { status: 400 });
        }

        // Limpa o telefone para bater com o banco
        const cleanPhone = String(phoneRaw).replace(/\D/g, '');

        if (!cleanPhone) {
            console.error(`[Webhook WA] Rejeitado: Telefone inválido pós-limpeza. Raw: ${phoneRaw}`);
            return NextResponse.json({ success: false, error: 'Telefone inválido' }, { status: 400 });
        }

        // Client Supabase usando a Service Role para ignorar RLS no processo de webhook
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get: () => undefined,
                    set: () => { },
                    remove: () => { }
                }
            }
        );

        // 1. Busca o lead pela varredura unificada (V1, V2 e Compra)
        const { data: leadMatchRaw, error: leadError } = await supabase
            .rpc('find_lead_by_phone', { p_phone: cleanPhone })
            .maybeSingle();

        if (leadError) {
            console.error('Erro ao buscar lead unificado:', leadError);
        }

        const leadMatch = leadMatchRaw as any;
        let leadId = leadMatch?.native_id;
        let leadTable = leadMatch?.table_name || 'leads_distribuicao_crm_26';
        let existingLead = leadMatch; // Alias para compatibilidade com código abaixo

        // 2. Cria o lead caso não exista
        if (!leadId) {
            // ATRIBUIÇÃO AUTOMÁTICA (ROUND ROBIN)
            let assignedId = null;
            let assignedName = null;
            
            try {
                const nextCons = await pickNextConsultant(senderName);
                if (nextCons) {
                    assignedId = nextCons.id;
                    assignedName = nextCons.name;
                    console.log(`[Webhook WA] Atribuindo novo lead ${senderName} para ${assignedName}`);
                }
            } catch (err) {
                console.error('[Webhook WA] Erro na atribuição automática:', err);
            }

            const { data: newLead, error: insertLeadError } = await supabase
                .from('leads_distribuicao_crm_26')
                .insert({
                    nome: senderName,
                    telefone: cleanPhone,
                    status: 'received',
                    origem: 'WhatsApp Ativo',
                    ai_classification: 'warm',
                    ai_score: 50,
                    assigned_consultant_id: assignedId,
                    vendedor: assignedName,
                    primeiro_vendedor: assignedName
                })
                .select('id, table_name')
                .single();
            
            if (insertLeadError || !newLead) {
                console.error('Erro ao criar lead:', insertLeadError);
                throw insertLeadError || new Error('Falha ao criar lead');
            }

            leadId = newLead.id;
            leadTable = 'leads_distribuicao_crm_26';
            // Re-alimenta o existingLead para as lógicas de status abaixo
            existingLead = { ...newLead, native_id: newLead.id, table_name: 'leads_distribuicao_crm_26' };

            // 🤖 AI SDR — primeiro contato automático em ~30s
            // Dispara só para leads NOVOS (existingLead == null), e só se nome
            // for real (não placeholder "Lead WhatsApp").
            // Cliente já mandou msg → IA responde rapidinho com contexto inicial.
            const hasRealName = senderName && senderName.toLowerCase() !== 'lead whatsapp';
            try {
                await scheduleFirstContact({
                    leadId: String(leadId),
                    leadName: hasRealName ? senderName : null,
                    leadPhone: cleanPhone,
                    vehicleInterest: null, // não temos da entrada inbound
                    source: 'WhatsApp Ativo',
                    consultantName: assignedName,
                    flow: 'venda',
                }, 'leads_distribuicao_crm_26', 30_000);
                console.log(`[Webhook WA] AI SDR enfileirado para lead ${leadId} (${senderName})`);
            } catch (sdrErr: any) {
                console.error('[Webhook WA] Falha ao enfileirar AI SDR (não-bloqueante):', sdrErr?.message);
            }

            // 📲 Push WhatsApp pessoal ao vendedor — vê o lead em <30s no celular,
            // não precisa abrir CRM. Speed-to-lead crítico.
            notifyLeadArrival(String(leadId)).catch(e =>
                console.warn('[Webhook WA] notifyLeadArrival falhou:', e?.message)
            );
        } else if (existingLead) {
            // BOIA: toda msg inbound atualiza atualizado_em → lead sobe pro topo do /inbox
            // V3: cliente respondeu → marca respondeu_follow_up + status atendimento_manual
            //     pra IA NÃO mandar mais follow-ups automáticos.
            const isFinal = existingLead.status === 'post_sale' || existingLead.status === 'lost' ||
                            existingLead.status === 'vendido' || existingLead.status === 'perdido' ||
                            existingLead.status === 'frio';
            const wasArchived = !!existingLead.archived_at;
            // REVERSÃO BEM-SUCEDIDA: lead estava em fluxo de reversão (perdido/arquivado
            // com pelo menos 1 tentativa da IA) e cliente respondeu agora.
            const eraEmReversao = (existingLead.reversao_attempt_count || 0) > 0
                                  && (isFinal || wasArchived);
            const now = new Date().toISOString();
            const updates: Record<string, any> = {
                atualizado_em: now,
                respondeu_follow_up: true,             // V3: trava IA
                atendimento_manual_at: now,            // V3: vendedor assume agora
                ultima_interacao_humana: now,          // cliente respondeu = humano agiu
            };
            // Status / Archive:
            //   - era em reversão → marca flagged_reversao + status received
            //   - era arquivado E cliente respondeu → desarquiva (volta ao Inbox)
            //   - era frio/lost/vendido → ressuscita pra received (cliente voltou)
            //   - era received/triagem → marca atendimento_manual
            if (eraEmReversao) {
                updates.flagged_reversao = true;
                updates.archived_at = null;
                updates.archived_reason = null;
                updates.archived_by = null;
                updates.status = 'received';
            } else if (wasArchived) {
                updates.archived_at = null;
                updates.archived_reason = null;
                updates.archived_by = null;
                updates.status = 'received';
            } else if (isFinal) {
                updates.status = 'received';
            } else if (existingLead.status === 'received' || existingLead.status === 'triagem') {
                updates.status = 'attempt';
            }

            await supabase
                .from(leadTable)
                .update(updates)
                .eq('id', leadId);

            // V3: marca histórico de follow-up como respondido
            await supabase
                .from('historico_followup')
                .update({ respondido_em: now, resposta_cliente: messageText })
                .eq('lead_id', String(leadId))
                .is('respondido_em', null)
                .then(null, () => {});

            // 🔥 REVERSÃO BEM-SUCEDIDA: notifica vendedor responsável com alerta crítico
            if (eraEmReversao && existingLead.assigned_consultant_id) {
                try {
                    const { notifyConsultant } = await import('@/lib/services/consultantNotifier');
                    await notifyConsultant({
                        consultantId: existingLead.assigned_consultant_id,
                        leadId: String(leadId),
                        level: 3,
                        title: `🔥 REVERSÃO: ${existingLead.nome || 'Cliente'} respondeu!`,
                        message: `Cliente que estava perdido voltou após msg da IA. Abra o lead AGORA pra fechar.`,
                        blocking: true,
                    });
                } catch (e: any) {
                    console.warn('[Webhook WA] notifyConsultant reversão falhou:', e?.message);
                }
            }
        }

        // 3. Salva a mensagem no histórico unificado
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(leadId));
        const msgPayload: any = {
            direction: 'inbound',
            message_text: messageText,
            message_id: messageId || `in_${Date.now()}`
        };

        if (isUUID) {
            msgPayload.lead_compra_id = leadId;
        } else {
            msgPayload.lead_id = leadId;
        }

        const { error: msgInsertError } = await supabase
            .from('whatsapp_messages')
            .insert(msgPayload);

        if (msgInsertError) {
            // Pode falhar se a tabela não tiver sido criada ainda. Vamos logar e seguir, 
            // ou atualizar o resumo do lead como fallback.
            console.warn('Erro ao inserir em whatsapp_messages (A tabela existe?):', msgInsertError.message);

            // Fallback: Append no resumo do lead temporariamente
            const { data: currentInfo } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('resumo')
                .eq('id', leadId)
                .single();

            const appendedResumo = `[NOVA MENSAGEM WA]: ${messageText}\n\n${currentInfo?.resumo || ''}`;
            await supabase
                .from('leads_distribuicao_crm_26')
                .update({ resumo: appendedResumo })
                .eq('id', leadId);
        }

        // Dispara a reanálise de IA em background (Fire and Forget) para não prender o Meta Webhook
        const analyzeUrl = new URL('/api/webhook/analyze-auto', req.url);
        fetch(analyzeUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: leadId })
        }).catch(err => console.error('Erro ao disparar reanálise IA:', err));
        return NextResponse.json({ success: true, lead_id: leadId, message: 'Processado com sucesso' });

    } catch (error: any) {
        const payloadStr = 'payload' in error ? JSON.stringify(error.payload || {}).slice(0, 500) : 'N/A';
        const errorMsg = `[Webhook WA] Falha crítica: ${error.message}`;
        console.error(errorMsg, error);
        
        try {
            const fs = require('fs');
            const logPath = 'c:/Users/Usuario/OneDrive/Documentos/crm-manos/webhook_errors.log';
            const logEntry = `${new Date().toISOString()} - ${errorMsg} - payload: ${payloadStr}\n`;
            fs.appendFileSync(logPath, logEntry);
        } catch (e) {}

        return NextResponse.json({ success: false, error: 'Erro interno no webhook', details: error.message }, { status: 500 });
    }
}
