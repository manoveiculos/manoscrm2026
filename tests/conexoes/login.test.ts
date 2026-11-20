import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarGoogle, interpretarMeta, precisaRegistrar } from '@/lib/conexoes/login';

const AGORA = Date.parse('2026-11-20T12:00:00Z');
const emDias = (d: number) => Math.floor((AGORA + d * 86_400_000) / 1000);

test('Meta: token expirado (código 190) = login caiu, com caminho para reconectar', () => {
    const r = interpretarMeta({ http: 400, corpo: { error: { code: 190, message: 'Error validating access token: Session has expired' } } }, AGORA);
    assert.equal(r.estado, 'caiu');
    assert.ok(r.reconectar?.url.startsWith('https://business.facebook.com'));
    assert.ok(!JSON.stringify(r).includes('Session has expired'), 'não repete a mensagem crua do Meta');
});

test('Meta: is_valid=false também é queda; válido sem vencimento é ok', () => {
    assert.equal(interpretarMeta({ http: 200, corpo: { data: { is_valid: false } } }, AGORA).estado, 'caiu');
    assert.equal(interpretarMeta({ http: 200, corpo: { data: { is_valid: true, expires_at: 0 } } }, AGORA).estado, 'ok');
});

test('Meta: vence em poucos dias = atenção; vence longe = ok', () => {
    assert.equal(interpretarMeta({ http: 200, corpo: { data: { is_valid: true, expires_at: emDias(3) } } }, AGORA).estado, 'atencao');
    assert.equal(interpretarMeta({ http: 200, corpo: { data: { is_valid: true, expires_at: emDias(40) } } }, AGORA).estado, 'ok');
});

test('Meta: instabilidade e erro que não é de login NÃO viram queda', () => {
    assert.equal(interpretarMeta({ http: 503, corpo: null }, AGORA).estado, 'atencao');
    assert.equal(interpretarMeta({ http: 400, corpo: { error: { code: 4, message: 'limite' } } }, AGORA).estado, 'atencao');
    assert.equal(interpretarMeta({ http: 200, corpo: 'lixo' }, AGORA).estado, 'atencao');
});

test('Google: invalid_grant = login caiu; segredo errado e instabilidade não', () => {
    assert.equal(interpretarGoogle({ http: 400, corpo: { error: 'invalid_grant' } }).estado, 'caiu');
    assert.equal(interpretarGoogle({ http: 401, corpo: { error: 'invalid_client' } }).estado, 'atencao');
    assert.equal(interpretarGoogle({ http: 500, corpo: null }).estado, 'atencao');
    assert.equal(interpretarGoogle({ http: 200, corpo: { access_token: 'x' } }).estado, 'ok');
    assert.ok(!JSON.stringify(interpretarGoogle({ http: 200, corpo: { access_token: 'segredo123' } })).includes('segredo123'));
});

test('avisa só na transição: não repete enquanto continua caído', () => {
    assert.equal(precisaRegistrar('caiu', null), 'caiu');
    assert.equal(precisaRegistrar('caiu', 'ok'), 'caiu');
    assert.equal(precisaRegistrar('caiu', 'caiu'), null);
    assert.equal(precisaRegistrar('ok', 'caiu'), 'voltou');
    assert.equal(precisaRegistrar('ok', 'ok'), null);
    assert.equal(precisaRegistrar('ok', null), null);
    assert.equal(precisaRegistrar('atencao', 'caiu'), null);
});
