import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { rodarCobranca } from '@/lib/avisos/cobrancaRodada';

/**
 * GET /api/cron/wa-cobranca — cobra o consultor quando o cliente fica esperando resposta.
 * 10 min → aviso ao consultor; 30 min → consultor + Alexandre; 120 min → Alexandre.
 * Regras em src/lib/avisos/cobranca.ts. Chamado pelo pg_cron com Authorization: Bearer <CRON_SECRET>.
 * Dorme até WA_COBRANCA_ATIVA=true. Só avisa telefone confirmado por código.
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    if ((process.env.WA_COBRANCA_ATIVA || '').trim() !== 'true') {
        return NextResponse.json({ success: true, disabled: true, message: 'Cobrança desligada (WA_COBRANCA_ATIVA != true).' });
    }
    return await withHeartbeat('wa-cobranca', async () => {
        const out = await rodarCobranca(createClient());
        return { result: NextResponse.json({ success: out.ok, ...out }), metrics: out as unknown as Record<string, unknown> };
    });
}
