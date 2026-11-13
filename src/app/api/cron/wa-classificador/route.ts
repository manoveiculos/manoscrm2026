import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { rodarClassificador } from '@/lib/whatsapp/ia/classificadorRodada';

/**
 * GET /api/cron/wa-classificador — Classificador de leads (lê a conversa da Laura e preenche a qualificação).
 * Modo em wa_ia_config.classificador: 'desligado' (padrão) · 'ensaio' · 'grava'. Regras em
 * src/lib/whatsapp/ia/classificador.ts. Chamado pelo pg_cron com Authorization: Bearer <CRON_SECRET>.
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    return await withHeartbeat('wa-classificador', async () => {
        const out = await rodarClassificador(createClient());
        return { result: NextResponse.json({ success: out.ok, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
