import { NextResponse } from 'next/server';
import { contextoWa, detalheConversa, registrarAbertura } from '@/lib/whatsapp/leituraServidor';
import { msgErro } from '@/lib/whatsapp/erro';

/**
 * GET /api/wa/conversas/:id — mensagens de uma conversa (Fase 3, leitura).
 *   ?abrir=1      o vendedor abriu a conversa: grava no log LGPD e zera as não lidas
 *   ?antes=<iso>  página anterior (mensagens mais antigas)
 * Conversa de outro vendedor responde 404, igual a uma que não existe.
 */
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'conversa inválida' }, { status: 400, headers: SEM_CACHE });

    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });

    const sp = new URL(req.url).searchParams;
    const antes = sp.get('antes');
    if (antes && Number.isNaN(Date.parse(antes))) {
        return NextResponse.json({ success: false, error: 'parâmetro antes inválido' }, { status: 400, headers: SEM_CACHE });
    }
    try {
        const detalhe = await detalheConversa(ctx, id, { antes });
        if (!detalhe) return NextResponse.json({ success: false, error: 'conversa não encontrada' }, { status: 404, headers: SEM_CACHE });
        if (sp.get('abrir') === '1') {
            await registrarAbertura(ctx, detalhe.conversa).catch(e => console.warn('[wa/conversa] log de abertura falhou:', msgErro(e)));
        }
        return NextResponse.json({ success: true, ...detalhe }, { headers: SEM_CACHE });
    } catch (e) {
        console.error('[wa/conversa]', msgErro(e));
        return NextResponse.json({ success: false, error: 'não foi possível carregar a conversa' }, { status: 500, headers: SEM_CACHE });
    }
}
