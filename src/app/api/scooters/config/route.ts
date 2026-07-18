import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../_guard';

export const dynamic = 'force-dynamic';

// PATCH /api/scooters/config — atualiza a meta mensal (upsert por dono)
export async function PATCH(request: Request) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const b = await request.json();
    const meta = Number(b.meta);
    if (isNaN(meta) || meta < 0) return NextResponse.json({ success: false, error: 'meta inválida' }, { status: 400 });

    const { error } = await supabaseAdmin.from('scooters_config')
        .upsert({ owner_email: OWNER, meta }, { onConflict: 'owner_email' });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
