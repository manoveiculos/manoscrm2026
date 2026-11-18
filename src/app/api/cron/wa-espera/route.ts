import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { rodarEspera } from '@/lib/whatsapp/ia/esperaRodada';

/**
 * GET /api/cron/wa-espera — avisa quem espera um carro quando ele entra no estoque.
 * Regras em src/lib/whatsapp/ia/esperaRodada.ts. Chamado pelo pg_cron com Authorization: Bearer <CRON_SECRET>.
 * Dorme até WA_ESPERA_ATIVO=true (o snapshot do estoque só começa a ser gravado depois disso).
 * Mesmo ligado, só envia se a Laura estiver em "envia"; em "ensaio" apenas conta.
 */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    if ((process.env.WA_ESPERA_ATIVO || '').trim() !== 'true') {
        return NextResponse.json({ success: true, disabled: true, message: 'Lista de espera desligada (WA_ESPERA_ATIVO != true).' });
    }
    return await withHeartbeat('wa-espera', async () => {
        const out = await rodarEspera(createClient());
        return { result: NextResponse.json({ success: out.ok, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
