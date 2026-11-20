import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enderecoDeRetorno, faltaConfigurar, provedorValido, trocarCodigo, urlDeAutorizacao } from '@/lib/conexoes/oauth';

const ENV = { GOOGLE_ADS_CLIENT_ID: 'gid', GOOGLE_ADS_CLIENT_SECRET: 'gsec', META_APP_ID: 'mid', META_APP_SECRET: 'msec' };

test('só aceita google e meta', () => {
    assert.ok(provedorValido('google') && provedorValido('meta'));
    assert.ok(!provedorValido('tiktok') && !provedorValido('') && !provedorValido('../x'));
});

test('diz o que falta configurar, só pelo NOME da variável', () => {
    assert.deepEqual(faltaConfigurar('meta', {}), ['META_APP_ID', 'META_APP_SECRET']);
    assert.deepEqual(faltaConfigurar('meta', { META_APP_ID: 'x' }), ['META_APP_SECRET']);
    assert.deepEqual(faltaConfigurar('google', ENV), []);
    assert.deepEqual(faltaConfigurar('google', { GOOGLE_ADS_CLIENT_ID: '  ' }), ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET']);
});

test('endereço de retorno: usa a origem, ou OAUTH_BASE_URL se definida', () => {
    assert.equal(enderecoDeRetorno('google', 'https://manoscrm.com.br', {}), 'https://manoscrm.com.br/api/oauth/google/callback');
    assert.equal(enderecoDeRetorno('meta', 'http://localhost:3000', { OAUTH_BASE_URL: 'https://manoscrm.com.br/' }), 'https://manoscrm.com.br/api/oauth/meta/callback');
});

test('Google: pede acesso offline (renovável), o escopo do Google Ads e leva o state', () => {
    const u = new URL(urlDeAutorizacao('google', 'https://x/cb', 'abc123', ENV));
    assert.equal(u.hostname, 'accounts.google.com');
    assert.equal(u.searchParams.get('access_type'), 'offline');
    assert.equal(u.searchParams.get('prompt'), 'consent');
    assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/adwords');
    assert.equal(u.searchParams.get('state'), 'abc123');
    assert.equal(u.searchParams.get('client_id'), 'gid');
    assert.ok(!u.search.includes('gsec'), 'o segredo nunca vai na URL');
});

test('Meta: pede ads_read e ads_management e leva o state; o segredo não vai na URL', () => {
    const u = new URL(urlDeAutorizacao('meta', 'https://x/cb', 'zzz', { ...ENV, META_API_VERSION: 'v26.0' }));
    assert.equal(u.hostname, 'www.facebook.com');
    assert.ok(u.pathname.startsWith('/v26.0/dialog/oauth'));
    assert.match(u.searchParams.get('scope') || '', /ads_read.*ads_management|ads_management.*ads_read/);
    assert.equal(u.searchParams.get('state'), 'zzz');
    assert.ok(!u.search.includes('msec'));
});

test('Meta com "Login para empresas": usa config_id e não manda scope', () => {
    const u = new URL(urlDeAutorizacao('meta', 'https://x/cb', 'zzz', { ...ENV, META_LOGIN_CONFIG_ID: '999888' }));
    assert.equal(u.searchParams.get('config_id'), '999888');
    assert.equal(u.searchParams.get('override_default_response_type'), 'true');
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('scope'), null);
    assert.equal(u.searchParams.get('state'), 'zzz');
});

test('troca de código: segredos vão no corpo POST, nunca na URL, e o erro não vaza token', async () => {
    const chamadas: { url: string; corpo: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        chamadas.push({ url: String(url), corpo: String(init?.body ?? '') });
        return new Response(JSON.stringify({ access_token: 'AT-secreto', refresh_token: 'RT-secreto', scope: 'adwords' }), { status: 200 });
    }) as typeof fetch;
    try {
        const r = await trocarCodigo('google', 'codigo1', 'https://x/cb', ENV);
        assert.equal(r.ok, true);
        assert.equal(chamadas[0].url, 'https://oauth2.googleapis.com/token');
        assert.ok(chamadas[0].corpo.includes('client_secret=gsec') && !chamadas[0].url.includes('gsec'));

        globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad RT-secreto' }), { status: 400 })) as typeof fetch;
        const falha = await trocarCodigo('google', 'c', 'https://x/cb', ENV);
        assert.equal(falha.ok, false);
        assert.ok(!JSON.stringify(falha).includes('RT-secreto'));

        // Google sem refresh_token: orienta a remover o acesso antigo
        globalThis.fetch = (async () => new Response(JSON.stringify({ access_token: 'a' }), { status: 200 })) as typeof fetch;
        const sem = await trocarCodigo('google', 'c', 'https://x/cb', ENV);
        assert.equal(sem.ok, false);
        assert.match(JSON.stringify(sem), /permissions/);
    } finally {
        globalThis.fetch = original;
    }
});

test('Meta: troca o código e depois pelo token de longa duração, com validade', async () => {
    const original = globalThis.fetch;
    let n = 0;
    globalThis.fetch = (async () => {
        n++;
        return new Response(JSON.stringify(n === 1 ? { access_token: 'curto', expires_in: 3600 } : { access_token: 'longo', expires_in: 5184000 }), { status: 200 });
    }) as typeof fetch;
    try {
        const r = await trocarCodigo('meta', 'c', 'https://x/cb', ENV);
        assert.ok(r.ok);
        if (r.ok) {
            assert.equal(r.tokens.access_token, 'longo');
            assert.ok(Date.parse(r.tokens.expira_em!) > Date.now() + 50 * 86_400_000);
        }
        assert.equal(n, 2);
    } finally {
        globalThis.fetch = original;
    }
});
