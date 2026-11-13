// Vocabulário de carro do brasileiro, busca por tipo, resposta curta e espera de 20 s. Rodar: npm run test:vocabulario
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARIO_BRASIL, carroceriaDoModelo, carroceriasPedidas, semPalavrasDeCarroceria } from '@/lib/vocabulario/carros';
import { buscarNoEstoque } from '@/lib/whatsapp/ia/estoque';
import { respostaLonga } from '@/lib/whatsapp/ia/regras';
import { ESPERA_PADRAO_MS } from '@/lib/whatsapp/ia/motor';
import { LAURA_CRM_PROMPT } from '@/lib/whatsapp/ia/prompt';
import type { AltimusVehicle } from '@/lib/services/altimusInventory';

test('entende como o brasileiro PEDE o tipo de carro', () => {
    assert.deepEqual(carroceriasPedidas('Tem algum SUV?'), ['suv']);
    assert.deepEqual(carroceriasPedidas('quero um carro alto, tipo jipe'), ['suv']);
    assert.deepEqual(carroceriasPedidas('procuro um sedã automático'), ['sedan']);
    assert.deepEqual(carroceriasPedidas('sedan'), ['sedan']);
    assert.deepEqual(carroceriasPedidas('um hatch econômico'), ['hatch']);
    assert.deepEqual(carroceriasPedidas('carro popular'), ['hatch']);
    for (const f of ['caminhonete', 'caminhoneta', 'camionete', 'picape', 'pickup', 'pick-up', 'cabine dupla']) {
        assert.deepEqual(carroceriasPedidas(`vcs tem ${f}?`), ['picape'], f);
    }
    assert.deepEqual(carroceriasPedidas('preciso de uma minivan de 7 lugares'), ['minivan']);
    assert.deepEqual(carroceriasPedidas('uma perua'), ['perua']);
    assert.deepEqual(carroceriasPedidas('Onix 2019 até 60 mil'), []);
    assert.deepEqual(carroceriasPedidas(''), []);
});

test('tira a palavra do tipo e sobra o que identifica o carro', () => {
    assert.equal(semPalavrasDeCarroceria('quero um SUV automático'), 'quero um automatico');
    assert.equal(semPalavrasDeCarroceria('Compass'), 'compass');
});

test('diz a que tipo cada modelo pertence', () => {
    const casos: [string, string, string | null, string][] = [
        ['Jeep', 'Compass Limited', null, 'suv'], ['Volkswagen', 'Nivus Highline', null, 'suv'], ['Chevrolet', 'Tracker Premier', null, 'suv'],
        ['GWM', 'Haval H6 34 1.5 AWD (Hibrido)', null, 'suv'], ['Honda', 'HR-V EXL', null, 'suv'], ['Toyota', 'Corolla Cross XRE', null, 'suv'],
        ['Toyota', 'Corolla XEi', null, 'sedan'], ['Honda', 'Civic LXS', null, 'sedan'], ['Chevrolet', 'Onix Plus Premier', null, 'sedan'],
        ['Chevrolet', 'Cruze LTZ', null, 'sedan'], ['Chevrolet', 'Cruze Sport6 LTZ', null, 'hatch'], ['Hyundai', 'HB20S Comfort', null, 'sedan'],
        ['Chevrolet', 'Onix LTZ', null, 'hatch'], ['Hyundai', 'HB20 Sense', null, 'hatch'], ['Volkswagen', 'Gol 1.0', null, 'hatch'], ['Fiat', 'Argo Drive', null, 'hatch'],
        ['Fiat', 'Strada Freedom', null, 'picape'], ['Fiat', 'Toro Ranch', null, 'picape'], ['Toyota', 'Hilux SRX', null, 'picape'], ['Chevrolet', 'S10 LTZ', null, 'picape'],
        ['Renault', 'Duster Oroch', null, 'picape'], ['Renault', 'Duster Intense', null, 'suv'],
        ['Fiat', 'Palio Weekend', null, 'perua'], ['Fiat', 'Palio Attractive', null, 'hatch'],
        ['Chevrolet', 'Spin LTZ', null, 'minivan'], ['Fiat', 'Doblò Essence', null, 'minivan'], ['Fiat', 'Doblò Cargo', null, 'utilitario'], ['Fiat', 'Fiorino', null, 'utilitario'],
    ];
    for (const [marca, modelo, versao, esperado] of casos) assert.equal(carroceriaDoModelo(marca, modelo, versao), esperado, `${marca} ${modelo}`);
    // o ANO no nome não vira modelo (2008 é Peugeot 2008, mas também é ano)
    assert.equal(carroceriaDoModelo('Chevrolet', 'Onix 2008', null), 'hatch');
    // moto e modelo desconhecido: não afirma o tipo
    assert.equal(carroceriaDoModelo('Honda', 'Biz 125', null), null);
    assert.equal(carroceriaDoModelo('Marca Estranha', 'Modelo Zeta', null), null);
});

