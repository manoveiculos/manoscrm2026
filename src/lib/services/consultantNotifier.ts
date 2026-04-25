import { createClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from './whatsappSender';

/**
 * consultantNotifier — pressiona vendedor por canais inescapáveis.
 *
 * Canais:
 *   1. WhatsApp pessoal do vendedor (via whatsappSender)
 *   2. cowork_alerts (modal bloqueante no CRM, lido via Realtime no front)
 *
 * Rate limit: 1 push WhatsApp por consultor por 10min
 * (modal interno NÃO tem rate limit — quanto mais vencido, mais alertas).
 */

export type AlertLevel = 1 | 2 | 3; // 1=info, 2=urgente, 3=crítico

export interface ConsultantAlertArgs {
    consultantId: string;
    leadId?: string;
    level: AlertLevel;
    title: string;
    message: string;
    /** Se true, cria modal bloqueante (level 2+ por padrão). */
    blocking?: boolean;
}

const PUSH_RATE_LIMIT_MS = 10 * 60 * 1000;

async function getConsultant(id: string) {
    const admin = createClient();
    const { data } = await admin
        .from('consultants_manos_crm')
        .select('id, name, phone, personal_whatsapp, is_active')
        .eq('id', id)
        .maybeSingle();
    return data;
}

async function recentlyPushed(consultantId: string): Promise<boolean> {
    try {
        const admin = createClient();
        const cutoff = new Date(Date.now() - PUSH_RATE_LIMIT_MS).toISOString();
        const { data } = await admin
            .from('whatsapp_send_log')
            .select('id')
            .eq('kind', 'vendor_alert')
            .ilike('lead_id', `c:${consultantId}%`)
            .gte('sent_at', cutoff)
            .limit(1);
        return (data?.length || 0) > 0;
    } catch {
        return false;
    }
}

/**
 * Cria registro em cowork_alerts (consumido por modal bloqueante via Realtime).
 */
async function createCoworkAlert(args: ConsultantAlertArgs) {
    try {
        const admin = createClient();
        const blocking = args.blocking ?? args.level >= 2;
        await admin.from('cowork_alerts').insert({
            assigned_consultant_id: args.consultantId,
            lead_id: args.leadId ?? null,
            type: 'urgency',
            priority: args.level === 3 ? 1 : args.level === 2 ? 2 : 3,
            title: args.title,
            message: args.message,
            blocking,
            acknowledged: false,
            created_at: new Date().toISOString(),
        });
    } catch (e: any) {
        console.warn('[consultantNotifier] cowork_alert falhou:', e?.message);
    }
}

/**
 * Notifica o consultor:
 *   - Sempre cria cowork_alert (modal interno).
 *   - Em level 2+ tenta push WhatsApp pessoal (com rate limit).
 */
export async function notifyConsultant(args: ConsultantAlertArgs): Promise<{ pushSent: boolean; alertCreated: boolean }> {
    await createCoworkAlert(args);

    if (args.level < 2) {
        return { pushSent: false, alertCreated: true };
    }

    const cons = await getConsultant(args.consultantId);
    if (!cons || !cons.is_active) return { pushSent: false, alertCreated: true };

    const targetPhone = cons.personal_whatsapp || cons.phone;
    if (!targetPhone) return { pushSent: false, alertCreated: true };

    if (await recentlyPushed(args.consultantId)) {
        return { pushSent: false, alertCreated: true };
    }

    const emoji = args.level === 3 ? '🚨🚨' : '⚠️';
    const greeting = (cons.name || '').split(' ')[0];
    const text = `${emoji} ${greeting}, atenção:\n\n${args.title}\n${args.message}\n\nResponda agora ou o lead vai pra outro vendedor.`;

    const result = await sendWhatsApp({
        toPhone: targetPhone,
        message: text,
        kind: 'vendor_alert',
        leadId: `c:${args.consultantId}:${args.leadId || ''}`,
        consultantId: args.consultantId,
        skipDedup: true,
    });

    return { pushSent: result.ok, alertCreated: true };
}
