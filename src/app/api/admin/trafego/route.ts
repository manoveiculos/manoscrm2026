import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { resumirTrafego, type EventoTrafego, type VisitanteTrafego } from '@/lib/trafego/resumo';

/**
 * GET /api/admin/trafego?dias=7 — a campanha do site novo (manosveiculoscompra.com) dentro do CRM.
 * Só leitura: o site grava em trafego_eventos / trafego_visitantes / trafego_meta_cache (mesmo Supabase).
 * Só admin e gestor (a tabela de visitantes guarda nome e telefone).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const erro = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: SEM_CACHE });

const COLS_EVENTO = 'id, created_at, visitor_id, origem_macro, sub_origem, campanha_id, utm_campaign, acao, veiculo_id, veiculo_nome, valor_veiculo, dispositivo_detalhe, cidade, uf, tempo_segundos, fotos_vistas, abriu_galeria';
const LIMITE = 20000;

export async function GET(req: NextRequest) {
    const c = await consultorLogado();
    if (!c.ok) return c.res;
    if (c.eu.perfil === 'vendedor') return erro(403, 'Só para admin e gestor.');
    const { admin } = c;

    const dias = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || 7));
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

    const { data: eventos, error: eEv } = await admin.from('trafego_eventos').select(COLS_EVENTO)
        .gte('created_at', desde).order('created_at', { ascending: false }).limit(LIMITE);
    if (eEv) return erro(500, `trafego_eventos: ${eEv.message}`);
    const evs = (eventos || []) as EventoTrafego[];

    const ids = [...new Set(evs.map(e => e.visitor_id))];
    const visitantes: VisitanteTrafego[] = [];
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await admin.from('trafego_visitantes')
            .select('visitor_id, nome, telefone, crm_lead_id, crm_status').in('visitor_id', ids.slice(i, i + 200));
        if (error) return erro(500, `trafego_visitantes: ${error.message}`);
        visitantes.push(...((data || []) as VisitanteTrafego[]));
    }

    const campIds = [...new Set(evs.map(e => e.campanha_id).filter((x): x is string => Boolean(x)))];
    const nomes: Record<string, string> = {};
    if (campIds.length) {
        const { data } = await admin.from('trafego_meta_cache').select('object_id, nome').in('object_id', campIds);
        for (const r of data || []) if (r.nome) nomes[r.object_id as string] = r.nome as string;
    }

    return NextResponse.json({
        success: true, dias, truncado: evs.length >= LIMITE, vazio: evs.length === 0,
        resumo: resumirTrafego(evs, visitantes, nomes),
    }, { headers: SEM_CACHE });
}
