import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../../_guard';

export const dynamic = 'force-dynamic';

const STATUS = new Set(['Lead', 'Negociando', 'Comprou']);

// PATCH /api/scooters/clientes/[id] — muda status do lead
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;
    const b = await request.json();
    if (!STATUS.has(b.status)) return NextResponse.json({ success: false, error: 'status inválido' }, { status: 400 });

    const { error } = await supabaseAdmin.from('scooters_clientes').update({ status: b.status }).eq('id', id).eq('owner_email', OWNER);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

// DELETE /api/scooters/clientes/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;
    const { error } = await supabaseAdmin.from('scooters_clientes').delete().eq('id', id).eq('owner_email', OWNER);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
