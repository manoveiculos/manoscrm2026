import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { assignNextConsultant } from '@/lib/services/autoAssignService';

/**
 * POST /api/alerts/acknowledge
 *
 * Body: { alert_id: string, action: 'will_respond' | 'transfer' }
 *
 * - will_respond: marca alerta como acknowledged, fecha o modal
 * - transfer:     marca acknowledged + reatribui o lead pro próximo vendedor
 */

export async function POST(req: NextRequest) {
    try {
        const { alert_id, action } = await req.json();
        if (!alert_id || !action) {
            return NextResponse.json({ error: 'alert_id e action obrigatórios' }, { status: 400 });
        }

        const admin = createClient();

        const { data: alert } = await admin
            .from('cowork_alerts')
            .select('id, lead_id, assigned_consultant_id')
            .eq('id', alert_id)
            .maybeSingle();

        if (!alert) {
            return NextResponse.json({ error: 'alerta não encontrado' }, { status: 404 });
        }

        await admin.from('cowork_alerts')
            .update({
                acknowledged: true,
                acknowledged_at: new Date().toISOString(),
                acknowledged_action: action,
            })
            .eq('id', alert_id);

        if (action === 'transfer' && alert.lead_id) {
            // Reatribui lead → próximo vendedor (autoAssign já evita repetição via stats)
            const newId = await assignNextConsultant(alert.lead_id, 'leads_manos_crm').catch(() => null);
            await admin.from('sla_escalations').insert({
                lead_id: alert.lead_id,
                lead_table: 'leads_manos_crm',
                consultant_id: alert.assigned_consultant_id,
                level: 3,
                notes: `Transferência manual via modal bloqueante → ${newId || 'falhou'}`,
            });
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('[acknowledge]', e);
        return NextResponse.json({ error: e?.message || 'erro interno' }, { status: 500 });
    }
}
