import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 120;

const ACTIVE_STATUSES = ['new', 'received', 'entrada', 'novo', 'attempt', 'contacted', 'triagem', 'confirmed', 'scheduled', 'visited', 'ataque', 'test_drive', 'proposed', 'negotiation', 'fechamento'];

// Leads sem interação há 48h+ que ainda não estão em status final
const INACTIVITY_HOURS = 48;

/**
 * GET /api/cron/anti-loss
 * Roda diariamente às 02:00 UTC via Vercel Cron.
 * Detecta leads ativos sem atualização há 48h+ e cria alertas anti-perda no Cowork IA.
 * Deduplica: um alerta por lead por dia.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const log: string[] = [];
    let alertsCreated = 0;

    try {
        const threshold = new Date(Date.now() - INACTIVITY_HOURS * 3_600_000).toISOString();

        // Busca leads ativos sem atualização há 48h+
        const { data: leads, error } = await supabase
            .from('leads_manos_crm')
            .select('id, name, status, assigned_consultant_id, updated_at, vehicle_interest, ai_score, ai_classification')
            .in('status', ACTIVE_STATUSES)
            .lt('updated_at', threshold)
            .not('assigned_consultant_id', 'is', null)
            .order('updated_at', { ascending: true })
            .limit(200);

        if (error) throw error;
        if (!leads?.length) {
            return NextResponse.json({ success: true, message: 'Nenhum lead em risco de perda.', alertsCreated: 0 });
        }

        // Busca alertas anti_loss criados hoje para deduplica
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: existingAlerts } = await supabase
            .from('cowork_alerts')
            .select('metadata')
            .eq('type', 'anti_loss')
            .gte('created_at', todayStart.toISOString());

        const alertedTodayIds = new Set(
            (existingAlerts || [])
                .map(a => a.metadata?.lead_id)
                .filter(Boolean)
        );

        // Busca consultores para nome
        const { data: consultants } = await supabase
            .from('consultants_manos_crm')
            .select('id, name');
        const consultantMap = new Map((consultants || []).map(c => [c.id, c.name]));

        const now = Date.now();

        for (const lead of leads) {
            if (alertedTodayIds.has(lead.id)) {
                log.push(`⏭️ ${lead.name} — alerta anti-loss já criado hoje`);
                continue;
            }

            const hoursInactive = Math.round((now - new Date(lead.updated_at).getTime()) / 3_600_000);
            const daysInactive = hoursInactive >= 24 ? `${Math.floor(hoursInactive / 24)} dias` : `${hoursInactive}h`;
            const consultantName = consultantMap.get(lead.assigned_consultant_id) || 'Consultor';

            // Prioridade baseada no score e tempo
            const isHot = lead.ai_classification === 'hot' || (lead.ai_score || 0) >= 70;
            const priority = isHot ? 1 : hoursInactive >= 96 ? 2 : 3;

            const title = `${isHot ? '🔥 Lead quente parado' : 'Lead parado'} há ${daysInactive}`;
            const message = [
                `${consultantName}, o lead "${lead.name}" está sem atualização há ${daysInactive}.`,
                ``,
                isHot ? `⚠️ Este lead tem score ${lead.ai_score || '?'} (${lead.ai_classification?.toUpperCase()}) — risco alto de perda!` : null,
                lead.vehicle_interest ? `Interesse: ${lead.vehicle_interest}` : null,
                `Etapa atual: ${lead.status}`,
                ``,
                `Entre em contato agora ou registre uma interação para reativar.`,
            ].filter(l => l !== null).join('\n');

            const { error: insertErr } = await supabase
                .from('cowork_alerts')
                .insert({
                    type: 'anti_loss',
                    title,
                    message,
                    priority,
                    target_consultant_id: lead.assigned_consultant_id,
                    is_active: true,
                    metadata: {
                        lead_id: lead.id,
                        hours_inactive: hoursInactive,
                        ai_score: lead.ai_score,
                        ai_classification: lead.ai_classification,
                    },
                });

            if (!insertErr) {
                alertsCreated++;
                log.push(`🚨 Anti-loss — ${lead.name} (${lead.status}) · ${daysInactive} inativo · prio ${priority}${isHot ? ' 🔥' : ''}`);
            }
        }

        return NextResponse.json({ success: true, alertsCreated, leadsScanned: leads.length, log });

    } catch (err: any) {
        console.error('[anti-loss]', err);
        return NextResponse.json({ success: false, error: err.message, log }, { status: 500 });
    }
}
