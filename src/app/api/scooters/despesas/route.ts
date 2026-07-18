import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../_guard';

export const dynamic = 'force-dynamic';

// POST /api/scooters/despesas — lança despesa
export async function POST(request: Request) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const b = await request.json();
    if (!b.desc || !b.valor) return NextResponse.json({ success: false, error: 'descrição e valor são obrigatórios' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('scooters_despesas').insert({
        owner_email: OWNER,
        descricao: String(b.desc),
        valor: Number(b.valor) || 0,
        data: b.data || new Date().toISOString().slice(0, 10),
    }).select().single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
}
