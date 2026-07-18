import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../../_guard';

export const dynamic = 'force-dynamic';

// PATCH /api/scooters/vendas/[id] — corrige dados da venda (não mexe no estoque)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;
    const b = await request.json();

    const patch: Record<string, any> = {};
    if (b.cliente !== undefined) patch.cliente = String(b.cliente);
    if (b.valor !== undefined) patch.valor = Number(b.valor) || 0;
    if (b.custo !== undefined) patch.custo = Number(b.custo) || 0;
    if (b.pagamento !== undefined) patch.pagamento = b.pagamento || null;
    if (b.data !== undefined) patch.data = b.data;
    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: 'nada para atualizar' }, { status: 400 });

    const { error } = await supabaseAdmin.from('scooters_vendas').update(patch).eq('id', id).eq('owner_email', OWNER);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

// DELETE /api/scooters/vendas/[id] — exclui a venda e DEVOLVE 1 ao estoque do modelo
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const { id } = await params;

    const { data: v } = await supabaseAdmin.from('scooters_vendas')
        .select('model_id').eq('id', id).eq('owner_email', OWNER).maybeSingle();
    if (!v) return NextResponse.json({ success: false, error: 'venda não encontrada' }, { status: 404 });

    // devolve a unidade ao estoque (se o modelo ainda existe)
    if (v.model_id) {
        const { data: m } = await supabaseAdmin.from('scooters_models').select('qtd').eq('id', v.model_id).maybeSingle();
        if (m) await supabaseAdmin.from('scooters_models').update({ qtd: (m.qtd || 0) + 1 }).eq('id', v.model_id);
    }

    const { error } = await supabaseAdmin.from('scooters_vendas').delete().eq('id', id).eq('owner_email', OWNER);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
