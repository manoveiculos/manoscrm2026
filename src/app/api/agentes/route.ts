import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { carregarEntradaAgentes, carregarPainel } from '@/lib/agentes/carregar';
import { estadoDosAgentes } from '@/lib/agentes/estado';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/agentes — Central dos Agentes (só admin).
 * Estado de cada agente, feed ao vivo e a fila de decisões do maestro, tudo a
 * partir de registros reais. A tela chama a cada 10 s e quando o Realtime avisa.
 */
export async function GET() {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    if (ctx.eu.perfil !== 'admin') {
        return NextResponse.json({ success: false, error: 'Só o admin vê a Central dos Agentes.' }, { status: 403 });
    }
    try {
        const [entrada, painel] = await Promise.all([carregarEntradaAgentes(ctx.admin), carregarPainel(ctx.admin)]);
        return NextResponse.json({ success: true, ...estadoDosAgentes(entrada), painel }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: any) {
        console.error('[agentes]', e?.message || e);
        return NextResponse.json({ success: false, error: 'Não consegui montar a Central agora.' }, { status: 500 });
    }
}
