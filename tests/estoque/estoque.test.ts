// Estoque pela API da Altimus (função única). Rodar: npm run test:estoque
// Usa um feed fictício em XML (mesmo formato do real) e simula a Altimus fora do ar.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getInventoryInfo } from '@/lib/services/altimusInventory';
import { estoqueAtual, filtrarEstoque, pisoDoEstoque, precosAnunciadosDoEstoque } from '@/lib/estoque';

const veiculo = (id: string, desc: string, valor: string, ano: number, km: number, extra = '') =>
    `<veiculo><id>${id}</id><marca>1</marca><modelo>2</modelo><versao>3</versao><valor>${valor}</valor><ano>${ano}</ano>` +
    `<descricao>${desc}</descricao><km>${km}</km><cor>Prata</cor><combustivel>Flex</combustivel>${extra}</veiculo>`;

const FEED = `<?xml version="1.0"?><estoque>${[
    veiculo('1', 'Chevrolet Onix HATCH PREM. PII 1.0 12V TB Flex 5p Aut. - Prata - 2024/2025', '88900.0', 2025, 39000,
        '<opcionais><opcional>Airbag</opcional><opcional>Ar Condicionado</opcional></opcionais><fotos><imagem>https://ex/1.jpg</imagem></fotos>'),
    veiculo('2', 'Jeep Compass LIMITED 2.0 4x2 Flex 16V Aut. - Prata - 2018/2019', '129900.0', 2019, 80000),
    veiculo('3', 'Chevrolet Cruze Sport LTZ 1.4 16V TB Flex 5p Aut. - Prata - 2018/2018', '99900.0', 2018, 70000),
    veiculo('4', 'Honda Biz 125 ES - Vermelha - 2020/2020', '12900.0', 2020, 20000),
].join('')}</estoque>`;

const fetchOriginal = globalThis.fetch;
let modo: 'ok' | 'fora' = 'ok';
let chamadas = 0;
globalThis.fetch = (async () => {
    chamadas++;
    if (modo === 'fora') throw new Error('Altimus fora do ar (simulado)');
    return new Response(FEED, { status: 200 });
}) as typeof fetch;

beforeEach(() => { modo = 'ok'; });

test('feed novo: carros que faltavam na tabela respondem, com preço do feed e opcionais', async () => {
    const e = await estoqueAtual(true);
    assert.equal(e.desatualizado, false);
    assert.equal(e.carros.length, 4);
    const compass = filtrarEstoque(e.carros, { busca: 'compass' });
    assert.equal(compass.length, 1);
    assert.equal(compass[0].ano, 2019);
    const cruze = filtrarEstoque(e.carros, { busca: 'cruze ltz' });
    assert.equal(cruze.length, 1);
    const onix = filtrarEstoque(e.carros, { busca: 'onix' });
    assert.equal(onix[0].preco, 88900); // o preço certo, não o R$ 93.900 da tabela antiga
    assert.deepEqual(onix[0].opcionais, ['Airbag', 'Ar Condicionado']);
    assert.deepEqual(onix[0].fotos, ['https://ex/1.jpg']);
});

test('carro que saiu do feed não aparece; busca sem resultado devolve lista vazia', async () => {
    const e = await estoqueAtual(true);
    assert.equal(filtrarEstoque(e.carros, { busca: 'uno' }).length, 0);
    assert.equal(filtrarEstoque(e.carros, { busca: 'hb20 c.style' }).length, 0);
    assert.equal(filtrarEstoque(e.carros, { busca: 'ferrari' }).length, 0);
    assert.equal(filtrarEstoque(e.carros, { id: '999' }).length, 0);
    assert.equal(filtrarEstoque(e.carros, { id: '2' })[0].modelo.length > 0, true);
});

test('preços anunciados e piso (moto fora do piso)', async () => {
    await estoqueAtual(true);
    const precos = await precosAnunciadosDoEstoque();
    assert.ok(precos.includes(88900) && !precos.includes(93900));
    assert.equal(await pisoDoEstoque(), 88900); // Biz de R$ 12.900 não vira piso
});

test('Altimus fora do ar: usa a última cópia boa e marca "desatualizado" — nunca vazio nem tabela antiga', async () => {
    await estoqueAtual(true);
    modo = 'fora';
    const e = await estoqueAtual(true);
    assert.equal(e.desatualizado, true);
    assert.equal(e.carros.length, 4);
    assert.equal(filtrarEstoque(e.carros, { busca: 'compass' }).length, 1);
    // a falha não vira cache de 10 min: tenta de novo logo (1 min)
    modo = 'ok';
    const antes = chamadas;
    const info = await getInventoryInfo(true);
    assert.equal(info.desatualizado, false);
    assert.ok(chamadas > antes);
});

test('limite e busca por texto livre', async () => {
    const e = await estoqueAtual(true);
    assert.equal(filtrarEstoque(e.carros, { limite: 2 }).length, 2);
    assert.equal(filtrarEstoque(e.carros, { busca: 'chevrolet' }).length, 2);
    assert.equal(filtrarEstoque(e.carros, { busca: 'quero um carro' }).length, 4); // só palavras de enchimento = tudo
});

test.after(() => { globalThis.fetch = fetchOriginal; });
