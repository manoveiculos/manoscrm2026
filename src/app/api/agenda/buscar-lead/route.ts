import { NextResponse } from 'next/server';
import { requireVendedor, supabaseAdmin } from '../_guard';

export const dynamic = 'force-dynamic';

// GET /api/agenda/buscar-lead?q=nome-ou-telefone — autocomplete do modal de visita
export async function GET(request: Request) {
    const g = await requireVendedor();
    if (!g.ok) return g.res;

    const raw = (new URL(request.url).searchParams.get('q') || '').trim();
    if (raw.length < 2) return NextResponse.json({ success: true, leads: [] });
    const q = raw.replace(/[,()%]/g, ' ').trim(); // sanitiza pro filtro .or()
    const isPhone = /^[\d\s()+-]+$/.test(raw);
    const phoneDigits = raw.replace(/\D/g, '');

    let query = supabaseAdmin
        .from('leads_unified')
        .select('uid, name, phone, vehicle_interest, status')
        .limit(8);
    query = isPhone && phoneDigits.length >= 4
        ? query.ilike('phone', `%${phoneDigits}%`)
        : query.ilike('name', `%${q}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({
        success: true,
        leads: (data || []).map((l) => ({
            uid: l.uid,
            nome: l.name || 'Sem nome',
            // telefone mascarado (lead sem dono) não serve pra agendar — vai vazio
            telefone: l.phone && !String(l.phone).includes('*') ? l.phone : '',
            veiculo: l.vehicle_interest || '',
            status: l.status || '',
        })),
    });
}
