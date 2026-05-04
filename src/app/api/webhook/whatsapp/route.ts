import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { pickNextConsultant } from '@/lib/services/consultantService';
import { scheduleFirstContact } from '@/lib/services/aiSdrService';

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

        // Extrai os campos básicos (suporta formato direto ou do n8n)
        const phoneRaw = payload.phone || payload.wa_id || payload.sender;
        const messageText = payload.message || payload.text || payload.body;
        const messageId = payload.message_id || payload.id;
        const senderName = payload.name || payload.pushName || 'Lead WhatsApp';

        if (!phoneRaw || !messageText) {
            console.error(`[Webhook WA] Rejeitado: Campos obrigatórios faltando. Phone: ${phoneRaw}, Msg: ${messageText}`);
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

        // 1. Busca o lead pela varredura de telefone
        const { data: existingLead, error: leadError } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('id, telefone, status')
            .eq('telefone', cleanPhone)
            .limit(1)
            .maybeSingle();

        if (leadError && leadError.code !== 'PGRST116') {
            console.error('Erro ao buscar lead:', leadError);
            throw leadError;
        }

        let leadId = existingLead?.id;

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
                    ai_classification: 'warm', // Classificação padrão até a IA atuar
                    ai_score: 50,
                    assigned_consultant_id: assignedId,
                    vendedor: assignedName, // Campo legado string
                    primeiro_vendedor: assignedName // Rastreabilidade do primeiro dono
                })
                .select('id')
                .single();

            if (insertLeadError) {
                console.error('Erro ao criar lead:', insertLeadError);
                throw insertLeadError;
            }

            leadId = newLead.id;

            // 🤖 AI SDR — primeiro contato automático em ~30s
            // Dispara só para leads NOVOS (existingLead == null), e só se nome
            // for real (não placeholder "Lead WhatsApp").
            // Cliente já mandou msg → IA responde rapidinho com contexto inicial.
            const hasRealName = senderName && senderName.toLowerCase() !== 'lead whatsapp';
            try {
                scheduleFirstContact({
                    leadId: String(leadId),
                    leadName: hasRealName ? senderName : null,
                    leadPhone: cleanPhone,
                    vehicleInterest: null, // não temos da entrada inbound
                    source: 'WhatsApp Ativo',
                    consultantName: assignedName,
                    flow: 'venda',
                }, 'leads_distribuicao_crm_26', 30_000);
                console.log(`[Webhook WA] AI SDR agendado para lead ${leadId} (${senderName})`);
            } catch (sdrErr: any) {
                console.error('[Webhook WA] Falha ao agendar AI SDR (não-bloqueante):', sdrErr?.message);
            }
        } else if (existingLead) {
            // BOIA: toda msg inbound atualiza atualizado_em → lead sobe pro topo do /inbox
            // V3: cliente respondeu → marca respondeu_follow_up + status atendimento_manual
            //     pra IA NÃO mandar mais follow-ups automáticos.
            const isFinal = existingLead.status === 'post_sale' || existingLead.status === 'lost' ||
                            existingLead.status === 'vendido' || existingLead.status === 'perdido' ||
                            existingLead.status === 'frio';
            const now = new Date().toISOString();
            const updates: Record<string, any> = {
                atualizado_em: now,
                respondeu_follow_up: true,             // V3: trava IA
                atendimento_manual_at: now,            // V3: vendedor assume agora
            };
            // Status:
            //   - se era frio/lost/vendido → ressuscita pra received (cliente voltou)
            //   - se era received/triagem → mantém status mas marca atendimento_manual
            if (isFinal) {
                updates.status = 'received';
            } else if (existingLead.status === 'received' || existingLead.status === 'triagem') {
                updates.status = 'attempt'; // vendedor agora tem que tentar fechar
            }

            await supabase
                .from('leads_distribuicao_crm_26')
                .update(updates)
                .eq('id', leadId);

            // V3: marca histórico de follow-up como respondido
            await supabase
                .from('historico_followup')
                .update({ respondido_em: now, resposta_cliente: messageText })
                .eq('lead_id', String(leadId))
                .is('respondido_em', null)
                .then(null, () => {});
        }

        // 3. Salva a mensagem no histórico (nova tabela whatsapp_messages)
        const { error: msgInsertError } = await supabase
            .from('whatsapp_messages')
            .insert({
                lead_id: leadId,
                direction: 'inbound', // Mensagem recebida do cliente
                message_text: messageText,
                message_id: messageId || null
            });

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
