import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/marketing-feed
 *
 * Estado do painel /admin/marketing (Time de Marketing).
 * Mesmo padrão do /api/admin/live-feed: leitura via service role, sem guard
 * extra (a rota /admin/marketing já é adminOnly na navegação).
 */
export async function GET(_req: NextRequest) {
    const admin = createClient();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [kpisRes, recentRes, pendingRes] = await Promise.all([
        admin.from('vw_marketing_squad_kpis').select('*'),
        admin
            .from('marketing_agent_runs')
            .select('id, squad, skill_name, run_type, status, title, summary, input_ref, output_ref, metrics, requires_approval, approved_by, approved_at, rejected_reason, error_message, created_at')
            .order('created_at', { ascending: false })
            .limit(60),
        admin
            .from('marketing_agent_runs')
            .select('id, squad, skill_name, run_type, title, summary, input_ref, output_ref, metrics, created_at')
            .eq('requires_approval', true)
            .is('approved_at', null)
            .order('created_at', { ascending: false })
            .limit(50),
    ]);

    if (kpisRes.error) console.error('marketing-feed kpis error:', kpisRes.error);
    if (recentRes.error) console.error('marketing-feed recent error:', recentRes.error);
    if (pendingRes.error) console.error('marketing-feed pending error:', pendingRes.error);

    // Série diária (14 dias) pro gráfico de tendência, por squad
    const { data: dailyRaw } = await admin
        .from('marketing_agent_runs')
        .select('squad, created_at')
        .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());

    const dailyMap: Record<string, Record<string, number>> = {};
    for (const row of dailyRaw || []) {
        const day = (row.created_at as string).slice(0, 10);
        dailyMap[day] = dailyMap[day] || {};
        dailyMap[day][row.squad] = (dailyMap[day][row.squad] || 0) + 1;
    }
    const daily = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, counts]) => ({ day, ...counts }));

    return NextResponse.json({
        kpis: kpisRes.data || [],
        recentRuns: recentRes.data || [],
        pendingApprovals: pendingRes.data || [],
        daily,
        generated_at: new Date().toISOString(),
        weekAgo,
    });
}
