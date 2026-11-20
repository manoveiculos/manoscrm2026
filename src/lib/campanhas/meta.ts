// src/lib/campanhas/meta.ts — campanhas do Meta Ads (Facebook/Instagram) ao vivo, pela Graph API (SÓ SERVIDOR)
//
// Só LEITURA: insights por campanha, status/orçamento das campanhas e o mapa anúncio → campanha
// (para ligar o clique no WhatsApp que chegou ao CRM, que traz o ID do ANÚNCIO, à campanha).

import { getMetaAccessToken, getMetaApiVersion } from '@/lib/metaConfig';
import { somarTotais, GRUPO_VAZIO, type CampanhaLinha, type GrupoCampanhas, type StatusCampanha } from './tipos';

interface Acao { action_type: string; value: string }
export interface InsightMeta {
    campaign_id: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string;
    ctr?: string; cpc?: string; cpm?: string; actions?: Acao[]; account_currency?: string;
}
export interface CampanhaMeta { id: string; name?: string; status?: string; effective_status?: string; daily_budget?: string }
export interface AnuncioMeta { id: string; campaign_id?: string }

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };
const arred = (n: number) => Math.round(n * 100) / 100;

export function statusMeta(effective: string | undefined, status: string | undefined): StatusCampanha {
    const s = (effective || status || '').toUpperCase();
    if (s === 'ACTIVE') return 'ativa';
    if (s.includes('PAUSED')) return 'pausada';
    if (s === 'ARCHIVED' || s === 'DELETED') return 'encerrada';
    return 'outro';
}

/** Leads de formulário e conversas no WhatsApp que a Meta atribuiu. "lead" já é o total; não soma com as partes dele. */
export function resultadosMeta(actions: Acao[] | undefined): { leads: number; conversas: number } {
    const v = (tipo: string) => num((actions || []).find(a => a.action_type === tipo)?.value);
    const leads = v('lead') || v('onsite_conversion.lead_grouped') || v('offsite_conversion.fb_pixel_lead');
    const conversas = v('onsite_conversion.messaging_conversation_started_7d');
    return { leads, conversas };
}

export function normalizarMeta(insights: InsightMeta[], campanhas: CampanhaMeta[]): { linhas: CampanhaLinha[]; moeda: string } {
    const porId = new Map(insights.map(i => [i.campaign_id, i]));
    const ids = new Set<string>([...insights.map(i => i.campaign_id), ...campanhas.map(c => c.id)]);
    const infos = new Map(campanhas.map(c => [c.id, c]));
    const linhas: CampanhaLinha[] = [];
    for (const id of ids) {
        const i = porId.get(id); const c = infos.get(id);
        const status = statusMeta(c?.effective_status, c?.status);
        // Campanha sem gasto no período só aparece se estiver ativa (senão a lista enche de campanha antiga).
        if (!i && status !== 'ativa') continue;
        const gasto = num(i?.spend), impressoes = Math.round(num(i?.impressions)), cliques = Math.round(num(i?.clicks));
        const { leads, conversas } = resultadosMeta(i?.actions);
        const resultados = leads + conversas;
        linhas.push({
            plataforma: 'meta', id, nome: c?.name || i?.campaign_name || id, status,
            statusBruto: c?.effective_status || c?.status || '',
            orcamentoDiario: c?.daily_budget ? arred(num(c.daily_budget) / 100) : null,   // a Meta informa em centavos
            gasto: arred(gasto), impressoes, cliques,
            ctr: impressoes ? arred((cliques / impressoes) * 100) : 0,
            cpc: cliques ? arred(gasto / cliques) : 0,
            cpm: impressoes ? arred((gasto / impressoes) * 1000) : 0,
            resultados, conversas, custoPorResultado: resultados ? arred(gasto / resultados) : null,
        });
    }
    linhas.sort((a, b) => b.gasto - a.gasto || a.nome.localeCompare(b.nome));
    return { linhas, moeda: insights.find(i => i.account_currency)?.account_currency || 'BRL' };
}

/** Anúncio → campanha (para ligar o source_id do clique no WhatsApp à campanha). */
export function mapaAnuncioCampanha(anuncios: AnuncioMeta[]): Map<string, string> {
    return new Map(anuncios.filter(a => a.id && a.campaign_id).map(a => [a.id, a.campaign_id!]));
}

// ---------------------------------------------------------------------------
// Chamadas à Graph API
// ---------------------------------------------------------------------------

async function pagina<T>(url: string, token: string, maxPaginas = 20): Promise<T[]> {
    const todos: T[] = [];
    let prox: string | null = url;
    for (let i = 0; prox && i < maxPaginas; i++) {
        const res: Response = await fetch(prox, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000), cache: 'no-store' });
        const j: { data?: T[]; paging?: { next?: string }; error?: { message?: string; code?: number } } | null = await res.json().catch(() => null);
        if (!res.ok || j?.error) {
            const cod = j?.error?.code;
            throw new Error(cod === 190 ? 'Token do Meta expirou ou foi revogado (erro 190): gere um token novo.' : `Meta (${res.status}): ${j?.error?.message || 'resposta inválida'}`);
        }
        todos.push(...(j?.data || []));
        prox = j?.paging?.next || null;
    }
    return todos;
}

export interface DadosMeta { grupo: GrupoCampanhas; anuncios: Map<string, string> }

export async function buscarMeta(desde: string, ate: string): Promise<DadosMeta> {
    const conta = (process.env.META_AD_ACCOUNT_ID || process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID || '').replace(/^act_/, '').trim();
    const token = (process.env.META_ADS_ACCESS_TOKEN || getMetaAccessToken() || '').trim();
    const vazio = (erro: string): DadosMeta => ({ grupo: { plataforma: 'meta', conectado: false, erro, moeda: 'BRL', totais: GRUPO_VAZIO, campanhas: [] }, anuncios: new Map() });
    if (!conta || !token) return vazio('Meta Ads não conectado: faltam META_AD_ACCOUNT_ID e/ou META_ACCESS_TOKEN no servidor.');

    const base = `https://graph.facebook.com/${getMetaApiVersion()}/act_${conta}`;
    const insightsUrl = `${base}/insights?${new URLSearchParams({
        level: 'campaign', time_range: JSON.stringify({ since: desde, until: ate }),
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,account_currency', limit: '500',
    })}`;
    const campanhasUrl = `${base}/campaigns?${new URLSearchParams({ fields: 'id,name,status,effective_status,daily_budget', limit: '500' })}`;
    const anunciosUrl = `${base}/ads?${new URLSearchParams({ fields: 'id,campaign_id', limit: '1000' })}`;
    try {
        const [insights, campanhas, anuncios] = await Promise.all([
            pagina<InsightMeta>(insightsUrl, token), pagina<CampanhaMeta>(campanhasUrl, token), pagina<AnuncioMeta>(anunciosUrl, token, 10).catch(() => [] as AnuncioMeta[]),
        ]);
        const { linhas, moeda } = normalizarMeta(insights, campanhas);
        return { grupo: { plataforma: 'meta', conectado: true, erro: null, moeda, totais: somarTotais(linhas), campanhas: linhas }, anuncios: mapaAnuncioCampanha(anuncios) };
    } catch (e) {
        return vazio(e instanceof Error ? e.message : 'erro ao consultar o Meta');
    }
}
