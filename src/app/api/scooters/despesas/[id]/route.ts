import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../../_guard';

export const dynamic = 'force-dynamic';

// DELETE /api/scooters/despesas/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;
    const { error } = await supabaseAdmin.from('scooters_despesas').delete().eq('id', id).eq('owner_email', OWNER);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
