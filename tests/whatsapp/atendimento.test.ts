// Correções do atendimento da Laura (23/11/2026). Rodar: npm run test:atendimento
//   - câmbio vem dos opcionais/descrição do feed (a Altimus não manda <cambio>): "Civic automático" achava 0 carros;
//   - mesmo modelo fora do filtro aparece (nunca "não temos" com o carro no pátio);
//   - link do Webmotors vira o carro do nosso estoque; resposta à pergunta da troca não vira interesse;
//   - "👍 / ok / obrigado" não gera resposta da Laura nem cobrança; pedido de pessoa/ligação é detectado;
//   - aviso urgente da passagem; cobrança que reabre a loja avisa também o consultor;
//   - horários de visita alternam manhã e tarde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import { cambioDoFeed } from '@/lib/services/altimusInventory';
import { buscarNoEstoque, tipoDeCambio } from '@/lib/whatsapp/ia/estoque';
import { carroDoLinkDoSite, respondeTroca } from '@/lib/identificacao/veiculo';
import { ehSoConfirmacao, pediuHumano } from '@/lib/whatsapp/ia/regras';
import { textoDaPassagem, tipoDoAvisoDePassagem } from '@/lib/avisos/passagem';
import { decidirCobranca, type MsgCobranca } from '@/lib/avisos/cobranca';
import { horariosDeVisitaDetalhados } from '@/lib/laura/playbook';

const carro = (p: Partial<AltimusVehicle> & { descricao?: string; opcionais?: string[] }): AltimusVehicle => ({
    marca: 'Honda', modelo: 'Civic', versao: 'Sedan LXS 1.8/1.8 Flex 16V Aut. 4p', ano: 2012, preco: 65900, km: 189000,
    ...p, cambio: p.cambio ?? cambioDoFeed(null, p.opcionais ?? [], p.descricao ?? `${p.marca ?? 'Honda'} ${p.modelo ?? 'Civic'} ${p.versao ?? 'Sedan LXS 1.8/1.8 Flex 16V Aut. 4p'}`),
});

const ESTOQUE: AltimusVehicle[] = [
    carro({ id_externo: '1', opcionais: ['Câmbio Automático', 'Piloto Automático'] }),
    carro({ id_externo: '2', versao: 'Sedan LXR 2.0 Flexone 16V Aut. 4p', ano: 2014, preco: 74900 }),
    carro({ id_externo: '3', marca: 'Volkswagen', modelo: 'Fox', versao: 'PRIME 1.6 T.Flex 8V 5p', ano: 2010, preco: 32900, opcionais: ['Manual do Proprietário'] }),
    carro({ id_externo: '4', marca: 'Chevrolet', modelo: 'Cruze', versao: 'Sport LTZ 1.4 16V TB Flex 5p Aut.', ano: 2018, preco: 94900 }),
];

test('cambioDoFeed: opcionais e descrição; "Piloto Automático" e "Manual do Proprietário" não são câmbio', () => {
    assert.equal(cambioDoFeed(null, ['Câmbio Automático'], 'Honda Civic LXS'), 'Automático');
    assert.equal(cambioDoFeed(null, ['Câmbio Manual'], 'Fiat Uno'), 'Manual');
    assert.equal(cambioDoFeed(null, ['Piloto Automático'], 'Fiat Strada Working 1.4 Mec. - Branca - 2017/2017'), 'Manual');
    assert.equal(cambioDoFeed(null, [], 'Ford Fusion 2.5L I-VCT Flex Aut.  - Branca - 2014/2014'), 'Automático');
    assert.equal(cambioDoFeed(null, ['Manual do Proprietário'], 'VW Fox PRIME 1.6 T.Flex 8V 5p - Vermelha - 2010/2010'), undefined);
    assert.equal(cambioDoFeed('CVT', [], 'x'), 'CVT');
    assert.equal(tipoDeCambio('CVT'), 'auto');
    assert.equal(tipoDeCambio('Mec.'), 'manual');
});

test('busca "civic automático 2012": acha o Civic do pátio (antes: 0 carros, "não temos Civic")', () => {
    const r = buscarNoEstoque(ESTOQUE, { consulta: 'civic', cambio: 'automático', anoMin: 2012 });
    assert.deepEqual(r.encontrados.map(c => c.id).sort(), ['1', '2']);
});

test('carro com câmbio desconhecido não é descartado pelo filtro de câmbio', () => {
    const r = buscarNoEstoque(ESTOQUE, { consulta: 'fox', cambio: 'manual' });
    assert.deepEqual(r.encontrados.map(c => c.id), ['3']);
});

test('mesmo modelo fora do filtro (preço, câmbio) volta em foraDoFiltro com a diferença', () => {
    const caro = buscarNoEstoque(ESTOQUE, { consulta: 'civic', precoMax: 50000 });
    assert.equal(caro.encontrados.length, 0);
    assert.equal(caro.foraDoFiltro?.length, 2);
    assert.match(caro.foraDoFiltro![0].diferenca, /preço/);
    const manual = buscarNoEstoque(ESTOQUE, { consulta: 'civic', cambio: 'manual' });
    assert.match(manual.foraDoFiltro![0].diferenca, /automático/);
});

test('"sedã 2022" sem nenhum sedã desse ano NÃO vira "nenhum sedã no estoque"', () => {
    const r = buscarNoEstoque(ESTOQUE, { consulta: 'sedan', anoMin: 2022 });
    assert.equal(r.encontrados.length, 0);
    assert.equal(r.semNoTipo, false);
});

