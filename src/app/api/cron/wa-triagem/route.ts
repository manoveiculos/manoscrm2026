import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { rodarTriagem } from '@/lib/whatsapp/ia/triagemRodada';

/**
 * GET /api/cron/wa-triagem — triagem da Laura nos leads de anúncio (Google, WhatsApp e Facebook).
 * Lead preso em 'triagem_laura': a Laura manda a primeira mensagem ou o lead é liberado para a roleta.
 * Regras em src/lib/whatsapp/ia/triagem.ts. Chamado pelo pg_cron (a cada 2 min).
 *
 * A chave de verdade é wa_ia_config.triagem_google (no banco), que também decide se o lead novo
 * entra preso. Esta rota roda SEMPRE (com a chave desligada ela só libera quem estiver preso):
 * assim, desligar a triagem nunca deixa lead parado.
 */
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    return await withHeartbeat('wa-triagem', async () => {
        const out = await rodarTriagem(createClient());
        return { result: NextResponse.json({ success: out.ok, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
