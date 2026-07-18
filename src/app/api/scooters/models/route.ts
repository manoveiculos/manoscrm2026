import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../_guard';

export const dynamic = 'force-dynamic';

// POST /api/scooters/models — cadastrar modelo
export async function POST(request: Request) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const b = await request.json();
    if (!b.modelo) return NextResponse.json({ success: false, error: 'Modelo é obrigatório' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('scooters_models').insert({
        owner_email: OWNER,
        modelo: String(b.modelo),
        custo: Number(b.custo) || 0,
        preco: Number(b.preco) || 0,
        qtd: Number(b.qtd) || 0,
    }).select().single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
}
