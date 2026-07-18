import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../_guard';

export const dynamic = 'force-dynamic';

// POST /api/scooters/vendas — registra venda, baixa 1 do estoque e marca cliente "Comprou"
export async function POST(request: Request) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const b = await request.json();
    if (!b.scooterId || !b.cliente || !b.valor) {
        return NextResponse.json({ success: false, error: 'modelo, cliente e valor são obrigatórios' }, { status: 400 });
    }

    const { data: model } = await supabaseAdmin.from('scooters_models')
        .select('id, modelo, custo, qtd').eq('id', b.scooterId).eq('owner_email', OWNER).maybeSingle();
    if (!model) return NextResponse.json({ success: false, error: 'modelo não encontrado' }, { status: 404 });

    // 1) grava a venda (snapshot de modelo + custo)
    const { data: venda, error: vErr } = await supabaseAdmin.from('scooters_vendas').insert({
        owner_email: OWNER,
        model_id: model.id,
        modelo: model.modelo,
        custo: Number(model.custo) || 0,
        cliente: String(b.cliente),
        valor: Number(b.valor) || 0,
        pagamento: b.pagamento || 'Pix',
        data: b.data || new Date().toISOString().slice(0, 10),
    }).select().single();
    if (vErr) return NextResponse.json({ success: false, error: vErr.message }, { status: 500 });

    // 2) baixa 1 do estoque
    await supabaseAdmin.from('scooters_models').update({ qtd: Math.max(0, (model.qtd || 0) - 1) }).eq('id', model.id);

    // 3) marca o cliente como "Comprou" (match por nome, case-insensitive)
    await supabaseAdmin.from('scooters_clientes').update({ status: 'Comprou' })
        .eq('owner_email', OWNER).ilike('nome', String(b.cliente));

    return NextResponse.json({ success: true, id: venda.id });
}
