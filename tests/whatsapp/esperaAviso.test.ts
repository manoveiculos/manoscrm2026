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

// 25/11/2026: cinco clientes do Kia Soul receberam aviso de uma Fiat Toro ("16V" e "Aut." em comum).
const toro: AltimusVehicle = { id_externo: '4840302', marca: 'Fiat', modelo: 'Toro', versao: 'Ranch 2.2 16V 4x4 TB Diesel Aut.', ano: 2023, preco: 134000, km: 52000, cambio: 'Automático' };
const soul: AltimusVehicle = { id_externo: '4048407', marca: 'Kia', modelo: 'Soul', versao: '1.6/ 1.6 16V FLEX Aut.', ano: 2016, preco: 76900, km: 105800, cambio: 'Automático' };
const sportage: AltimusVehicle = { id_externo: 'K2', marca: 'Kia', modelo: 'Sportage', versao: 'LX 2.0 16V Flex Aut.', ano: 2018, preco: 95000, km: 80000, cambio: 'Automático' };

test('pedido do Kia Soul não casa com Toro (só "16V"/"Aut." em comum) nem com outro Kia', () => {
    const soulPedido = pedido({ texto_original: 'Kia Soul 1.6 16V Flex automático vermelho 2015/2016', marca: 'Kia', modelo: 'Soul', ano_min: 2015, cambio: 'automático' });
    assert.equal(pedidoCombina(soulPedido, toro), false);
    assert.equal(pedidoCombina(soulPedido, sportage), false);
    assert.equal(pedidoCombina(soulPedido, soul), true);
    // pedido anotado só com o texto (sem marca/modelo nas colunas): mesma regra
    const soTexto = pedido({ texto_original: 'Kia Soul 1.6 16V Flex automático vermelho 2015/2016', cambio: 'automático' });
    assert.equal(pedidoCombina(soTexto, toro), false);
    assert.equal(pedidoCombina(soTexto, soul), true);
});

test('pedido com vários modelos casa com qualquer um deles; ano não vira modelo', () => {
    const varios = pedido({ texto_original: 'Gol, Celta ou Corsa' });
    assert.equal(pedidoCombina(varios, { ...onix, modelo: 'Celta', marca: 'Chevrolet' }), true);
    assert.equal(pedidoCombina(varios, onix), false);
    // "Onix 2008" é ano: não casa com Peugeot 2008
    assert.equal(pedidoCombina(pedido({ texto_original: 'Onix 2008' }), { id_externo: 'P1', marca: 'Peugeot', modelo: '2008', ano: 2020, preco: 70000 }), false);
});

test('pedido só de cor/motor/câmbio não casa com tudo', () => {
    assert.equal(pedidoCombina(pedido({ texto_original: 'flex automático vermelho' }), toro), false);
    assert.equal(pedidoCombina(pedido({ texto_original: 'SUV automático', carroceria: 'suv' }), toro), false);   // Toro é picape
});
