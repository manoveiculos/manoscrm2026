// src/lib/campanhas/crm.ts — o que o CRM sabe de cada grupo de anúncio (PURO)
//
// Cruza as campanhas das plataformas com o que realmente aconteceu no CRM: leads que chegaram,
// atendidos, vendas, e o tráfego do site que veio de fora da praça (fora de Santa Catarina).

import { normalizeStatus } from '@/constants/status';
import type { CampanhaLinha, ForaDaPraca, FunilCrm } from './tipos';

export type GrupoOrigem = 'meta' | 'google' | 'outros';
export const GRUPOS_ORIGEM: GrupoOrigem[] = ['meta', 'google', 'outros'];

export interface LeadCrm {
    origem?: string | null;
    plataforma_meta?: string | null;
    utm_params?: Record<string, unknown> | null;
    status?: string | null;
    atendimento_iniciado_em?: string | null;
    /** true = veio da tabela de formulários do Facebook (leadsfacebook). */
    deFormularioFacebook?: boolean;
}

const txt = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '');

/** Meta, Google ou o resto (WhatsApp direto, indicação, orgânico…). O clique no WhatsApp de um anúncio da Meta conta como Meta. */
export function grupoDoLeadCrm(l: LeadCrm): GrupoOrigem {
    const utm = l.utm_params || {};
    const plat = txt(utm.platform);
    if (plat === 'google' || utm.gclid) return 'google';
    if (plat === 'meta' || plat === 'facebook' || plat === 'instagram' || utm.ctwa_clid || utm.fbclid) return 'meta';
    const o = txt(l.origem);
    if (o.includes('google')) return 'google';
    if (/meta|facebook|instagram|\bfb\b/.test(o)) return 'meta';
    if (/meta|facebook|instagram/.test(txt(l.plataforma_meta))) return 'meta';
    if (l.deFormularioFacebook) return 'meta';
    return 'outros';
}

/** ID do ANÚNCIO que originou o clique no WhatsApp (source_id), quando existe. */
export function anuncioDoLead(l: LeadCrm): string | null {
    const id = l.utm_params?.source_id;
    return typeof id === 'string' && id ? id : null;
}

export function funilPorGrupo(leads: LeadCrm[]): Record<GrupoOrigem, FunilCrm> {
    const vazio = (): FunilCrm => ({ leads: 0, atendidos: 0, vendas: 0, perdidos: 0 });
    const out: Record<GrupoOrigem, FunilCrm> = { meta: vazio(), google: vazio(), outros: vazio() };
    for (const l of leads) {
        const f = out[grupoDoLeadCrm(l)];
        const etapa = normalizeStatus(l.status as never);
        f.leads++;
        if (l.atendimento_iniciado_em) f.atendidos++;
        if (etapa === 'vendido') f.vendas++;
        if (etapa === 'perdido') f.perdidos++;
    }
    return out;
}

/** Quantos leads do CRM vieram de cada campanha Meta (pelo anúncio do clique no WhatsApp). */
export function leadsPorCampanhaMeta(leads: LeadCrm[], anuncioParaCampanha: Map<string, string>): Map<string, number> {
    const out = new Map<string, number>();
    for (const l of leads) {
        const ad = anuncioDoLead(l);
        const camp = ad ? anuncioParaCampanha.get(ad) : null;
        if (camp) out.set(camp, (out.get(camp) || 0) + 1);
    }
    return out;
}

export function anexarLeadsCrm(campanhas: CampanhaLinha[], porCampanha: Map<string, number>): CampanhaLinha[] {
    return campanhas.map(c => ({ ...c, leadsCrm: porCampanha.get(c.id) || 0 }));
}

/** Custo por lead REAL: gasto da plataforma ÷ leads que chegaram ao CRM (null sem lead). */
export function custoPorLeadReal(gasto: number, leads: number): number | null {
    return leads > 0 ? Math.round((gasto / leads) * 100) / 100 : null;
}

// ---------------------------------------------------------------------------
// Tráfego do site fora da praça
// ---------------------------------------------------------------------------

export interface EventoSite { visitor_id: string; origem_macro?: string | null; uf?: string | null; cidade?: string | null }

export function grupoDoEventoSite(origemMacro: string | null | undefined): 'meta' | 'google' | null {
    const o = (origemMacro || '').toUpperCase();
    if (o.includes('GOOGLE')) return 'google';
    if (o.includes('FACEBOOK') || o.includes('INSTAGRAM') || o.includes('META')) return 'meta';
    return null;
}

/** Praça = Santa Catarina. Quem não informou estado fica fora da conta (não dá para dizer que é de fora). */
export function foraDaPracaPorGrupo(eventos: EventoSite[]): Record<'meta' | 'google', ForaDaPraca> {
    const out = {} as Record<'meta' | 'google', ForaDaPraca>;
    for (const g of ['meta', 'google'] as const) {
        const visitas = new Map<string, { uf: string; cidade: string }>();
        for (const e of eventos) {
            if (grupoDoEventoSite(e.origem_macro) !== g) continue;
            const uf = (e.uf || '').trim().toUpperCase();
            if (!uf || visitas.has(e.visitor_id)) continue;
            visitas.set(e.visitor_id, { uf, cidade: (e.cidade || '').trim() });
        }
        const total = visitas.size;
        const fora = [...visitas.values()].filter(v => v.uf !== 'SC');
        const cidades = new Map<string, { cidade: string; uf: string; visitantes: number }>();
        for (const v of fora) {
            const k = `${v.cidade}|${v.uf}`;
            const c = cidades.get(k) || { cidade: v.cidade || '(sem cidade)', uf: v.uf, visitantes: 0 };
            c.visitantes++; cidades.set(k, c);
        }
        out[g] = {
            visitantes: total, foraDeSc: fora.length,
            percentual: total ? Math.round((fora.length / total) * 1000) / 10 : 0,
            topCidades: [...cidades.values()].sort((a, b) => b.visitantes - a.visitantes).slice(0, 5),
        };
    }
    return out;
}
