// src/lib/conexoes/oauth.ts — o "login básico pedindo autorização" do Meta e do Google (SÓ SERVIDOR).
//
// Fluxo: botão Conectar → /api/oauth/<provedor>/start → tela oficial de login e autorização →
// /api/oauth/<provedor>/callback → o CRM troca o código pelo acesso e guarda em oauth_conexoes.
// A senha é digitada só na tela do Google/Facebook. O CRM nunca a vê.

import type { Provedor } from './credenciais';

export const ESCOPOS: Record<Provedor, string[]> = {
    google: ['https://www.googleapis.com/auth/adwords'],
    meta: ['ads_read', 'ads_management', 'business_management'],
};

export const ROTULO: Record<Provedor, string> = { google: 'Google Ads', meta: 'Facebook / Instagram (Meta Ads)' };

export function provedorValido(v: string): v is Provedor { return v === 'google' || v === 'meta'; }

/** O que falta configurar para o botão funcionar (nomes das variáveis, nunca os valores). */
export function faltaConfigurar(p: Provedor, env: Record<string, string | undefined> = process.env): string[] {
    const chaves = p === 'google' ? ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET'] : ['META_APP_ID', 'META_APP_SECRET'];
    return chaves.filter(k => !(env[k] || '').trim());
}

/** Endereço que o Google/Meta devolvem o usuário. Precisa estar cadastrado igualzinho no painel deles. */
export function enderecoDeRetorno(p: Provedor, origem: string, env: Record<string, string | undefined> = process.env): string {
    const base = (env.OAUTH_BASE_URL || origem).trim().replace(/\/+$/, '');
    return `${base}/api/oauth/${p}/callback`;
}

export function urlDeAutorizacao(p: Provedor, retorno: string, state: string, env: Record<string, string | undefined> = process.env): string {
    if (p === 'google') {
        const q = new URLSearchParams({
            client_id: (env.GOOGLE_ADS_CLIENT_ID || '').trim(), redirect_uri: retorno, response_type: 'code',
            scope: ESCOPOS.google.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }
    const versao = (env.META_API_VERSION || '').trim() || 'v26.0';
    const q = new URLSearchParams({
        client_id: (env.META_APP_ID || '').trim(), redirect_uri: retorno, response_type: 'code',
        scope: ESCOPOS.meta.join(','), state, auth_type: 'rerequest',
    });
    return `https://www.facebook.com/${versao}/dialog/oauth?${q}`;
}

export interface TokensTrocados { refresh_token: string | null; access_token: string | null; expira_em: string | null; escopos: string | null }
export type Troca = { ok: true; tokens: TokensTrocados } | { ok: false; erro: string };

async function postForm(url: string, corpo: Record<string, string>): Promise<{ http: number; json: Record<string, unknown> }> {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams(corpo), signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { http: res.status, json };
}

/** Troca o código pelo acesso. Os segredos vão no corpo (POST), nunca na URL. */
export async function trocarCodigo(p: Provedor, code: string, retorno: string, env: Record<string, string | undefined> = process.env): Promise<Troca> {
    if (p === 'google') {
        const { http, json } = await postForm('https://oauth2.googleapis.com/token', {
            code, client_id: (env.GOOGLE_ADS_CLIENT_ID || '').trim(), client_secret: (env.GOOGLE_ADS_CLIENT_SECRET || '').trim(),
            redirect_uri: retorno, grant_type: 'authorization_code',
        });
        if (typeof json.error === 'string') return { ok: false, erro: `O Google recusou (${json.error}).` };
        if (http >= 400 || typeof json.access_token !== 'string') return { ok: false, erro: 'O Google respondeu algo inesperado.' };
        if (typeof json.refresh_token !== 'string') {
            return { ok: false, erro: 'O Google não devolveu o acesso renovável. Remova o CRM em myaccount.google.com/permissions e clique em Conectar de novo.' };
        }
        return { ok: true, tokens: { refresh_token: json.refresh_token, access_token: null, expira_em: null, escopos: typeof json.scope === 'string' ? json.scope : null } };
    }

    const versao = (env.META_API_VERSION || '').trim() || 'v26.0';
    const app = { client_id: (env.META_APP_ID || '').trim(), client_secret: (env.META_APP_SECRET || '').trim() };
    const curto = await postForm(`https://graph.facebook.com/${versao}/oauth/access_token`, { ...app, redirect_uri: retorno, code });
    if (curto.json.error || typeof curto.json.access_token !== 'string') return { ok: false, erro: 'O Meta recusou o código de autorização.' };
    // Troca por um token de longa duração (~60 dias).
    const longo = await postForm(`https://graph.facebook.com/${versao}/oauth/access_token`, { ...app, grant_type: 'fb_exchange_token', fb_exchange_token: curto.json.access_token });
    const tk = typeof longo.json.access_token === 'string' ? longo.json.access_token : curto.json.access_token;
    const seg = Number(typeof longo.json.expires_in === 'number' ? longo.json.expires_in : curto.json.expires_in) || 0;
    return { ok: true, tokens: { refresh_token: null, access_token: tk, expira_em: seg > 0 ? new Date(Date.now() + seg * 1000).toISOString() : null, escopos: ESCOPOS.meta.join(',') } };
}
