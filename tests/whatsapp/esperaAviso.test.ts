import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import { mensagemDeAviso, pedidoCombina, type PedidoDoBanco } from '@/lib/whatsapp/ia/esperaAviso';

const civic: AltimusVehicle = { id_externo: 'A1', marca: 'Honda', modelo: 'Civic', versao: 'EXL 2.0', ano: 2019, preco: 98000, km: 54000, cambio: 'Automático' };
const onix: AltimusVehicle = { id_externo: 'A2', marca: 'Chevrolet', modelo: 'Onix', ano: 2021, preco: 62000, km: 30000, cambio: 'Manual' };

const pedido = (p: Partial<PedidoDoBanco>): PedidoDoBanco => ({
    id: 'p1', telefone_key: '47988880001', lead_uid: null, conversa_id: null, consultor_id: null,
    nome_cliente: null, texto_original: 'Civic', ano_min: null, preco_max: null, cambio: null, ...p,
});

test('pedido por modelo casa só com o modelo certo', () => {
    assert.equal(pedidoCombina(pedido({}), civic), true);
    assert.equal(pedidoCombina(pedido({}), onix), false);
});

test('ano, preço (folga de 5%) e câmbio filtram', () => {
    assert.equal(pedidoCombina(pedido({ ano_min: 2020 }), civic), false);
    assert.equal(pedidoCombina(pedido({ preco_max: 90000 }), civic), false);
    assert.equal(pedidoCombina(pedido({ preco_max: 95000 }), civic), true);   // 98.000 <= 95.000 * 1,05
    assert.equal(pedidoCombina(pedido({ cambio: 'manual' }), civic), false);
});

test('pedido vago ("carro") nunca casa com tudo', () => {
    assert.equal(pedidoCombina(pedido({ texto_original: 'um carro' }), civic), false);
    assert.equal(pedidoCombina(pedido({ texto_original: '' }), civic), false);
});

test('mensagem de aviso usa só os dados do feed e o primeiro nome', () => {
    const m = mensagemDeAviso(pedido({ nome_cliente: 'Maria Souza' }), civic);
    assert.match(m, /^Oi, Maria!/);
    assert.match(m, /Honda Civic EXL 2\.0/);
    assert.match(m, /2019/);
    assert.match(m, /R\$ 98\.000/);
    assert.match(mensagemDeAviso(pedido({}), civic), /^Oi! /);
});
