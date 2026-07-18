import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../_guard';

export const dynamic = 'force-dynamic';

// POST /api/scooters/clientes — novo cliente / lead
export async function POST(request: Request) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const b = await request.json();
    if (!b.nome) return NextResponse.json({ success: false, error: 'Nome é obrigatório' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('scooters_clientes').insert({
        owner_email: OWNER,
        nome: String(b.nome),
        whats: b.whats || null,
        interesse: b.interesse || null,
        status: 'Lead',
    }).select().single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
}
