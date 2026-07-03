import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { computeOverview, buildLedger } from '@/lib/repasse/compute';
import { getRepasseOwner } from '@/lib/repasse/owner';

export const dynamic = 'force-dynamic';
const sb = createClient();

export async function GET() {
    try {
        const owner = await getRepasseOwner();
        if (!owner) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        const [{ data: veiculos }, { data: caixa }] = await Promise.all([
            sb.from('repasse_veiculos').select('*').eq('owner_email', owner),
            sb.from('repasse_caixa').select('*').eq('owner_email', owner),
        ]);
        const overview = computeOverview(veiculos || [], caixa || []);
        const extrato = buildLedger(veiculos || [], caixa || []).slice(0, 12);
        return NextResponse.json({ success: true, overview, extrato });
    } catch (err: any) {
        console.error('[API Repasse overview] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