test('link do Webmotors resolve o carro do nosso estoque', () => {
    const c = carroDoLinkDoSite('Olá, tenho interesse nesse veículo: https://www.webmotors.com.br/comprar/honda/civic/1.8-lxl-se-16v-flex-4p-automatico/4-portas/2012-2012/81152662?wcta=x', ESTOQUE);
    assert.equal(c?.codigoFeed, '1');
    assert.equal(c?.emEstoque, true);
});

test('respondeTroca: resposta à pergunta da troca não vira carro de interesse', () => {
    assert.equal(respondeTroca('Show! Qual é o carro que você daria na troca? Me diz marca, modelo e ano.', 'Celta duas portas 2009'), true);
    assert.equal(respondeTroca('Qual carro você tem para a troca?', 'Não tenho, quero um Onix 2015'), false);
    assert.equal(respondeTroca('Qual carro você procura?', 'Celta 2009'), false);
});

test('ehSoConfirmacao: 👍, ok, obrigado; pergunta ou assunto novo não', () => {
    for (const t of ['👍', '👍🏼', 'Ok', 'Obrigado 👍🏼', 'Certo', 'Blz', 'valeu!', 'Obrigado pela atenção']) assert.equal(ehSoConfirmacao(t), true, t);
    for (const t of ['Bom dia', 'Rio do Sul', 'ok, qual o preço?', 'quero ver o Fox', 'Pode ser sábado de manhã então', '']) assert.equal(ehSoConfirmacao(t), false, t);
});

test('pediuHumano: atendente, consultor, ligação e "é robô?"', () => {
    for (const t of ['Quero falar com um consultor', 'Posso ligar', 'me liga por favor', 'você é robô?', 'Quero falar com alguém', 'tem como falar com o vendedor?'])
        assert.equal(pediuHumano(t), true, t);
    for (const t of ['O carro liga bem no frio?', 'Procuro um Onix', 'quanto custa?']) assert.equal(pediuHumano(t), false, t);
});

test('passagem: tipo e texto do aviso urgente', () => {
    assert.equal(tipoDoAvisoDePassagem('pediu_pessoa'), 'precisa_humano');
    assert.equal(tipoDoAvisoDePassagem('visita_confirmada'), 'visita_confirmada');
    const t = textoDaPassagem({ motivo: 'pediu_pessoa', cliente: 'Faet Silva', carro: 'Haval H6 GT 2024', resumo: 'Quer saber se aceita troca.', visita: null, link: 'https://x/conversas?c=1', semDono: false });
    assert.match(t, /URGENTE/);
    assert.match(t, /Faet · Haval H6 GT 2024/);
    assert.match(t, /https:\/\/x\/conversas\?c=1/);
    const v = textoDaPassagem({ motivo: 'visita_confirmada', cliente: null, carro: null, resumo: null, visita: 'amanhã às 10h', link: 'L', semDono: true });
    assert.match(v, /VISITA CONFIRMADA PELA LAURA\* \(amanhã às 10h\)/);
    assert.match(v, /primeiro que responder/);
});

const T0 = Date.parse('2026-11-23T14:00:00Z');
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString();
const mt = (autor: string, min: number, texto: string): MsgCobranca => ({ autor, criadaEm: iso(min), texto });

test('cobrança: "👍" depois de fala da loja sem pergunta não é cliente esperando', () => {
    const msgs = [mt('vendedor', 0, 'Fechado, te espero amanhã.'), mt('cliente', 2, '👍')];
    const d = decidirCobranca({ status: 'humano', temConsultor: true, msgs, passagemEm: null, niveisJaEnviados: [], lojaAberta: true, agora: new Date(T0 + 60 * 60_000) });
    assert.deepEqual(d, { acao: 'pular', motivo: 'ninguém esperando' });
    // se a loja tinha perguntado algo, "ok" é resposta e conta
    const msgs2 = [mt('vendedor', 0, 'Posso reservar a visita pra amanhã?'), mt('cliente', 2, 'ok')];
    assert.equal(decidirCobranca({ status: 'humano', temConsultor: true, msgs: msgs2, passagemEm: null, niveisJaEnviados: [], lojaAberta: true, agora: new Date(T0 + 60 * 60_000) }).acao, 'avisar');
});

test('cobrança: loja reabre com espera longa → nível 3 avisa o consultor também (1ª vez)', () => {
    const msgs = [mt('cliente', 0, 'Quero ver o Uno')];
    const d = decidirCobranca({ status: 'humano', temConsultor: true, msgs, passagemEm: iso(1), niveisJaEnviados: [], lojaAberta: true, agora: new Date(T0 + 20 * 3600_000) });
    assert.equal(d.acao, 'avisar');
    if (d.acao === 'avisar') { assert.equal(d.nivel, 3); assert.equal(d.avisarConsultor, true); }
    const d2 = decidirCobranca({ status: 'humano', temConsultor: true, msgs, passagemEm: iso(1), niveisJaEnviados: [2], lojaAberta: true, agora: new Date(T0 + 20 * 3600_000) });
    if (d2.acao === 'avisar') assert.equal(d2.avisarConsultor, false);
});

test('horários de visita: alternam manhã e tarde', () => {
    const HORAS = { seg_sex: [8, 18] as [number, number], sab: [8, 12] as [number, number], tz: 'America/Sao_Paulo' };
    // segunda 23/11/2026, 15h40 em SP
    const det = horariosDeVisitaDetalhados(HORAS as never, new Set(), new Date('2026-11-23T18:40:00Z'), 5);
    assert.equal(det.length, 5);
    const horas = det.map(h => Number(/às (\d+)h/.exec(h.rotulo)?.[1]));
    assert.ok(horas.some(h => h < 12) && horas.some(h => h >= 14), horas.join(','));
});
