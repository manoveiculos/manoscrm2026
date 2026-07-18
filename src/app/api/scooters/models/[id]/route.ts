import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../../_guard';

export const dynamic = 'force-dynamic';

// PATCH /api/scooters/models/[id] — editar campos ou ajustar estoque (qtd_delta)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;
    const b = await request.json();

    // Ajuste de estoque por delta (+1 / −1), como no app original
    if (typeof b.qtd_delta === 'number') {
        const { data: cur } = await supabaseAdmin.from('scooters_models').select('qtd').eq('id', id).eq('owner_email', OWNER).maybeSingle();
        if (!cur) return NextResponse.json({ success: false, error: 'modelo não encontrado' }, { status: 404 });
        const novo = Math.max(0, (cur.qtd || 0) + b.qtd_delta);
        const { error } = await supabaseAdmin.from('scooters_models').update({ qtd: novo }).eq('id', id).eq('owner_email', OWNER);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, qtd: novo });
    }

    const patch: Record<string, any> = {};
    if (b.modelo !== undefined) patch.modelo = String(b.modelo);
    if (b.custo !== undefined) patch.custo = Number(b.custo) || 0;
    if (b.preco !== undefined) patch.preco = Number(b.preco) || 0;
    if (b.qtd !== undefined) patch.qtd = Math.max(0, Number(b.qtd) || 0);
    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: 'nada para atualizar' }, { status: 400 });

    const { error } = await supabaseAdmin.from('scooters_models').update(patch).eq('id', id).eq('owner_email', OWNER);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

// DELETE /api/scooters/models/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;
    const { error } = await supabaseAdmin.from('scooters_models').delete().eq('id', id).eq('owner_email', OWNER);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
