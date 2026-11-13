import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { rodarFila, rodarRetorno } from '@/lib/avisos/filaRodada';

/**
 * GET /api/cron/wa-fila — fila de espera dos leads e aviso de retorno do cliente.
 *  - lead sem dono (fila_espera): aviso a todos os consultores; 10 min → lembrete; 20 min → alerta ao Alexandre;
 *  - cliente respondeu a um follow-up da Laura: aviso ao consultor responsável.
 * Só age com wa_ia_config.distribuicao = 'fila'. Regras em src/lib/avisos/fila.ts.
 * Chamado pelo pg_cron (a cada 2 min) com Authorization: Bearer <CRON_SECRET>.
 */
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    return await withHeartbeat('wa-fila', async () => {
        const supabase = createClient();
        const fila = await rodarFila(supabase);
        const retorno = fila.modo === 'fila' ? await rodarRetorno(supabase) : { avisados: 0, falhas: 0 };
        const out = { ...fila, retornos: retorno.avisados, falhas: fila.falhas + retorno.falhas };
        return { result: NextResponse.json({ success: out.ok, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
