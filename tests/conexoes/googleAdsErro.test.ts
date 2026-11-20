import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigosDoErro, explicarErroGoogleAds } from '@/lib/conexoes/googleAdsErro';

const corpo = (codigo: Record<string, string>) => [{ error: { code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED', details: [{ errors: [{ errorCode: codigo, message: 'x' }] }] } }];
const CTX = { cliente: '5320698839', login: '8098644893' };

test('lê os códigos de erro do Google Ads de dentro de details', () => {
    assert.deepEqual(codigosDoErro(corpo({ authorizationError: 'USER_PERMISSION_DENIED' })), ['authorizationError: USER_PERMISSION_DENIED']);
    assert.deepEqual(codigosDoErro(null), []);
    assert.deepEqual(codigosDoErro({ error: { message: 'm' } }), []);
});

test('sem permissão: diz qual conta gerente e manda conectar com o e-mail certo', () => {
    const t = explicarErroGoogleAds(403, corpo({ authorizationError: 'USER_PERMISSION_DENIED' }), CTX);
    assert.match(t, /809-864-4893/);
    assert.match(t, /Conectar/);
    assert.match(t, /USER_PERMISSION_DENIED/);
});

test('developer token e conta desativada têm explicação própria', () => {
    assert.match(explicarErroGoogleAds(403, corpo({ authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' }), CTX), /developer token/i);
    assert.match(explicarErroGoogleAds(403, corpo({ authorizationError: 'CUSTOMER_NOT_ENABLED' }), CTX), /532-069-8839/);
});

test('erro desconhecido mantém a mensagem original do Google', () => {
    const t = explicarErroGoogleAds(500, { error: { message: 'boom' } }, CTX);
    assert.equal(t, 'Google Ads (500): boom');
});
