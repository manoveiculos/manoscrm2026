import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { inicioDoPeriodo, resumirCustos, type LinhaCusto, type Periodo } from '@/lib/agentes/custos';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };

/**
 * GET /api/agentes/custos?periodo=dia|semana|mes — gasto de IA (US$) da Central dos Agentes (só admin).
 * Soma três fontes: wa_ia_execucoes (Laura), wa_followups (follow-up) e ia_custos (triagem e analista).
 * Fonte que ainda não existir (migration não aplicada) é ignorada: o total mostra o que há.
 */
export async function GET(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    if (ctx.eu.perfil !== 'admin') return NextResponse.json({ success: false, error: 'Só o admin vê os custos.' }, { status: 403, headers: SEM_CACHE });

    const p = new URL(req.url).searchParams.get('periodo');
    const periodo: Periodo = p === 'semana' || p === 'mes' ? p : 'dia';
    const agora = new Date();
    const desde = new Date(inicioDoPeriodo(periodo, agora)).toISOString();

    const linhas: LinhaCusto[] = [];
    const faltando: string[] = [];
    const [laura, follow, outros] = await Promise.all([
        ctx.admin.from('wa_ia_execucoes').select('custo_usd, iniciada_em').gte('iniciada_em', desde).not('custo_usd', 'is', null).limit(20000),
        ctx.admin.from('wa_followups').select('custo_usd, criado_em').gte('criado_em', desde).not('custo_usd', 'is', null).limit(20000),
        ctx.admin.from('ia_custos').select('agente, custo_usd, criado_em').gte('criado_em', desde).limit(20000),
    ]);
    if (laura.error) faltando.push('wa_ia_execucoes'); else for (const r of laura.data || []) linhas.push({ agente: 'laura', em: r.iniciada_em, usd: Number(r.custo_usd) });
    if (follow.error) faltando.push('wa_followups'); else for (const r of follow.data || []) linhas.push({ agente: 'followup', em: r.criado_em, usd: Number(r.custo_usd) });
    if (outros.error) faltando.push('ia_custos'); else for (const r of outros.data || []) linhas.push({ agente: r.agente, em: r.criado_em, usd: Number(r.custo_usd) });

    return NextResponse.json({ success: true, ...resumirCustos(linhas, periodo, agora), faltando }, { headers: SEM_CACHE });
}
