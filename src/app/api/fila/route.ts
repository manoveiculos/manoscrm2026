import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { carregarEntradaFila } from '@/lib/fila/carregarFila';
import { montarFila } from '@/lib/fila/montarFila';
import { dicaDaSemana } from '@/lib/fila/dicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/fila — "Minha Fila" do consultor logado (Fase 1 da repaginação).
 *
 * Só os leads do próprio consultor, em ordem de prioridade. A chave de
 * serviço fica aqui no servidor; a tela recebe só o que vai mostrar.
 */
export async function GET() {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;
    const agora = Date.now();
    const headers = { 'Cache-Control': 'no-store' };

    if (!eu.consultorId) {
        // Admin sem linha em consultants_manos_crm: não tem lead próprio.
        return NextResponse.json({
            success: true,
            perfil: eu.perfil,
            nome: null,
            fila: montarFila({ agora, pisoEstoque: null, leads: [], perdidos: [], estoque: [], visitas: [], retornos: [], voltou: [], conversas: {} }),
            dica: dicaDaSemana(agora),
            aviso: 'Seu login não tem cadastro de consultor, então não há leads seus para mostrar.',
        }, { headers });
    }

    try {
        const entrada = await carregarEntradaFila(admin, { consultorId: eu.consultorId, authId: eu.authId }, agora);
        return NextResponse.json({
            success: true,
            perfil: eu.perfil,
            nome: eu.nome,
            fila: montarFila(entrada),
            dica: dicaDaSemana(agora),
        }, { headers });
    } catch (e: any) {
        console.error('[fila] erro:', e?.message || e);
        return NextResponse.json({ success: false, error: e?.message || 'erro ao montar a fila' }, { status: 500, headers });
    }
}
