import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoPedido } from '@/lib/whatsapp/ia/espera';

const base = { texto: 'Civic', marca: null, modelo: null, carroceria: null, anoMin: null, precoMax: null, cambio: null };

test('a chave do pedido ignora acento, caixa e espaços', () => {
    assert.equal(chaveDoPedido({ ...base, marca: 'Honda', modelo: 'Civic' }), chaveDoPedido({ ...base, marca: 'HONDA ', modelo: 'cívic' }));
});
test('sem marca/modelo, usa o texto do cliente', () => {
    assert.equal(chaveDoPedido({ ...base, texto: 'SUV  automático!' }), 'suv automatico');
});
