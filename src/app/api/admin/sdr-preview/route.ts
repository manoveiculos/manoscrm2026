import { NextRequest, NextResponse } from 'next/server';
import { previewFirstContact, FirstContactInput } from '@/lib/services/aiSdrService';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sdr-preview
 *
 * Body: { leadName, leadPhone?, vehicleInterest, source, consultantName, flow }
 *
 * NÃO grava nada. NÃO envia nada. Apenas devolve o que a IA SDR
 * mandaria. Ferramenta de iteração de prompt para o gestor.
 *
 * Auth: header `x-admin-secret` === CRON_SECRET.
 */
export async function POST(req: NextRequest) {
    const secret = req.headers.get('x-admin-secret');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const flow = body?.flow === 'compra' ? 'compra' : 'venda';

    const input: FirstContactInput = {
        leadId: 'preview',
        leadName: body?.leadName || null,
        leadPhone: body?.leadPhone || '0000000000',
        vehicleInterest: body?.vehicleInterest || null,
        source: body?.source || null,
        consultantName: body?.consultantName || null,
        flow,
    };

    try {
        const preview = await previewFirstContact(input);
        return NextResponse.json({ ok: true, preview, input });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}
