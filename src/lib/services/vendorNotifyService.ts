import { createClient } from '@/lib/supabase/admin';

const N8N_WEBHOOK_URL =
    process.env.N8N_VENDOR_WEBHOOK_URL ||
    'https://n8n.drivvoo.com/webhook/chamadavendedorcrm';

export type NotifyType = 'lead_arrival' | 'morning_brief' | 'sla_warning';

interface NotifyPayload {
    consultant_name: string;
    consultant_phone: string;
    type: NotifyType;
    message: string;
    meta?: Record<string, any>;
}

function onlyDigits(s?: string | null): string {
    return (s || '').replace(/\D/g, '');
}

function normalizeBRPhone(raw?: string | null): string {
    const d = onlyDigits(raw);
    if (!d) return '';
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
}

function buildWhatsAppLink(leadPhone?: string | null, presetText?: string): string {
    const phone = normalizeBRPhone(leadPhone);
    if (!phone) return '';
    const text = presetText ? `?text=${encodeURIComponent(presetText)}` : '';
    return `https://wa.me/${phone}${text}`;
}

function classificationEmoji(c?: string): string {
    if (c === 'hot') return '🔥';
    if (c === 'warm') return '🌡️';
    return '❄️';
}

async function sendToWebhook(payload: NotifyPayload): Promise<void> {
    try {
        const res = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            console.warn(`[vendorNotify] webhook ${res.status}`, errorText);
            
            // Log de falha no banco (Auditoria Forense)
            try {
                const admin = createClient();
                await admin.from('notification_failures').insert({
                    lead_id: payload.meta?.lead_id,
                    channel: `n8n_${payload.type}`,
                    payload: payload,
                    error_message: `HTTP ${res.status}: ${errorText}`,
                    resolved: false
                });
            } catch (dbErr) {
                console.error('[vendorNotify] Erro ao gravar falha no banco:', dbErr);
            }
        }
    } catch (err: any) {
        const msg = err?.message || 'Erro de conexão/timeout';
        console.warn('[vendorNotify] webhook error:', msg);

        // Log de falha no banco (Auditoria Forense)
        try {
            const admin = createClient();
            await admin.from('notification_failures').insert({
                lead_id: payload.meta?.lead_id,
                channel: `n8n_${payload.type}`,
                payload: payload,
                error_message: msg,
                resolved: false
            });
        } catch (dbErr) {
            console.error('[vendorNotify] Erro ao gravar falha no banco:', dbErr);
        }
    }
}

/**
 * Dispara WhatsApp para o vendedor responsável quando um lead novo
 * recebe score IA. Speed-to-lead: vendedor recebe no celular pessoal
 * antes de abrir o CRM.
 */
export async function notifyLeadArrival(leadId: string): Promise<void> {
    const admin = createClient();
    const cleanId = leadId.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');

    const { data: lead } = await admin
        .from('leads_manos_crm')
        .select('id, name, phone, vehicle_interest, source, ai_score, ai_classification, proxima_acao, assigned_consultant_id, valor_investimento')
        .eq('id', cleanId)
        .maybeSingle();

    if (!lead || !lead.assigned_consultant_id) return;

    const { data: consultant } = await admin
        .from('consultants_manos_crm')
        .select('id, name, phone, is_active')
        .eq('id', lead.assigned_consultant_id)
        .maybeSingle();

    if (!consultant || !consultant.is_active || !consultant.phone) return;

    const score = Number(lead.ai_score) || 0;
    const cls = lead.ai_classification || 'cold';
    const firstName = (consultant.name || '').split(' ')[0];
    const leadFirstName = (lead.name || 'cliente').split(' ')[0];

    // Script personalizado: usa proxima_acao da IA ou monta fallback
    const script = (lead.proxima_acao && lead.proxima_acao.length > 10)
        ? lead.proxima_acao
        : `Olá ${leadFirstName}! Aqui é o ${firstName} da Manos Veículos. Vi seu interesse${lead.vehicle_interest ? ` no ${lead.vehicle_interest}` : ''}. Posso te ajudar agora?`;

    const wa = buildWhatsAppLink(lead.phone, script);
    const valor = lead.valor_investimento ? `\n💰 R$ ${lead.valor_investimento}` : '';
    const interest = lead.vehicle_interest ? `\n🚗 ${lead.vehicle_interest}` : '';

    const message =
        `${classificationEmoji(cls)} *LEAD NOVO • ${lead.name || 'Sem nome'}* (score ${score})` +
        interest +
        valor +
        `\n📡 ${lead.source || 'Direto'}` +
        `\n\n━━━━━━━━━━━━━━━━━━` +
        `\n📋 *SCRIPT PRONTO — copie e envie:*` +
        `\n━━━━━━━━━━━━━━━━━━\n` +
        `\n${script}\n` +
        `\n━━━━━━━━━━━━━━━━━━` +
        (wa ? `\n🚀 *Abrir conversa (mensagem já carregada):*\n${wa}` : '') +
        `\n\n_⏱️ Resposta em <5min = 9x mais conversão_`;

    await sendToWebhook({
        consultant_name: consultant.name,
        consultant_phone: normalizeBRPhone(consultant.phone),
        type: 'lead_arrival',
        message,
        meta: {
            lead_id: cleanId,
            lead_name: lead.name,
            lead_first_name: leadFirstName,
            lead_phone: normalizeBRPhone(lead.phone),
            lead_score: score,
            lead_classification: cls,
            lead_vehicle: lead.vehicle_interest || '',
            lead_source: lead.source || '',
            lead_valor: lead.valor_investimento || '',
            script: script,
            wa_link: wa,
        },
    });
}

