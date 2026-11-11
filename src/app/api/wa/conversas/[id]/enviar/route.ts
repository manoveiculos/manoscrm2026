import { NextResponse } from 'next/server';
import { contextoWa } from '@/lib/whatsapp/leituraServidor';
import { providerLoja } from '@/lib/whatsapp/evolutionProvider';
import { enviarPeloCrm, envioPeloCrmLiberado, type ConteudoEnvio } from '@/lib/whatsapp/envio';
import { msgErro } from '@/lib/whatsapp/erro';

/**
 * POST /api/wa/conversas/:id/enviar — o vendedor responde pelo CRM, no número da loja.
 * Corpo: { texto } | { imagem: { base64, mime, legenda? } } | { audio: { base64 } }
 * A conversa só abre para quem a vê (RLS da sessão: vendedor dono, gestor, admin).
 * Registra quem enviou e coloca a conversa em "humano" (a Laura para).
 * Desligado até WA_ENVIO_PELO_CRM=true.
 */
export const maxDuration = 60;
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'conversa inválida' }, { status: 400, headers: SEM_CACHE });
    if (!envioPeloCrmLiberado()) {
        return NextResponse.json({ success: false, error: 'envio pelo CRM ainda não liberado' }, { status: 503, headers: SEM_CACHE });
    }
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });

    const corpo = await req.json().catch(() => null) as Record<string, unknown> | null;
    let conteudo: ConteudoEnvio | null = null;
    if (typeof corpo?.texto === 'string') conteudo = { tipo: 'texto', texto: corpo.texto };
    else if (corpo?.imagem && typeof corpo.imagem === 'object') {
        const i = corpo.imagem as Record<string, unknown>;
        conteudo = { tipo: 'imagem', base64: String(i.base64 || ''), mime: String(i.mime || ''), legenda: typeof i.legenda === 'string' ? i.legenda : undefined };
    } else if (corpo?.audio && typeof corpo.audio === 'object') {
        conteudo = { tipo: 'audio', base64: String((corpo.audio as Record<string, unknown>).base64 || '') };
    }
    if (!conteudo) return NextResponse.json({ success: false, error: 'envie texto, imagem ou áudio' }, { status: 400, headers: SEM_CACHE });

    // A sessão só enxerga a conversa se tiver permissão (RLS): 404 igual a "não existe"
    const { data: conv } = await ctx.sessao.from('wa_conversas').select('id, telefone_key, remote_jid').eq('id', id).maybeSingle();
    if (!conv) return NextResponse.json({ success: false, error: 'conversa não encontrada' }, { status: 404, headers: SEM_CACHE });

    try {
        const r = await enviarPeloCrm(ctx.admin, providerLoja(), conv, conteudo, { autor: 'vendedor', consultantId: ctx.eu.consultorId });
        if (!r.ok) return NextResponse.json({ success: false, error: r.erro || 'não foi possível enviar' }, { status: 502, headers: SEM_CACHE });
        return NextResponse.json({ success: true, providerMessageId: r.providerMessageId }, { headers: SEM_CACHE });
    } catch (e) {
        console.error('[wa/enviar]', msgErro(e));
        return NextResponse.json({ success: false, error: 'falha ao enviar' }, { status: 500, headers: SEM_CACHE });
    }
}
