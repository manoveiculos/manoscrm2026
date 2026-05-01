import { NextRequest, NextResponse } from 'next/server';
import { altimusStatus, getInventory, findMatch } from '@/lib/services/altimusInventory';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/altimus-status
 *
 * Diagnóstico do feed da Altimus.
 *   - ?refresh=1      → força bypass de cache
 *   - ?match=Onix LT  → testa o match com um interesse hipotético
 *
 * Auth: header x-admin-secret.
 */
export async function GET(req: NextRequest) {
    const secret = req.headers.get('x-admin-secret');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const matchQuery = url.searchParams.get('match');

    if (forceRefresh) {
        await getInventory(true);
    }

    const status = await altimusStatus();

    let matchResult: any = null;
    if (matchQuery) {
        const v = await findMatch(matchQuery);
        matchResult = v ? {
            marca: v.marca,
            modelo: v.modelo,
            versao: v.versao,
            ano: v.ano,
            preco: v.preco,
            link: v.link,
        } : null;
    }

    return NextResponse.json({
        ...status,
        matchQuery,
        matchResult,
    });
}
