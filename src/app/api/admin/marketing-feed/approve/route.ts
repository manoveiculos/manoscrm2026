import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '../../../marketing/_guard';

/**
 * POST /api/admin/marketing-feed/approve
 *
 * Ação humana sobre um item pendente do squad (ex.: proposta do Perito).
 * Quem aprova/rejeita sai da SESSÃO (cookie), nunca do body — mesmo cuidado
 * do /api/societario/aprovacao.
 *
 * Body: { "runId": "...", "action": "approve" | "reject", "reason"?: "..." }
 */
export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.res;

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
    }

    const { runId, action, reason } = body || {};
    if (!runId || (action !== 'approve' && action !== 'reject')) {
        return NextResponse.json({ success: false, error: 'Informe runId e action ("approve" ou "reject").' }, { status: 400 });
    }

    const admin = createAdminClient();
    const patch: Record<string, any> = {
        approved_by: guard.email,
        approved_at: new Date().toISOString(),
        status: action === 'approve' ? 'approved' : 'rejected',
    };
    if (action === 'reject') patch.rejected_reason = reason || null;

    const { data, error } = await admin
        .from('marketing_agent_runs')
        .update(patch)
        .eq('id', runId)
        .select('id, status')
        .single();

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, run: data });
}
