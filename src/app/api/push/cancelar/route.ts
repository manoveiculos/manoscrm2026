import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';

export const dynamic = 'force-dynamic';

/** POST /api/push/cancelar — desliga os avisos deste celular. Body: { endpoint }. */
export async function POST(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;

    let body: any;
    try { body = await req.json(); } catch { body = null; }
    const endpoint = String(body?.endpoint || '');
    if (!endpoint || !eu.consultorId) return NextResponse.json({ success: true });

    const { error } = await admin.from('push_inscricoes')
        .update({ ativo: false, atualizado_em: new Date().toISOString() })
        .eq('endpoint', endpoint)
        .eq('consultant_id', eu.consultorId);
    if (error) console.warn('[push/cancelar]', error.message);
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
