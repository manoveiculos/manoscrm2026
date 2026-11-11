import { NextRequest, NextResponse } from 'next/server';
import { contextoWa } from '@/lib/whatsapp/leituraServidor';
import { montarPassagens, type MsgPassagem } from '@/lib/whatsapp/passagens';

export const dynamic = 'force-dynamic';
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };

/**
 * GET /api/lead/passagens?uid=leads_distribuicao_crm_26:123
 * Todas as passagens do cliente pelo WhatsApp da loja (wa_conversas / wa_mensagens).
 * A leitura vai pela sessão de quem está logado: a RLS decide se ele pode ver a conversa
 * (vendedor só as dele; gestor e admin todas).
 */
export async function GET(req: NextRequest) {
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });
    const uid = (new URL(req.url).searchParams.get('uid') || '').trim();
    if (!uid) return NextResponse.json({ success: true, passagens: [], total: 0 }, { headers: SEM_CACHE });

    const { data: convs } = await ctx.sessao.from('wa_conversas').select('id').eq('lead_uid', uid).limit(5);
    const ids = (convs || []).map(c => c.id as string);
    if (!ids.length) return NextResponse.json({ success: true, passagens: [], total: 0 }, { headers: SEM_CACHE });

    // últimas 1500 mensagens bastam para o histórico (a conversa inteira continua na tela Conversas)
    const { data: linhas } = await ctx.sessao.from('wa_mensagens')
        .select('autor, tipo, texto, legenda, transcricao, criada_em, apagada_em')
        .in('conversa_id', ids).order('criada_em', { ascending: false }).limit(1500);
    const msgs: MsgPassagem[] = (linhas || []).map(m => ({
        autor: m.autor, tipo: m.tipo, texto: m.texto, legenda: m.legenda, transcricao: m.transcricao,
        criadaEm: m.criada_em, apagadaEm: m.apagada_em,
    }));
    const passagens = montarPassagens(msgs);
    return NextResponse.json({ success: true, total: passagens.length, passagens: passagens.slice(0, 30) }, { headers: SEM_CACHE });
}
