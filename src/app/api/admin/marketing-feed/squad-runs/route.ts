import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/marketing-feed/squad-runs?squad=vitrine
 *
 * Histórico completo de um squad específico (drill-down do card no painel
 * /admin/marketing) — não só as últimas 60 execuções globais que o feed
 * principal traz, e sim tudo desse squad (até 150 execuções).
 */
export async function GET(req: NextRequest) {
    const squad = req.nextUrl.searchParams.get('squad');
    if (!squad) {
        return NextResponse.json({ success: false, error: 'parâmetro squad é obrigatório' }, { status: 400 });
    }

    const admin = createClient();
    const { data, error } = await admin
        .from('marketing_agent_runs')
        .select('id, squad, skill_name, run_type, status, title, summary, input_ref, output_ref, metrics, requires_approval, approved_by, approved_at, rejected_reason, error_message, created_at')
        .eq('squad', squad)
        .order('created_at', { ascending: false })
        .limit(150);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, runs: data || [] });
}
