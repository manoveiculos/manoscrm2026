import { NextRequest, NextResponse } from 'next/server';
import { contextoWa } from '@/lib/whatsapp/leituraServidor';
import { montarPassagens, type MsgPassagem } from '@/lib/whatsapp/passagens';
import { SITUACOES, type CodigoSituacao } from '@/lib/whatsapp/ia/analista';

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

    // Situação lida pelo Analista de contexto (consulta à parte: se a coluna ainda não existir, só fica sem).
    let situacao: Record<string, unknown> | null = null;
    const { data: sit } = await ctx.sessao.from('wa_conversas').select('situacao, situacao_em, ultima_mensagem_em').in('id', ids)
        .order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle();
    const s = sit?.situacao as Record<string, unknown> | null | undefined;
    if (s && SITUACOES.includes(s.situacao as CodigoSituacao) && s.situacao !== 'indefinida') {
        situacao = {
            situacao: s.situacao, resumo: s.resumo || '', proximaAcao: s.proximaAcao || '', quando: s.quando || null, confianca: s.confianca || 'baixa',
            analisadaEm: sit?.situacao_em || null,
            // a conversa andou depois da análise: a tela avisa que pode estar desatualizada
            desatualizada: Boolean(sit?.situacao_em && sit?.ultima_mensagem_em && Date.parse(sit.ultima_mensagem_em) > Date.parse(sit.situacao_em)),
        };
    }
    return NextResponse.json({ success: true, total: passagens.length, passagens: passagens.slice(0, 30), situacao }, { headers: SEM_CACHE });
}
