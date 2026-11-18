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
    // Reprovação grava em rejected_*: approved_* só existe quando foi aprovado de fato,
    // senão as rotinas e a tela leem uma reprovação como aprovação.
    const agora = new Date().toISOString();
    const patch: Record<string, string | null> = action === 'approve'
        ? { status: 'approved', approved_by: guard.email, approved_at: agora }
        : { status: 'rejected', rejected_by: guard.email, rejected_at: agora, rejected_reason: reason || null };

    // Só decide o que ainda está pendente: evita reprovar algo já aprovado (e vice-versa)
    // por clique duplo ou tela desatualizada.
    const { data, error } = await admin
        .from('marketing_agent_runs')
        .update(patch)
        .eq('id', runId)
        .is('approved_at', null)
        .is('rejected_at', null)
        .select('id, status')
        .maybeSingle();

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ success: false, error: 'Esse item já foi decidido ou não existe.' }, { status: 409 });
    }

    return NextResponse.json({ success: true, run: data });
}
