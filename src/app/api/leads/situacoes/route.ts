import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { enriquecer, lerConversasDeLeads } from '@/lib/leads/enriquecimento';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'no-store' };

/**
 * GET /api/leads/situacoes — para cada lead com conversa no WhatsApp da loja: situação (analista de IA),
 * quem falou por último, quando e um trecho. Serve o Kanban e a busca por IA (a lista normal já recebe
 * isto em /api/leads/lista). Resposta: { itens: { "<uid do lead>": Enriquecimento } }.
 * Vendedor só recebe os leads dele.
 */
export async function GET() {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;

    let lista;
    try { lista = await lerConversasDeLeads(admin); }
    catch (e) { return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500, headers }); }

    if (eu.perfil !== 'admin') {
        if (!eu.consultorId) return NextResponse.json({ success: true, itens: {} }, { headers });
        const { data: meus } = await admin.from('leads_unified').select('uid').eq('assigned_consultant_id', eu.consultorId).limit(5000);
        const uids = new Set((meus || []).map(l => String(l.uid)));
        lista = lista.filter(c => uids.has(String(c.lead_uid)));
    }
    return NextResponse.json({ success: true, itens: await enriquecer(admin, lista) }, { headers });
}
