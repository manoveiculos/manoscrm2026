// Cliente que quer vender o carro vai ao Felipe Ledra. Rodar: npm run test:avisos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escolherComprador, textoCompra, type Comprador } from '@/lib/avisos/comprador';

const c = (name: string, o: Partial<Comprador> = {}): Comprador => ({ id: name, name, phone: '5547992864987', ativo: true, phoneVerificado: true, ...o });

test('acha o Felipe mesmo com recebe_leads desligado e nome completo', () => {
    assert.equal(escolherComprador([c('Victor'), c('Felipe Ledra')])?.name, 'Felipe Ledra');
});
test('Felipe inativo, sem WhatsApp confirmado ou sem telefone: não encaminha', () => {
    assert.equal(escolherComprador([c('Felipe Ledra', { ativo: false })]), null);
    assert.equal(escolherComprador([c('Felipe Ledra', { phoneVerificado: false })]), null);
    assert.equal(escolherComprador([c('Felipe Ledra', { phone: null })]), null);
});
test('aviso traz cliente, carro e link', () => {
    const t = textoCompra({ cliente: 'João Silva', carro: 'Onix 2019', resumo: 'km 60 mil', link: 'https://x/lead/1' });
    assert.match(t, /João/); assert.match(t, /Onix 2019/); assert.match(t, /https:\/\/x\/lead\/1/);
});
