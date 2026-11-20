import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { buscarMeta, type DadosMeta } from '@/lib/campanhas/meta';
import { buscarGoogle } from '@/lib/campanhas/google';
import {
    anexarLeadsCrm, custoPorLeadReal, foraDaPracaPorGrupo, funilPorGrupo, leadsPorCampanhaMeta, type EventoSite, type LeadCrm,
} from '@/lib/campanhas/crm';
import type { GrupoCampanhas } from '@/lib/campanhas/tipos';

/**
 * GET /api/admin/campanhas?dias=7 — campanhas do Facebook/Instagram (Meta Ads) e do Google Ads AO VIVO, separadas,
 * cruzadas com o que o CRM sabe (leads, atendidos, vendas) e com o tráfego do site fora da praça.
 * Só leitura nas plataformas. Só admin e gestor. As consultas às plataformas ficam em cache de 45 s
 * (vários painéis abertos não estouram o limite de chamadas).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 45;
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const erro = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: SEM_CACHE });

const TTL_MS = 45_000;
const cache = new Map<string, { em: number; dados: unknown }>();
async function comCache<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
    const c = cache.get(chave);
    if (c && Date.now() - c.em < TTL_MS) return c.dados as T;
    const dados = await buscar();
    cache.set(chave, { em: Date.now(), dados });
    return dados;
}

/** AAAA-MM-DD no horário de Brasília (UTC-3), `atras` dias antes de hoje. */
function diaSP(atras: number): string {
    return new Date(Date.now() - 3 * 3_600_000 - atras * 86_400_000).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
    const c = await consultorLogado();
    if (!c.ok) return c.res;
    if (c.eu.perfil === 'vendedor') return erro(403, 'Só para admin e gestor.');
    const { admin } = c;

    const dias = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || 7));
    const desde = diaSP(dias - 1), ate = diaSP(0);
    const desdeIso = new Date(Date.now() - dias * 86_400_000).toISOString();

    // plataformas, leads do CRM e visitas do site, tudo em paralelo
    const [meta, google, dist, fb, eventos] = await Promise.all([
        comCache<DadosMeta>(`meta|${desde}|${ate}`, () => buscarMeta(desde, ate)),
        comCache<GrupoCampanhas>(`google|${desde}|${ate}`, () => buscarGoogle(desde, ate)),
        admin.from('leads_distribuicao_crm_26').select('origem, plataforma_meta, utm_params, status, atendimento_iniciado_em').gte('criado_em', desdeIso).limit(20000),
        admin.from('leadsfacebook').select('status').gte('created_at', desdeIso).limit(5000),
        admin.from('trafego_eventos').select('visitor_id, origem_macro, uf, cidade').gte('created_at', desdeIso).limit(30000),
    ]);

    const leads: LeadCrm[] = [
        ...((dist.data || []) as LeadCrm[]),
        ...((fb.data || []) as { status?: string | null }[]).map(l => ({ status: l.status, deFormularioFacebook: true } as LeadCrm)),
    ];
    const funil = funilPorGrupo(leads);
    const porCampanha = leadsPorCampanhaMeta(leads, meta.anuncios);

    const grupoMeta: GrupoCampanhas = { ...meta.grupo, campanhas: anexarLeadsCrm(meta.grupo.campanhas, porCampanha) };

    return NextResponse.json({
        success: true, dias, desde, ate, geradoEm: new Date().toISOString(),
        meta: grupoMeta, google,
        crm: {
            funil,
            custoPorLeadReal: { meta: custoPorLeadReal(grupoMeta.totais.gasto, funil.meta.leads), google: custoPorLeadReal(google.totais.gasto, funil.google.leads) },
            custoPorVenda: {
                meta: funil.meta.vendas ? custoPorLeadReal(grupoMeta.totais.gasto, funil.meta.vendas) : null,
                google: funil.google.vendas ? custoPorLeadReal(google.totais.gasto, funil.google.vendas) : null,
            },
        },
        foraDaPraca: foraDaPracaPorGrupo((eventos.data || []) as EventoSite[]),
    }, { headers: SEM_CACHE });
}
