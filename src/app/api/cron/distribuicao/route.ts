import { NextResponse } from 'next/server';
import { tickSla } from '@/lib/services/slaEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/distribuicao — motor de distribuição + SLA.
 * Rodar a cada 1min via EasyCron (Vercel Hobby só tem 2 slots de cron nativo).
 *
 * Cada execução (só em horário comercial): distribui standby/aguardando (despejo
 * matinal automático) + verifica o SLA de 10min dos distribuídos e escala quem furou.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    try {
        const out = await tickSla();
        return NextResponse.json(out);
    } catch (e: any) {
        console.error('[cron/distribuicao] erro:', e?.message);
        return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 500 });
    }
}
