// O push precisa ficar DESLIGADO (sem erro) enquanto faltarem as chaves VAPID,
// para o código poder ir ao ar antes da migration e da configuração.
// Rodar: npm run test:push
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('sem chaves VAPID: desligado, sem tentar enviar nem lançar erro', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { enviarPushParaConsultor, pushConfigurado, chavePublicaPush } = await import('@/lib/push/enviarPush');
    assert.equal(pushConfigurado(), false);
    assert.equal(chavePublicaPush(), null);
    const r = await enviarPushParaConsultor('00000000-0000-4000-8000-000000000000', { titulo: 't', corpo: 'c' });
    assert.deepEqual(r, { enviados: 0, falhas: 0, desligado: true });
});

test('sem consultor: desligado', async () => {
    const { enviarPushParaConsultor } = await import('@/lib/push/enviarPush');
    const r = await enviarPushParaConsultor(null, { titulo: 't', corpo: 'c' });
    assert.equal(r.desligado, true);
});
