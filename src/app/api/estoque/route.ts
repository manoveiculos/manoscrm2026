import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { estoqueAtual, filtrarEstoque } from '@/lib/estoque';

export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque?busca=&id=&limite= — estoque para as telas do CRM (login obrigatório).
 * Mesma fonte da Laura: feed da Altimus, nunca a tabela `estoque`.
 */
export async function GET(req: NextRequest) {
    const c = await consultorLogado();
    if (!c.ok) return c.res;
    const u = new URL(req.url).searchParams;
    const estado = await estoqueAtual();
    const carros = filtrarEstoque(estado.carros, { busca: u.get('busca'), id: u.get('id'), limite: Number(u.get('limite')) || 50 });
    return NextResponse.json(
        { success: true, desatualizado: estado.desatualizado, atualizadoEm: estado.atualizadoEm, carros },
        { headers: { 'Cache-Control': 'no-store, private' } },
    );
}
