import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/admin';
import { distribuirLead } from '@/lib/services/slaEngine';
import { detectClosingIntent, lossReasonFor } from '@/lib/services/conversationIntent';

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
            // PESCA PURA (Fase 1): lead inbound entra SEM dono. O vendedor
            // disponível "chama" clicando Iniciar Atendimento no /inbox.
            const { data: newLead, error: insertLeadError } = await supabase
                .from('leads_distribuicao_crm_26')
                .insert({
                    nome: senderName,
                    telefone: cleanPhone,
                    status: 'received',
                    origem: 'WhatsApp Ativo',
                    ai_classification: 'warm',
                    ai_score: 50,
                    assigned_consultant_id: null,
                    vendedor: null,
                    primeiro_vendedor: null
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

            // (Fase 1) AI SDR de primeiro contato REMOVIDO: zero IA falando com cliente.

            // 🎯 Motor de distribuição: round-robin pro próximo vendedor disponível
            // + SLA 10min (ou standby fora do horário). Notifica o dono internamente.
            distribuirLead('leads_distribuicao_crm_26', leadId).catch(e =>
                console.warn('[Webhook WA] distribuirLead falhou (não-bloqueante):', e?.message)
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

            // ── Detecção de desfecho na própria msg que acabou de chegar ──
            // Se cliente disse "já comprei" / "pode parar" / etc, flagga o lead
            // pra Karol nunca mais tentar reversão e sobe pro Inbox com badge.
            const intentNow = detectClosingIntent([
                { direction: 'inbound', message_text: messageText, created_at: now }
            ]);
            if (intentNow.intent) {
                updates.motivo_perda_estruturado = lossReasonFor(intentNow.intent);
                updates.flagged_reversao = true;
                updates.reversao_attempt_count = 99;
                updates.ai_silence_until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
                updates.diagnostico_atendimento = `[INBOUND-AUTO] Cliente ${intentNow.intent}: "${intentNow.fromMessage.slice(0, 200)}"`;
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
        const msgPayload: any = {
            direction: 'inbound',
            message_text: messageText,
            message_id: messageId || `in_${Date.now()}`
        };

        if (leadTable === 'leads_compra') {
            msgPayload.lead_compra_id = leadId;
        } else {
            msgPayload.lead_id = String(leadId);
        }

        const { error: msgInsertError } = await supabase
            .from('whatsapp_messages')
            .insert(msgPayload);

        if (msgInsertError) {
            console.warn('Erro ao inserir em whatsapp_messages (A tabela existe?):', msgInsertError.message);

            // Fallback: Append no resumo do lead temporariamente se a tabela suportar resumo
            try {
                if (leadTable !== 'leads_manos_crm') {
                    const { data: currentInfo } = await supabase
                        .from(leadTable)
                        .select('resumo')
                        .eq('id', leadId)
                        .single();

                    const appendedResumo = `[NOVA MENSAGEM WA]: ${messageText}\n\n${(currentInfo as any)?.resumo || ''}`;
                    await supabase
                        .from(leadTable)
                        .update({ resumo: appendedResumo })
                        .eq('id', leadId);
                }
            } catch (errFallback) {
                console.error('Erro no fallback de resumo:', errFallback);
            }
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
        const errorMsg = `[Webhook WA] Falha crítica: ${error.message}`;
        console.error(errorMsg, error);

        // Dead-letter auditável no banco (substitui o fs.appendFileSync em disco
        // local, que não funciona em serverless). Best-effort: não estoura o handler.
        try {
            const admin = createClient();
            await admin.from('webhook_errors').insert({
                source: 'whatsapp',
                error_message: error?.message || 'erro desconhecido',
                payload: (error && 'payload' in error ? error.payload : null) ?? null,
            });
        } catch (e) {
            console.error('[Webhook WA] Falha ao gravar em webhook_errors:', (e as any)?.message);
        }

        return NextResponse.json({ success: false, error: 'Erro interno no webhook', details: error.message }, { status: 500 });
    }
}