const v = (marca: string, modelo: string, ano: number, preco: number, extra: Partial<AltimusVehicle> = {}): AltimusVehicle => ({ marca, modelo, ano, preco, km: 40000, ...extra });
const ESTOQUE: AltimusVehicle[] = [
    v('Jeep', 'Compass Limited', 2019, 119900), v('Volkswagen', 'Nivus Highline', 2024, 129900), v('Chevrolet', 'Onix LTZ', 2018, 59900),
    v('Toyota', 'Corolla XEi', 2020, 109900), v('Fiat', 'Strada Freedom', 2021, 89900), v('Hyundai', 'HB20 Sense', 2020, 62900),
];

test('busca no estoque por tipo: SUV traz só SUV; picape traz só picape; automático e preço continuam filtrando', () => {
    const suv = buscarNoEstoque(ESTOQUE, { consulta: 'suv' });
    assert.deepEqual(suv.encontrados.map(c => c.carro).sort(), ['Jeep Compass Limited', 'Volkswagen Nivus Highline']);
    assert.ok(suv.encontrados.every(c => c.tipo === 'SUV'));
    assert.deepEqual(suv.tiposPedidos, ['SUV']);
    assert.deepEqual(buscarNoEstoque(ESTOQUE, { consulta: 'caminhoneta' }).encontrados.map(c => c.carro), ['Fiat Strada Freedom']);
    assert.deepEqual(buscarNoEstoque(ESTOQUE, { consulta: 'sedã' }).encontrados.map(c => c.carro), ['Toyota Corolla XEi']);
    assert.deepEqual(buscarNoEstoque(ESTOQUE, { consulta: 'hatch', precoMax: 59000 }).encontrados.map(c => c.carro), ['Chevrolet Onix LTZ']);
    // tipo + modelo: o tipo filtra e o nome pontua
    assert.deepEqual(buscarNoEstoque(ESTOQUE, { consulta: 'suv compass' }).encontrados.map(c => c.carro), ['Jeep Compass Limited']);
});

test('loja sem o tipo pedido: avisa (não inventa SUV) e oferece parecidos', () => {
    const r = buscarNoEstoque(ESTOQUE.filter(c => c.modelo !== 'Compass Limited' && c.modelo !== 'Nivus Highline'), { consulta: 'suv' });
    assert.equal(r.encontrados.length, 0);
    assert.equal(r.semNoTipo, true);
    assert.deepEqual(r.tiposPedidos, ['SUV']);
    assert.ok(r.parecidos.length > 0);
    // pedido comum (sem tipo) não ativa o aviso
    assert.equal(buscarNoEstoque(ESTOQUE, { consulta: 'ferrari' }).semNoTipo, false);
});

test('a Laura recebe o glossário brasileiro no prompt', () => {
    for (const termo of ['SUV', 'Sedã', 'Hatch', 'caminhonete', 'caminhoneta', 'Picape', 'Perua', 'Minivan', 'financiar', 'à vista', 'vc/vcs']) {
        assert.match(LAURA_CRM_PROMPT, new RegExp(termo, 'i'), termo);
    }
    assert.match(GLOSSARIO_BRASIL, /chame buscar_estoque com a palavra do tipo/);
    assert.match(GLOSSARIO_BRASIL, /Nunca diga que um carro é de um tipo se buscar_estoque não confirmou/);
});

test('respostas curtas: o prompt manda e a trava pega a resposta longa', () => {
    assert.match(LAURA_CRM_PROMPT, /no máximo 2 frases curtas/);
    assert.match(LAURA_CRM_PROMPT, /responda UMA vez só/);
    assert.equal(respostaLonga('Oi! Tem sim o Compass 2019, prata, 58 mil km. Quer ver as fotos?'), false);
    assert.equal(respostaLonga('x'.repeat(281)), true);
    const lista = ['Aqui vão as opções:', 'Compass 2019 · prata · 58.000 km · R$ 119.900', 'Nivus 2024 · branco · 12.000 km · R$ 129.900', 'Creta 2022 · preto · 30.000 km · R$ 99.900'].join('\n');
    assert.equal(respostaLonga(lista), false);          // lista de carros ganha espaço
    assert.equal(respostaLonga(`${lista}\n${'y'.repeat(400)}`), true);
});

test('a Laura espera 20 s de silêncio para juntar as mensagens e responder uma vez', () => {
    assert.equal(ESPERA_PADRAO_MS, 20_000);
});