interface MorningLead {
    id: string;
    name: string;
    phone: string;
    ai_score: number;
    ai_classification: string;
    proxima_acao: string;
    vehicle_interest: string;
}

/**
 * Briefing matinal: TOP leads quentes + SLA vencendo, enviado às 08h
 * para o WhatsApp pessoal de cada vendedor ativo.
 */
export async function notifyMorningBrief(): Promise<{ sent: number; skipped: number }> {
    const admin = createClient();
    let sent = 0;
    let skipped = 0;

    const { data: consultants } = await admin
        .from('consultants_manos_crm')
        .select('id, name, phone')
        .eq('is_active', true)
        .neq('role', 'admin');

    if (!consultants || consultants.length === 0) return { sent: 0, skipped: 0 };

    for (const c of consultants) {
        if (!c.phone) {
            skipped++;
            continue;
        }

        const { data: leads } = await admin
            .from('leads_manos_crm')
            .select('id, name, phone, ai_score, ai_classification, proxima_acao, vehicle_interest')
            .eq('assigned_consultant_id', c.id)
            .not('status', 'in', '("vendido","perdido","comprado")')
            .gte('ai_score', 60)
            .order('ai_score', { ascending: false })
            .limit(3);

        const top = (leads || []) as MorningLead[];
        if (top.length === 0) {
            skipped++;
            continue;
        }

        const consFirst = (c.name || '').split(' ')[0];
        const lines = top.map((l, i) => {
            const leadFirst = (l.name || 'cliente').split(' ')[0];
            const script = (l.proxima_acao && l.proxima_acao.length > 10)
                ? l.proxima_acao
                : `Olá ${leadFirst}! Aqui é o ${consFirst} da Manos. Posso retomar nosso contato?`;
            const wa = buildWhatsAppLink(l.phone, script);
            return (
                `\n${i + 1}. ${classificationEmoji(l.ai_classification)} *${l.name || 'Sem nome'}* (score ${l.ai_score})` +
                `\n   🚗 ${l.vehicle_interest || '—'}` +
                (wa ? `\n   🚀 ${wa}` : '')
            );
        }).join('\n');

        const message =
            `☀️ *Bom dia ${consFirst}!*\n` +
            `\n${top.length} ${top.length === 1 ? 'lead quente' : 'leads quentes'} para atacar hoje:\n` +
            lines +
            `\n\n_Cada link já abre a conversa com mensagem pronta. Bora vender._`;

        await sendToWebhook({
            consultant_name: c.name,
            consultant_phone: normalizeBRPhone(c.phone),
            type: 'morning_brief',
            message,
            meta: { lead_count: top.length },
        });
        sent++;
    }

    return { sent, skipped };
}
