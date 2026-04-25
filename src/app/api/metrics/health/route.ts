import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/metrics/health
 *
 * Surface dos pontos onde a operação falha em silêncio:
 *   - Falhas de notificação 24h (notification_failures)
 *   - Envios WhatsApp 24h: ok vs falhos (whatsapp_send_log)
 *   - Consultores ativos com config incompleta (sem personal_whatsapp/user_id)
 *   - Alertas SLA não acknowledged há mais de 1h
 *   - Webhooks: leads recebidos 24h vs leads com first_contact_at em 24h
 *     (drop indica fila parando)
 */

interface HealthSummary {
    notificationFailures: { total: number; byChannel: Record<string, number>; samples: Array<{ channel: string; error: string; created_at: string }> };
    whatsappSends: { total: number; byKind: Record<string, number>; byProvider: Record<string, number> };
    consultantConfig: { total: number; missing: Array<{ id: string; name: string; missing: string[] }> };
    pendingAlerts: { total: number; samples: Array<{ id: string; title: string; created_at: string; consultant_id: string | null }> };
    intake: { receivedLast24h: number; firstContacted24h: number; contactRate: number; orphanLeads: number };
    crons: Array<{ cron_name: string; started_at: string; success: boolean; seconds_since_run: number; duration_ms: number | null; error_message: string | null; stale: boolean }>;
}

// Janela máxima esperada entre execuções (segundos). Acima disso, considera stale.
const CRON_MAX_AGE: Record<string, number> = {
    'sla-watcher': 600,        // a cada 5min, tolerância 10min
    'followup-ai': 5400,       // a cada 1h-3h, tolerância 90min
    'morning-push': 90000,     // diário, tolerância 25h
};

const FINAL = ['vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity'];

export async function GET(_req: NextRequest) {
    const admin = createClient();
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

    const [
        { data: failures },
        { data: sends },
        { data: consultants },
        { data: alerts },
        { data: intakeLeads },
        { data: cronStatus },
    ] = await Promise.all([
        admin.from('notification_failures')
            .select('id, channel, error_message, created_at')
            .eq('resolved', false)
            .gte('created_at', dayAgo)
            .order('created_at', { ascending: false })
            .limit(100),
        admin.from('whatsapp_send_log')
            .select('kind, provider')
            .gte('sent_at', dayAgo)
            .limit(2000),
        admin.from('consultants_manos_crm')
            .select('id, name, personal_whatsapp, user_id, is_active, role')
            .eq('is_active', true)
            .neq('role', 'admin'),
        admin.from('cowork_alerts')
            .select('id, title, created_at, assigned_consultant_id')
            .eq('blocking', true)
            .eq('acknowledged', false)
            .lt('created_at', hourAgo)
            .order('created_at', { ascending: false })
            .limit(20),
        admin.from('leads_unified')
            .select('table_name, native_id, first_contact_at, assigned_consultant_id, status, created_at')
            .gte('created_at', dayAgo)
            .limit(2000),
        admin.from('cron_status').select('*'),
    ]);

    // 1. Falhas
    const byChannel: Record<string, number> = {};
    for (const f of (failures || []) as any[]) {
        byChannel[f.channel] = (byChannel[f.channel] || 0) + 1;
    }
    const failureSamples = (failures || []).slice(0, 10).map((f: any) => ({
        channel: f.channel,
        error: f.error_message || '',
        created_at: f.created_at,
    }));

    // 2. Envios WhatsApp 24h
    const byKind: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    for (const s of (sends || []) as any[]) {
        byKind[s.kind] = (byKind[s.kind] || 0) + 1;
        byProvider[s.provider] = (byProvider[s.provider] || 0) + 1;
    }

    // 3. Config de consultor
    const missing = ((consultants || []) as any[])
        .map(c => {
            const m: string[] = [];
            if (!c.personal_whatsapp) m.push('personal_whatsapp');
            if (!c.user_id) m.push('user_id');
            return m.length > 0 ? { id: c.id, name: c.name, missing: m } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string; missing: string[] }>;

    // 4. Alertas pendentes
    const pendingSamples = ((alerts || []) as any[]).map(a => ({
        id: a.id,
        title: a.title || '(sem título)',
        created_at: a.created_at,
        consultant_id: a.assigned_consultant_id,
    }));

    // 5. Intake
    const leads = (intakeLeads || []) as any[];
    const received24h = leads.length;
    const firstContacted24h = leads.filter(l => l.first_contact_at).length;
    const orphan = leads.filter(l =>
        !l.assigned_consultant_id &&
        !FINAL.includes((l.status || '').toLowerCase())
    ).length;

    // 6. Crons
    const crons = ((cronStatus || []) as any[]).map(c => {
        const tolerance = CRON_MAX_AGE[c.cron_name] ?? 86400;
        return {
            cron_name: c.cron_name,
            started_at: c.started_at,
            success: !!c.success,
            seconds_since_run: Number(c.seconds_since_run) || 0,
            duration_ms: c.duration_ms,
            error_message: c.error_message,
            stale: (Number(c.seconds_since_run) || 0) > tolerance,
        };
    });

    const summary: HealthSummary = {
        notificationFailures: {
            total: (failures || []).length,
            byChannel,
            samples: failureSamples,
        },
        whatsappSends: {
            total: (sends || []).length,
            byKind,
            byProvider,
        },
        consultantConfig: {
            total: (consultants || []).length,
            missing,
        },
        pendingAlerts: {
            total: (alerts || []).length,
            samples: pendingSamples,
        },
        intake: {
            receivedLast24h: received24h,
            firstContacted24h,
            contactRate: received24h > 0 ? firstContacted24h / received24h : 0,
            orphanLeads: orphan,
        },
        crons,
    };

    return NextResponse.json({ ok: true, generated_at: new Date().toISOString(), summary });
}
