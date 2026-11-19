import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { situacaoDoBanco, mensagensRecentes, type MsgBanco } from '@/lib/leads/resumo';
import type { Enriquecimento } from '@/lib/leads/urgencia';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'no-store' };

/**
 * GET /api/leads/situacoes — para cada lead com conversa no WhatsApp da loja: situação (analista de IA),
 * quem falou por último, quando e um trecho. A lista de Leads usa isto para ordenar por urgência.
 * Resposta: { itens: { "<uid do lead>": Enriquecimento } }. Vendedor só recebe os leads dele.
 */
export async function GET() {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;

    const { data: convs, error } = await admin.from('wa_conversas')
        .select('id, lead_uid, situacao, ultima_mensagem_em')
        .not('lead_uid', 'is', null).order('ultima_mensagem_em', { ascending: false }).limit(5000);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers });

    let lista = convs || [];
    if (eu.perfil !== 'admin') {
        if (!eu.consultorId) return NextResponse.json({ success: true, itens: {} }, { headers });
        const { data: meus } = await admin.from('leads_unified').select('uid').eq('assigned_consultant_id', eu.consultorId).limit(5000);
        const uids = new Set((meus || []).map(l => String(l.uid)));
        lista = lista.filter(c => uids.has(String(c.lead_uid)));
    }

    const ultimas = new Map<string, MsgBanco>();
    if (lista.length) {
        const { data: msgs } = await admin.rpc('wa_ultimas_mensagens', { p_conversas: lista.map(c => c.id) });
        for (const m of (msgs || []) as (MsgBanco & { conversa_id: string })[]) ultimas.set(m.conversa_id, m);
    }

    const itens: Record<string, Enriquecimento> = {};
    for (const c of lista) {
        const uid = String(c.lead_uid);
        if (itens[uid]) continue;   // várias conversas para o mesmo lead: vale a mais recente
        const s = situacaoDoBanco(c.situacao);
        const m = ultimas.get(c.id);
        const lida = m ? mensagensRecentes([m], 1)[0] : null;
        itens[uid] = {
            conversaId: c.id,
            situacao: s?.codigo ?? null,
            rotuloSituacao: s?.rotulo ?? null,
            quando: s?.quando ?? null,
            ultimaDe: lida?.de ?? null,
            ultimaEm: m?.criada_em ?? (c.ultima_mensagem_em as string | null) ?? null,
            ultimaTexto: lida?.texto.slice(0, 90) ?? null,
        };
    }
    return NextResponse.json({ success: true, itens }, { headers });
}
