import { NextResponse } from 'next/server';
import { contextoEspelho, SEM_CACHE, urlDaMidiaEspelho } from '@/lib/espelho/leitura';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/espelho-wa/midia/:id — foto, áudio, vídeo ou documento do WhatsApp espelhado. Só admin.
 * Na primeira vez baixa da Evolution e guarda no bucket privado; depois redireciona
 * para uma URL assinada de 5 minutos. ?download=1 baixa o arquivo.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'mídia inválida' }, { status: 400, headers: SEM_CACHE });
    const ctx = await contextoEspelho();
    if (!ctx.ok) return ctx.res;
    const r = await urlDaMidiaEspelho(ctx, id, new URL(req.url).searchParams.get('download') === '1');
    if (!r.ok) return NextResponse.json({ success: false, error: r.erro }, { status: r.status, headers: SEM_CACHE });
    return NextResponse.redirect(r.url, { status: 302, headers: SEM_CACHE });
}
