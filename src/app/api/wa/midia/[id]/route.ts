import { NextResponse } from 'next/server';
import { contextoWa, urlDaMidia } from '@/lib/whatsapp/leituraServidor';

/**
 * GET /api/wa/midia/:id — foto, áudio, vídeo ou documento de uma mensagem.
 * Confere pela sessão (RLS) que a pessoa vê a mensagem, grava em
 * wa_acessos_log e redireciona para uma URL assinada que vale 5 minutos.
 *   ?download=1   baixar o arquivo (documento)
 * O bucket whatsapp-midia não tem política nenhuma: só este caminho entrega.
 */
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'mídia inválida' }, { status: 400, headers: SEM_CACHE });

    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });

    const download = new URL(req.url).searchParams.get('download') === '1';
    const r = await urlDaMidia(ctx, id, download);
    if (!r.ok) return NextResponse.json({ success: false, error: r.erro }, { status: r.status, headers: SEM_CACHE });
    return NextResponse.redirect(r.url, { status: 302, headers: SEM_CACHE });
}
