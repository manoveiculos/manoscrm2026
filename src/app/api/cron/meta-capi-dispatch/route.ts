import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { configFunil, despacharFila } from '@/lib/services/metaFunnelEvents';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Drena a meta_capi_queue (lead qualificado, visita agendada, venda) para a
 * Meta Conversions API. Chamado pelo pg_cron a cada 5 min.
 *
 * Modo (env META_CAPI_FUNNEL_MODE):
 *   off  (padrão) → não envia nada; a fila acumula (a Meta aceita até 7 dias).
 *   test          → envia com META_TEST_EVENT_CODE, sem consumir a fila.
 *   live          → envia de verdade.
 *
 * ?test_event_code=XXX força um envio de teste nesta execução (útil para
 * validar no Gerenciador de Eventos antes de ligar o live). ?limit=N.
 */
export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const testEventCode = searchParams.get('test_event_code')?.trim() || undefined;
    const limite = Number(searchParams.get('limit')) || undefined;

    try {
        const resumo = await despacharFila(createClient(), { cfg: configFunil(), testEventCode, limite });
        return NextResponse.json({ success: true, ...resumo });
    } catch (err: any) {
        console.error('[meta-capi-dispatch]', err?.message);
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
