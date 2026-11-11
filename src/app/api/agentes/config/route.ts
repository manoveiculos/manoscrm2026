import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { AGENTES, ID_IA_GERAL } from '@/lib/agentes/catalogo';
import { gravarConfig, tabelaAusente } from '@/lib/agentes/config';

export const dynamic = 'force-dynamic';

const MODOS = ['ligado', 'ensaio', 'desligado'] as const;

/**
 * POST /api/agentes/config — liga, desliga ou põe em ensaio um agente (ou a IA
 * geral). Só admin. Body: { agente_id, modo }.
 *
 * A Laura NÃO passa por aqui: o modo dela é o botão da tela Conversas
 * (wa_ia_config). O interruptor geral 'ia_geral' vale para ela quando a sessão
 * da Laura integrar a checagem.
 */
export async function POST(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;
    if (eu.perfil !== 'admin') return NextResponse.json({ success: false, error: 'Só o admin liga e desliga agentes.' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { body = null; }
    const agenteId = String(body?.agente_id || '');
    const modo = String(body?.modo || '') as typeof MODOS[number];
    const valido = agenteId === ID_IA_GERAL || AGENTES.some(a => a.id === agenteId);
    if (!valido || !MODOS.includes(modo)) return NextResponse.json({ success: false, error: 'Agente ou modo inválido.' }, { status: 400 });
    if (agenteId === 'laura') {
        return NextResponse.json({ success: false, error: 'O modo da Laura é o botão da tela Conversas.' }, { status: 400 });
    }
    if (agenteId === ID_IA_GERAL && modo === 'ensaio') {
        return NextResponse.json({ success: false, error: 'A IA geral só liga ou desliga.' }, { status: 400 });
    }

    const { error } = await gravarConfig(admin, agenteId, modo, eu.email || eu.nome || 'admin');
    if (error) {
        if (tabelaAusente(error.message)) {
            return NextResponse.json({
                success: false,
                error: 'Interruptor ainda não instalado: falta aplicar a migration 20261106b_agentes_config (precisa do seu aprovado).',
            }, { status: 503 });
        }
        console.error('[agentes/config]', error.message);
        return NextResponse.json({ success: false, error: 'Não consegui salvar.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, agente_id: agenteId, modo });
}
