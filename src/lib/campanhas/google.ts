// src/lib/campanhas/google.ts — campanhas do Google Ads ao vivo, pela API REST (GAQL) (SÓ SERVIDOR)
//
// Só LEITURA. Usa as credenciais do projeto Google Cloud: GOOGLE_ADS_CLIENT_ID / CLIENT_SECRET /
// REFRESH_TOKEN (OAuth), GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID e, se a conta é filha de
// uma conta gerente (MCC), GOOGLE_ADS_LOGIN_CUSTOMER_ID. Sem SDK: um fetch para o token e outro para a consulta.

import { refreshTokenGoogle } from '@/lib/conexoes/credenciais';
import { explicarErroGoogleAds } from '@/lib/conexoes/googleAdsErro';
import { somarTotais, GRUPO_VAZIO, type CampanhaLinha, type GrupoCampanhas, type StatusCampanha } from './tipos';

interface LinhaGaql {
    campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
    campaignBudget?: { amountMicros?: string };
    metrics?: {
        costMicros?: string; impressions?: string; clicks?: string; ctr?: number; averageCpc?: number; averageCpm?: number;
        conversions?: number; conversionsValue?: number;
    };
}

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const arred = (n: number) => Math.round(n * 100) / 100;
const micros = (v: unknown) => num(v) / 1_000_000;

export function statusGoogle(s: string | undefined): StatusCampanha {
    if (s === 'ENABLED') return 'ativa';
    if (s === 'PAUSED') return 'pausada';
    if (s === 'REMOVED') return 'encerrada';
    return 'outro';
}

export function normalizarGoogle(linhas: LinhaGaql[]): CampanhaLinha[] {
    const out: CampanhaLinha[] = [];
    for (const l of linhas) {
        const c = l.campaign; const m = l.metrics || {};
        if (!c?.id) continue;
        const status = statusGoogle(c.status);
        const gasto = micros(m.costMicros), impressoes = Math.round(num(m.impressions)), cliques = Math.round(num(m.clicks));
        // Campanha sem movimento no período só aparece se estiver ativa.
        if (status !== 'ativa' && gasto === 0 && impressoes === 0) continue;
        const resultados = Math.round(num(m.conversions) * 100) / 100;
        out.push({
            plataforma: 'google', id: String(c.id), nome: c.name || String(c.id), status, statusBruto: c.status || '',
            orcamentoDiario: l.campaignBudget?.amountMicros ? arred(micros(l.campaignBudget.amountMicros)) : null,
            gasto: arred(gasto), impressoes, cliques,
            ctr: arred(num(m.ctr) * 100),                 // a API devolve fração (0,018 = 1,8%)
            cpc: arred(micros(m.averageCpc)), cpm: arred(micros(m.averageCpm)),
            resultados, conversas: null, custoPorResultado: resultados ? arred(gasto / resultados) : null,
        });
    }
    out.sort((a, b) => b.gasto - a.gasto || a.nome.localeCompare(b.nome));
    return out;
}

// ---------------------------------------------------------------------------
// OAuth e consulta
// ---------------------------------------------------------------------------

let tokenCache: { valor: string; expira: number } | null = null;

async function tokenDeAcesso(): Promise<string> {
    if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor;
    const corpo = new URLSearchParams({
        client_id: (process.env.GOOGLE_ADS_CLIENT_ID || '').trim(), client_secret: (process.env.GOOGLE_ADS_CLIENT_SECRET || '').trim(),
        refresh_token: await refreshTokenGoogle(), grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: corpo, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    const j = await res.json().catch(() => null) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
    if (!res.ok || !j?.access_token) {
        throw new Error(j?.error === 'invalid_grant'
            ? 'Acesso ao Google Ads expirou ou foi revogado (invalid_grant): gere um novo refresh token.'
            : `Google OAuth (${res.status}): ${j?.error_description || j?.error || 'resposta inválida'}`);
    }
    tokenCache = { valor: j.access_token, expira: Date.now() + (j.expires_in || 3600) * 1000 };
    return j.access_token;
}

/** Versões tentadas, da mais nova para a mais antiga (o Google aposenta versões; a que funcionar fica guardada). */
const VERSOES = ['v23', 'v22', 'v21', 'v20'];
let versaoBoa: string | null = null;

export const GAQL = (desde: string, ate: string) => `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${desde}' AND '${ate}' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC`;

export async function buscarGoogle(desde: string, ate: string): Promise<GrupoCampanhas> {
    const vazio = (erro: string): GrupoCampanhas => ({ plataforma: 'google', conectado: false, erro, moeda: 'BRL', totais: GRUPO_VAZIO, campanhas: [] });
    const cliente = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
    const dev = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
    const login = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/\D/g, '');
    if (!cliente || !dev || !(await refreshTokenGoogle()) || !process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) {
        return vazio('Google Ads não conectado: faltam credenciais (GOOGLE_ADS_CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, DEVELOPER_TOKEN, CUSTOMER_ID).');
    }
    try {
        const token = await tokenDeAcesso();
        const versoes = versaoBoa ? [versaoBoa] : [(process.env.GOOGLE_ADS_API_VERSION || '').trim(), ...VERSOES].filter(Boolean);
        let ultimoErro = 'resposta inválida';
        for (const v of versoes) {
            const res = await fetch(`https://googleads.googleapis.com/${v}/customers/${cliente}/googleAds:searchStream`, {
                method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(25_000),
                headers: {
                    Authorization: `Bearer ${token}`, 'developer-token': dev, 'Content-Type': 'application/json',
                    ...(login ? { 'login-customer-id': login } : {}),
                },
                body: JSON.stringify({ query: GAQL(desde, ate) }),
            });
            const j = await res.json().catch(() => null) as unknown;
            if (res.status === 404 && !versaoBoa) { ultimoErro = `versão ${v} indisponível`; continue; }   // versão aposentada: tenta a anterior
            if (!res.ok) {
                versaoBoa = null;
                throw new Error(explicarErroGoogleAds(res.status, j, { cliente, login }));
            }
            versaoBoa = v;
            const lotes = (Array.isArray(j) ? j : [j]) as { results?: LinhaGaql[] }[];
            const campanhas = normalizarGoogle(lotes.flatMap(l => l?.results || []));
            return { plataforma: 'google', conectado: true, erro: null, moeda: 'BRL', totais: somarTotais(campanhas), campanhas };
        }
        throw new Error(`Google Ads: nenhuma versão da API respondeu (${ultimoErro}). Defina GOOGLE_ADS_API_VERSION.`);
    } catch (e) {
        return vazio(e instanceof Error ? e.message : 'erro ao consultar o Google Ads');
    }
}
