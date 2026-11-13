// Telefone do consultor: formato 55+DDD+número e código de confirmação. Rodar: npm run test:telefone
// (números inventados, de teste)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarTelefoneBR, normalizarTelefoneBR } from '@/lib/telefone';
import { MAX_TENTATIVAS, conferirCodigo, gerarCodigo, podePedirCodigo, resumoDoCodigo, textoDoCodigo } from '@/lib/telefoneCodigo';
import { comRotaPorNome, corpoDoAviso, telefoneDoAviso } from '@/lib/avisos/webhookVendedor';

test('qualquer jeito de digitar vira 55 + DDD + número, só dígitos', () => {
    for (const bruto of ['(47) 99999-0001', '47999990001', '047999990001', '+55 47 99999-0001', '5547999990001', '55 (47) 99999 0001']) {
        assert.equal(normalizarTelefoneBR(bruto), '5547999990001', bruto);
    }
    assert.equal(normalizarTelefoneBR('(47) 3333-0001'), '554733330001');   // fixo, 8 dígitos
    assert.equal(normalizarTelefoneBR('554788880001'), '554788880001');     // celular antigo, sem o 9
    assert.equal(normalizarTelefoneBR('(55) 99999-0001'), '5555999990001'); // DDD 55 (RS) não é confundido com o código do país
});

test('sem DDD, incompleto ou estranho não passa', () => {
    for (const ruim of ['', null, undefined, '99999-0001', '999990001', '47 9999', '(47) 89999-0001', '(05) 99999-0001', '123', 'abc', '+1 415 555 0100', '55479999900011']) {
        assert.equal(normalizarTelefoneBR(ruim as string), null, String(ruim));
    }
});

test('mostra na tela como (DDD) número', () => {
    assert.equal(formatarTelefoneBR('5547999990001'), '(47) 99999-0001');
    assert.equal(formatarTelefoneBR('554733330001'), '(47) 3333-0001');
    assert.equal(formatarTelefoneBR('lixo'), 'lixo');
});

test('código: 6 dígitos, e o banco guarda só o resumo amarrado ao consultor e ao número', () => {
    for (let i = 0; i < 50; i++) assert.match(gerarCodigo(), /^\d{6}$/);
    const h = resumoDoCodigo('c1', '5547999990001', '123456');
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.notEqual(h, resumoDoCodigo('c2', '5547999990001', '123456'));
    assert.notEqual(h, resumoDoCodigo('c1', '5547999990002', '123456'));
    assert.doesNotMatch(h, /123456/);
    assert.match(textoDoCodigo('123456'), /código de confirmação é 123456/);
});

test('conferir o código: certo, errado, vencido, usado e muitas tentativas', () => {
    const agora = new Date('2026-11-12T11:00:00Z');
    const g = { codigoHash: resumoDoCodigo('c1', '5547999990001', '123456'), telefone: '5547999990001', expiraEm: '2026-11-12T11:05:00Z', tentativas: 0, usadoEm: null };
    assert.equal(conferirCodigo(g, 'c1', '123456', agora), 'ok');
    assert.equal(conferirCodigo(g, 'c1', '123 456', agora), 'ok');          // espaço não atrapalha
    assert.equal(conferirCodigo(g, 'c1', '654321', agora), 'errado');
    assert.equal(conferirCodigo(g, 'c1', '12345', agora), 'errado');
    assert.equal(conferirCodigo(g, 'outro', '123456', agora), 'errado');     // código de outro consultor não vale
    assert.equal(conferirCodigo(g, 'c1', '123456', new Date('2026-11-12T11:05:00Z')), 'expirado');
    assert.equal(conferirCodigo({ ...g, tentativas: MAX_TENTATIVAS }, 'c1', '123456', agora), 'muitas_tentativas');
    assert.equal(conferirCodigo({ ...g, usadoEm: '2026-11-12T10:59:00Z' }, 'c1', '123456', agora), 'sem_codigo');
    assert.equal(conferirCodigo(null, 'c1', '123456', agora), 'sem_codigo');
});

test('limite de pedidos: 3 em 10 minutos e 8 por dia', () => {
    const agora = new Date('2026-11-12T11:00:00Z');
    const ha = (min: number) => new Date(agora.getTime() - min * 60_000).toISOString();
    assert.deepEqual(podePedirCodigo([], agora), { ok: true });
    assert.deepEqual(podePedirCodigo([ha(1), ha(5)], agora), { ok: true });
    assert.deepEqual(podePedirCodigo([ha(1), ha(5), ha(9)], agora), { ok: false, motivo: 'muitos_envios_agora' });
    assert.deepEqual(podePedirCodigo([ha(11), ha(20), ha(30)], agora), { ok: true });
    assert.deepEqual(podePedirCodigo(Array.from({ length: 8 }, (_, i) => ha(60 + i * 60)), agora), { ok: false, motivo: 'muitos_envios_hoje' });
    assert.deepEqual(podePedirCodigo(Array.from({ length: 8 }, (_, i) => ha(25 * 60 + i)), agora), { ok: true }); // de ontem não conta
});

test('webhook: telefone sempre 55+DDD+número, ou vazio se o cadastro estiver errado', () => {
    assert.equal(telefoneDoAviso('(47) 99999-0001'), '5547999990001');
    assert.equal(telefoneDoAviso('99999-0001'), '');
    const c = corpoDoAviso({ nome: 'Sérgio', mensagem: 'oi', tipo: 'teste', telefone: '47 99999-0001' });
    assert.equal(c.telefone, '5547999990001');
    assert.equal(c.consultant_phone, '5547999990001');
    const antigo = comRotaPorNome({ consultant_name: 'Victor', consultant_phone: '047999990001', type: 'lead_arrival', message: 'Lead novo' });
    assert.equal(antigo.telefone, '5547999990001');
    assert.equal(antigo.consultant_phone, '5547999990001');
    assert.equal(comRotaPorNome({ consultant_name: 'Victor', consultant_phone: '', message: 'x' }).telefone, '');
});
