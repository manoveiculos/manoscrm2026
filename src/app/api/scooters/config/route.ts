import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from '../_guard';

export const dynamic = 'force-dynamic';

// PATCH /api/scooters/config — atualiza meta mensal, saldo inicial do caixa e/ou
// meta da loja física (upsert parcial por dono). Aceita snake_case ou camelCase.
export async function PATCH(request: Request) {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    const b = await request.json();

    const patch: Record<string, any> = { owner_email: OWNER };
    let touched = false;
    for (const [col, alt] of [['meta', 'meta'], ['saldo_inicial', 'saldoInicial'], ['meta_loja', 'metaLoja']] as const) {
        const raw = b[col] ?? b[alt];
        if (raw === undefined || raw === null || raw === '') continue;
        const n = Number(raw);
        if (isNaN(n) || n < 0) return NextResponse.json({ success: false, error: `${col} inválido` }, { status: 400 });
        patch[col] = n;
        touched = true;
    }
    if (!touched) return NextResponse.json({ success: false, error: 'nada para atualizar' }, { status: 400 });

    const { error } = await supabaseAdmin.from('scooters_config')
        .upsert(patch, { onConflict: 'owner_email' });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
