import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankingDeDemanda, type PedidoLinha } from '@/lib/espera/ranking';

const agora = new Date('2026-11-18T12:00:00Z');
const p = (o: Partial<PedidoLinha>): PedidoLinha => ({
    id: 'x', chave: 'honda civic', texto_original: 'Civic', telefone_key: '5547900000001',
    preco_max: null, criado_em: '2026-11-16T12:00:00Z', status: 'aguardando', ...o,
});

test('agrupa por carro, conta pessoas diferentes e ordena pela maior demanda', () => {
    const r = rankingDeDemanda([
        p({ telefone_key: '1' }), p({ telefone_key: '2', preco_max: 90000, criado_em: '2026-11-10T12:00:00Z' }), p({ telefone_key: '2' }),
        p({ chave: 'suv', texto_original: 'SUV', telefone_key: '3' }),
    ], agora);
    assert.deepEqual(r.map(x => [x.chave, x.pessoas]), [['honda civic', 2], ['suv', 1]]);
    assert.equal(r[0].maisAntigoDias, 8);
    assert.equal(r[0].precoMedio, 90000);
    assert.equal(r[1].precoMedio, null);
});

test('só pedidos aguardando entram no ranking', () => {
    assert.deepEqual(rankingDeDemanda([p({ status: 'avisado' }), p({ status: 'cancelado' })], agora), []);
});
