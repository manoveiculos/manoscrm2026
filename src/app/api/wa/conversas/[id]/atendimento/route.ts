import { NextResponse } from 'next/server';
import { contextoWa } from '@/lib/whatsapp/leituraServidor';
import { mudarAtendimento } from '@/lib/whatsapp/envio';

/**
 * POST /api/wa/conversas/:id/atendimento — botões "Assumir" e "Devolver para a IA".
 * Corpo: { acao: 'assumir' | 'devolver' }. Quem vê a conversa (RLS) pode mudar.
 * Assumir: a Laura para de responder. Devolver: a Laura volta.
 */
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'conversa inválida' }, { status: 400, headers: SEM_CACHE });
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });
    const corpo = await req.json().catch(() => ({}));
    const acao = corpo?.acao;
    if (acao !== 'assumir' && acao !== 'devolver') {
        return NextResponse.json({ success: false, error: 'ação inválida' }, { status: 400, headers: SEM_CACHE });
    }
    const { data: conv } = await ctx.sessao.from('wa_conversas').select('id').eq('id', id).maybeSingle();
    if (!conv) return NextResponse.json({ success: false, error: 'conversa não encontrada' }, { status: 404, headers: SEM_CACHE });
    const ok = await mudarAtendimento(ctx.admin, id, acao);
    if (!ok) return NextResponse.json({ success: false, error: 'não foi possível mudar' }, { status: 500, headers: SEM_CACHE });
    console.info(`[wa/atendimento] ${ctx.eu.email} → ${acao} (${id})`);
    return NextResponse.json({ success: true, status: acao === 'assumir' ? 'humano' : 'ia' }, { headers: SEM_CACHE });
}
