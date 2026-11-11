import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { rodarFollowups } from '@/lib/whatsapp/ia/followupRodada';

/**
 * GET /api/cron/followup-wa — follow-up da Laura para quem parou de responder.
 * Cadência 1/2/4/10 dias, só horário da loja, ver src/lib/whatsapp/ia/followup.ts.
 * Chamado pelo pg_cron (call_cron_endpoint) com Authorization: Bearer <CRON_SECRET>.
 * Dorme até WA_FOLLOWUP_ATIVO=true. Mesmo ligado, só envia se a Laura estiver em "envia";
 * em "ensaio" só grava o rascunho em wa_followups.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    if ((process.env.WA_FOLLOWUP_ATIVO || '').trim() !== 'true') {
        return NextResponse.json({ success: true, disabled: true, message: 'Follow-up desligado (WA_FOLLOWUP_ATIVO != true).' });
    }
    return await withHeartbeat('followup-wa', async () => {
        const out = await rodarFollowups(createClient());
        return { result: NextResponse.json({ success: out.ok, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
