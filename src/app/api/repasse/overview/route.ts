import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { OWNER_REPASSE, computeOverview, buildLedger } from '@/lib/repasse/compute';

export const dynamic = 'force-dynamic';
const sb = createClient();

export async function GET() {
    try {
        const [{ data: veiculos }, { data: caixa }] = await Promise.all([
            sb.from('repasse_veiculos').select('*').eq('owner_email', OWNER_REPASSE),
            sb.from('repasse_caixa').select('*').eq('owner_email', OWNER_REPASSE),
        ]);
        const overview = computeOverview(veiculos || [], caixa || []);
        const extrato = buildLedger(veiculos || [], caixa || []).slice(0, 12);
        return NextResponse.json({ success: true, overview, extrato });
    } catch (err: any) {
        console.error('[API Repasse overview] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
