import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { sincronizarGastoMeta } from '@/lib/services/metaAdSpend';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Puxa o gasto por anúncio/dia da conta Meta para meta_ad_spend_daily.
 * pg_cron diário; ?days=N (padrão 7) reprocessa a janela — a Meta ajusta o
 * gasto dos últimos dias depois do fechamento.
 */
export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const dias = Number(new URL(req.url).searchParams.get('days')) || 7;

    try {
        const resumo = await sincronizarGastoMeta(createClient(), dias);
        return NextResponse.json({ success: true, ...resumo });
    } catch (err: any) {
        console.error('[meta-ad-spend-sync]', err?.message);
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
