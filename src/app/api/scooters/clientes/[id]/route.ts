import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../../_guard';

export const dynamic = 'force-dynamic';

const STATUS = new Set(['Lead', 'Negociando', 'Comprou']);

// PATCH /api/scooters/clientes/[id] — muda status e/ou edita cadastro do lead
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;
    const b = await request.json();

    const patch: Record<string, any> = {};
    if (b.status !== undefined) {
        if (!STATUS.has(b.status)) return NextResponse.json({ success: false, error: 'status inválido' }, { status: 400 });
        patch.status = b.status;
    }
    if (b.nome !== undefined) {
        if (!String(b.nome).trim()) return NextResponse.json({ success: false, error: 'nome é obrigatório' }, { status: 400 });
        patch.nome = String(b.nome).trim();
    }
    if (b.whats !== undefined) patch.whats = b.whats || null;
    if (b.interesse !== undefined) patch.interesse = b.interesse || null;
    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: 'nada para atualizar' }, { status: 400 });

    const { error } = await supabaseAdmin.from('scooters_clientes').update(patch).eq('id', id).eq('owner_email', OWNER);
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
