import { NextResponse } from 'next/server';
import { contextoEspelho, mensagensDaConversa, SEM_CACHE } from '@/lib/espelho/leitura';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/espelho-wa/conversas/:id — mensagens de uma conversa espelhada. Só admin.
 *   ?antes=  ISO da mensagem mais antiga já carregada (carregar mais antigas)
 * Abrir a conversa fica registrado em wa_espelho_acessos_log.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'conversa inválida' }, { status: 400, headers: SEM_CACHE });
    const ctx = await contextoEspelho();
    if (!ctx.ok) return ctx.res;
    try {
        const r = await mensagensDaConversa(ctx, id, new URL(req.url).searchParams.get('antes'));
        if (!r) return NextResponse.json({ success: false, error: 'conversa não encontrada' }, { status: 404, headers: SEM_CACHE });
        return NextResponse.json({ success: true, ...r }, { headers: SEM_CACHE });
    } catch (e) {
        console.error('[espelho-wa/conversa]', e);
        return NextResponse.json({ success: false, error: 'Não consegui carregar a conversa.' }, { status: 500, headers: SEM_CACHE });
    }
}
