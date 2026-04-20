import { NextRequest, NextResponse } from 'next/server';
import { notifyMorningBrief } from '@/lib/services/vendorNotifyService';

export const maxDuration = 60;

/**
 * Cron diário: dispara briefing matinal por WhatsApp para cada vendedor
 * ativo, listando seus 3 leads mais quentes do dia.
 *
 * Substitui o antigo cowork-daily — em vez de painel interno (que vendedor
 * não abre), entrega a urgência onde a atenção dele já está: WhatsApp pessoal.
 *
 * Schedule: 08:00 UTC (vercel.json) — ajuste conforme fuso horário desejado.
 */
export async function GET(req: NextRequest) {
    const expected = process.env.CRON_SECRET;
    if (expected) {
        const auth = req.headers.get('authorization') || '';
        if (auth !== `Bearer ${expected}`) {
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        }
    }

    try {
        const result = await notifyMorningBrief();
        return NextResponse.json({ success: true, ...result });
    } catch (err: any) {
        console.error('[morning-push]', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
