import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { rodarAnalista } from '@/lib/whatsapp/ia/analistaRodada';

/**
 * GET /api/cron/wa-analista — Analista de contexto das conversas do WhatsApp da loja.
 * Lê as conversas que ficaram quietas (30 min) e mudaram desde a última análise, e grava
 * a situação em wa_conversas.situacao. Não envia nada a cliente nem a consultor.
 * Chamado pelo fifteen-min-scheduler com Authorization: Bearer <CRON_SECRET>.
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    return await withHeartbeat('wa-analista', async () => {
        const out = await rodarAnalista(createClient());
        return { result: NextResponse.json({ success: out.ok, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
