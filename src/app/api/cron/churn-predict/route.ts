import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const maxDuration = 120;

/**
 * GET /api/cron/churn-predict
 * Executa diariamente às 06:00 UTC (03:00 BRT).
 * Calcula churn_probability para todos os leads ativos e notifica admin
 * quando um consultor está sobrecarregado (> 15 leads ativos).
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const admin = createClient();
    const now = Date.now();
    const log: string[] = [];
    let updated = 0;

    const ACTIVE_STATUSES = ['new', 'received', 'attempt', 'contacted', 'triagem', 'ataque',
        'confirmed', 'scheduled', 'negotiation', 'proposed', 'fechamento'];

    const { data: leads, error } = await admin
        .from('leads_manos_crm')
        .select('id, status, updated_at, created_at, ai_score, ai_classification, assigned_consultant_id')
        .in('status', ACTIVE_STATUSES)
        .limit(500);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const allLeads = leads || [];

    // Calcula churn_probability para cada lead
    for (const lead of allLeads) {
        const churn = calcChurn(lead, now);

        await admin
            .from('leads_manos_crm')
            .update({ churn_probability: churn })
            .eq('id', lead.id);

        updated++;
    }

    log.push(`📊 ${updated} leads atualizados com churn_probability`);

    // 3.3 — DETECÇÃO DE CONSULTOR SOBRECARREGADO
    const OVERLOAD_THRESHOLD = 15;
    const loadMap: Record<string, number> = {};
    for (const lead of allLeads) {
        const cid = lead.assigned_consultant_id;
        if (cid) loadMap[cid] = (loadMap[cid] || 0) + 1;
    }

    for (const [consultantId, count] of Object.entries(loadMap)) {
        if (count > OVERLOAD_THRESHOLD) {
            // Dedup: não cria se já existe alerta hoje
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data: existing } = await admin
                .from('follow_ups')
                .select('id')
                .eq('user_id', consultantId)
                .eq('type', 'admin_overload')
                .gte('created_at', todayStart.toISOString())
                .maybeSingle();

            if (!existing) {
                await admin.from('follow_ups').insert({
                    lead_id: null,
                    user_id: 'admin',
                    scheduled_at: new Date().toISOString(),
                    type: 'admin_overload',
                    note: `⚠️ Consultor ${consultantId} está com ${count} leads ativos (limite: ${OVERLOAD_THRESHOLD}). Redistribuição recomendada.`,
                    priority: 'high',
                    status: 'pending',
                    metadata: JSON.stringify({ consultant_id: consultantId, lead_count: count }),
                });
                log.push(`⚠️ Overload: consultor ${consultantId} → ${count} leads ativos`);
            }
        }
    }

    // Resumo de leads em risco crítico (churn > 70)
    const { count: highChurnCount } = await admin
        .from('leads_manos_crm')
        .select('id', { count: 'exact', head: true })
        .gt('churn_probability', 70)
        .in('status', ACTIVE_STATUSES);

    log.push(`🔴 ${highChurnCount ?? 0} leads com churn > 70%`);

    return NextResponse.json({ success: true, updated, log });
}

function calcChurn(lead: {
    updated_at?: string;
    created_at: string;
    ai_score?: number;
    ai_classification?: string;
    status: string;
}, now: number): number {
    let score = 30;

    const hoursInactive = (now - new Date(lead.updated_at || lead.created_at).getTime()) / 3_600_000;

    // Penalidade por inatividade
    if (hoursInactive > 72)      score += 40;
    else if (hoursInactive > 48) score += 25;
    else if (hoursInactive > 24) score += 15;
    else if (hoursInactive > 12) score += 5;
    else                          score -= 10;

    // Influência do ai_score
    const aiScore = Number(lead.ai_score) || 0;
    if (aiScore >= 70)      score -= 20;
    else if (aiScore >= 40) score -= 5;
    else if (aiScore > 0)   score += 15;

    // Classificação IA
    if (lead.ai_classification === 'hot')  score -= 15;
    else if (lead.ai_classification === 'cold') score += 15;

    // Estágios de fechamento com inatividade são críticos
    const closingStages = ['fechamento', 'negotiation', 'proposed'];
    if (closingStages.includes(lead.status) && hoursInactive > 6) score += 10;

    return Math.max(0, Math.min(99, Math.round(score)));
}
