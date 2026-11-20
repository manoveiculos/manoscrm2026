import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { despacharGoogle } from '@/lib/services/googleConversoes';

/**
 * GET /api/cron/google-conversoes — devolve ao Google Ads as conversões do funil (lead qualificado, visita, venda)
 * dos leads que vieram do Google. Regras em src/lib/services/googleConversoes.ts.
 * Chamado pelo pg_cron com Authorization: Bearer <CRON_SECRET>.
 * Modo (GOOGLE_ADS_CONVERSIONS_MODE): off (padrão: não faz nada) | test (valida no Google sem gravar) | live.
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    return await withHeartbeat('google-conversoes', async () => {
        const out = await despacharGoogle(createClient());
        return { result: NextResponse.json({ success: true, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
