// Nome e carro de interesse automáticos. Rodar: npm run test:identificacao (sem banco, sem rede)
// Os exemplos têm os MESMOS FORMATOS das respostas reais dos clientes (saudação antes do nome,
// nome seguido de pergunta, título "Prof.", frase "me chamo"…), mas com nomes INVENTADOS:
// nenhum dado de cliente de verdade entra no repositório.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    capitalizarNome, extrairNome, nomeDoPerfilAceito, nomeGenerico, pediuNome, podeTrocarNome, validarNome,
} from '@/lib/identificacao/nome';
import { carroDoAnuncio, carroDoLinkDoSite, carrosCitados, comporInteresse, interesseVazio, mesmoCarro } from '@/lib/identificacao/veiculo';
import type { AltimusVehicle } from '@/lib/services/altimusInventory';

const PEDIDO = 'Bom dia! Pra gente se conhecer melhor, qual é o seu nome? 😊';

test('nome: 18 formatos reais de resposta ao pedido de nome viram o nome limpo', () => {
    const casos: [string, string][] = [
        ['Teodoro \nCuritiba-pr ', 'Teodoro'],                                  // nome + cidade na linha de baixo
        ['Ladislau ', 'Ladislau'],                                              // só o nome, com espaço no fim
        ['Oiee \nSou sobrinha do Rodrigo \nMe chamo Joana \nEle indicou pra ver com vcs ', 'Joana'], // frase no meio
        ['Bom dia \nGraziela ', 'Graziela'],                                    // saudação numa linha, nome na outra
        ['Gostaria de financiar um carrinho \nCleber Augusto dos Reis ', 'Cleber Augusto dos Reis'], // pedido + nome
        ['Domingos Faustino ', 'Domingos Faustino'],                            // nome e sobrenome
        ['Leandro \nEle tá disponível ainda ? ', 'Leandro'],                    // nome + pergunta sobre o carro
        ['marcos dias pereira ', 'Marcos Dias Pereira'],                        // tudo minúsculo
        ['Prof. Ananias de Souza Neto. \nEstá claro na carta de habilitação,  certo. ', 'Ananias de Souza Neto'], // título + ponto
        ['Mauro  kempner ', 'Mauro Kempner'],                                   // espaço duplo
        ['Celina \nOnde fica a loja de vcs ', 'Celina'],                        // nome + pergunta de endereço
        ['Boa tarde \nRosana \nQual cidade  a de vcs? ', 'Rosana'],             // saudação + nome + pergunta
        ['Boa tarde meu nome é priscila ', 'Priscila'],                         // "meu nome é"
        ['Me chamo Tadeu ', 'Tadeu'],                                           // "me chamo"
        ['Opa Jonas', 'Jonas'],                                                 // saudação colada no nome
        ['maicon DE oliveira', 'Maicon de Oliveira'],                           // "de" em minúsculo
        ['Júnior ', 'Júnior'],                                                  // acento
        ['Me chamo Gilmar\nEstou entrando em contato para apresentar meu trabalho', 'Gilmar'], // frase + assunto
    ];
    for (const [texto, esperado] of casos) {
        assert.equal(extrairNome(texto, PEDIDO)?.nome, esperado, texto);
    }
});

test('nome: "sim", "bom dia", pergunta, nome de carro e frase com verbo são recusados', () => {
    for (const t of ['Sim', 'Bom dia ', 'Bom dia 😁 ', 'Opa ', 'Tem o Onix?', 'Onix', 'Compass', 'Quero saber do carro', 'quem eu falo? ',
        'Você tem alguma coisa de Honda Civic ou city aí? ', '100.000km', 'Qual preço e valor das prestaçaes ', 'Olá! Posso ter mais informações sobre isso?']) {
        assert.equal(extrairNome(t, PEDIDO), null, t);
    }
    assert.equal(validarNome('Jose da Silva Pereira dos Santos Junior Filho'), null); // mais de 5 palavras
    assert.equal(validarNome('Carlos 123'), null);
});

test('nome: frases "meu nome é", "me chamo", "sou o", "aqui é", "pode me chamar de" funcionam sem pedido da loja', () => {
    assert.equal(extrairNome('meu nome é carlos souza', null)?.nome, 'Carlos Souza');
    assert.equal(extrairNome('sou o Carlos, de Ibirama', null)?.nome, 'Carlos');
    assert.equal(extrairNome('oi, é a Marta 😊', null)?.nome, 'Marta');
    assert.equal(extrairNome('aqui é o Fulano da Silva', null)?.nome, 'Fulano da Silva');
    assert.equal(extrairNome('pode me chamar de Zé', null)?.nome, 'Zé');
    // resposta curta SEM a loja ter pedido o nome: não adivinha
    assert.equal(extrairNome('Carlos', 'Temos sim o Onix!'), null);
    assert.equal(extrairNome('é a mesma coisa', null), null);
    assert.equal(extrairNome('sou do interior', null), null);
    assert.equal(pediuNome('Com quem eu falo?'), true);
    assert.equal(pediuNome('Antes de continuar, me conta seu nome! 😊'), true);
    assert.equal(pediuNome('Temos o Onix 2018'), false);
});

test('nome do perfil do WhatsApp: provisório, só se for nome de pessoa', () => {
    assert.equal(nomeDoPerfilAceito('Papai ❤️'), 'Papai');
    assert.equal(nomeDoPerfilAceito('Maria Clara'), 'Maria Clara');
    for (const ruim of ['😎😎', 'Auto Peças Silva', '5547999', 'Onix Turbo', '', null]) assert.equal(nomeDoPerfilAceito(ruim as string | null), null);
    assert.equal(capitalizarNome('maicon DE oliveira'), 'Maicon de Oliveira');
});

test('nome genérico: Lead WhatsApp, Lead W., Analisar Perfil, telefone', () => {
    for (const g of ['Lead WhatsApp', 'Lead W.', 'Analisar Perfil', 'Lead Google - Não especificado', '47 98888-0001', '', null]) assert.equal(nomeGenerico(g as string | null), true, String(g));
    assert.equal(nomeGenerico('Marcos Pereira'), false);
});

test('prioridade: manual nunca é sobrescrito; perfil → cliente disse troca; cliente se corrige; origem mais fraca não troca', () => {
    const p = (atual: string | null, origemAtual: Parameters<typeof podeTrocarNome>[0]['origemAtual'], novo: string, origemNova: Parameters<typeof podeTrocarNome>[0]['origemNova']) =>
        podeTrocarNome({ atual, origemAtual, novo, origemNova }).troca;
    assert.equal(p('Carlos Eduardo', 'manual', 'Carlos', 'cliente_disse'), false);
    assert.equal(p('Lead WhatsApp', 'generico', 'Carlos', 'cliente_disse'), true);
    assert.equal(p('Papai', 'perfil_whatsapp', 'Carlos', 'cliente_disse'), true);   // "Papai" → "sou o Carlos"
    assert.equal(p('Carlos', 'cliente_disse', 'Carlos Alberto', 'cliente_disse'), true); // o cliente se corrige
    assert.equal(p('Carlos Alberto', 'cliente_disse', 'Carlos', 'cliente_disse'), false); // não troca por nome mais curto
    assert.equal(p('Carlos', 'cliente_disse', 'Papai', 'perfil_whatsapp'), false);   // origem mais fraca
    assert.equal(p('Lead WhatsApp', 'generico', 'Papai', 'perfil_whatsapp'), true);
    assert.equal(p('Maria', 'formulario', 'Maria', 'cliente_disse'), false);         // mesmo nome
});

// ---------------------------------------------------------------------------
// Carro
// ---------------------------------------------------------------------------

const ESTOQUE: AltimusVehicle[] = [
    { id_externo: '4422425', marca: 'Chevrolet', modelo: 'Onix', versao: 'HATCH PREM. PII 1.0 12V TB Flex 5p Aut.', ano: 2025, preco: 88900, cor: 'Prata' },
    { id_externo: '4421111', marca: 'Chevrolet', modelo: 'Onix', versao: 'HATCH LTZ 1.4 8V FlexPower 5p Aut.', ano: 2018, preco: 72900, cor: 'Prata' },
    { id_externo: '4500001', marca: 'Jeep', modelo: 'Compass', versao: 'LIMITED 2.0 4x2 Flex 16V Aut.', ano: 2019, preco: 104900, cor: 'Prata' },
    { id_externo: '4500002', marca: 'BYD', modelo: 'Dolphin', versao: 'EV GS Elétrico', ano: 2026, anoFabricacao: 2025, preco: 150000, cor: 'Cinza' },
    { id_externo: '4500003', marca: 'Volkswagen', modelo: 'T-Cross', versao: 'Highline 1.4 TSI', ano: 2021, preco: 108900, cor: 'Branco' },
];

test('carro: "Analisar Perfil" e genéricos contam como vazio', () => {
    for (const v of ['Analisar Perfil', 'Analisar Perfil - menor preço', 'Lead Google - Não especificado', 'Não especificado', '', null]) assert.equal(interesseVazio(v as string | null), true, String(v));
    assert.equal(interesseVazio('Onix 2018 até 60 mil'), false);
});

test('carro: o link do site resolve o carro certo (por id e por slug)', () => {
    assert.equal(carroDoLinkDoSite('Olá! https://manosveiculos.com.br/veiculo/4500001', ESTOQUE)?.codigoFeed, '4500001');
    const slug = carroDoLinkDoSite('quero esse: https://manosveiculos.com.br/veiculos/byd-dolphin-ev-gs-eletrico-cinza-2026-2027/', ESTOQUE);
    assert.equal(slug?.codigoFeed, '4500002');
    assert.equal(slug?.origem, 'link_site');
    assert.equal(carroDoLinkDoSite('https://manosveiculos.com.br/veiculo/9999999', ESTOQUE), null);
    assert.equal(carroDoLinkDoSite('oi', ESTOQUE), null);
});

test('carro: modelo e ano citados casam com o feed; sem ano só se for único; T-Cross com hífen', () => {
    assert.equal(carrosCitados('tem o onix 2018?', ESTOQUE)[0]?.codigoFeed, '4421111');
    assert.equal(carrosCitados('gostei do compass', ESTOQUE)[0]?.codigoFeed, '4500001'); // único no estoque
    assert.deepEqual(carrosCitados('tem onix?', ESTOQUE), []);                          // dois Onix: não adivinha
    assert.equal(carrosCitados('tem t-cross?', ESTOQUE)[0]?.codigoFeed, '4500003');
});

test('carro: fora do estoque entra como em_estoque = false', () => {
    const c = carrosCitados('procuro um corolla 2015', ESTOQUE)[0];
    assert.equal(c.emEstoque, false);
    assert.equal(c.codigoFeed, null);
    assert.match(c.descricao, /Corolla 2015/);
});

test('carro: o carro de TROCA não vira interesse', () => {
    assert.deepEqual(carrosCitados('tenho um gol 2012 pra dar na troca', ESTOQUE), []);
    assert.deepEqual(carrosCitados('meu carro é um HB20 2016', ESTOQUE), []);
    assert.deepEqual(carrosCitados('vendo meu palio 2010', ESTOQUE), []);
    // o carro depois da troca é o de interesse
    assert.equal(carrosCitados('quero trocar meu gol 2012 no onix 2018', ESTOQUE)[0]?.codigoFeed, '4421111');
    assert.equal(carrosCitados('minha strada 2015 entra na troca do compass?', ESTOQUE)[0]?.codigoFeed, '4500001');
});

test('carro: anúncio de origem (utm) identifica o carro', () => {
    assert.equal(carroDoAnuncio({ headline: 'Jeep Compass Limited 2019 completíssimo' }, ESTOQUE)?.codigoFeed, '4500001');
    assert.equal(carroDoAnuncio({ ctwa_clid: 'x' }, ESTOQUE), null);
});

test('interesse na tela: substitui o genérico, acrescenta sem repetir, até 3, mais recente primeiro, nunca apaga o do consultor', () => {
    const t = (n: number) => `2026-11-1${n}T10:00:00Z`;
    assert.equal(comporInteresse([{ descricao: 'Onix 2018', origem: 'cliente_citou', quando: t(1) }]), 'Onix 2018');
    assert.equal(comporInteresse([
        { descricao: 'Onix 2018', origem: 'cliente_citou', quando: t(1) },
        { descricao: 'Compass 2019', origem: 'laura_estoque', quando: t(2) },
    ]), 'Compass 2019 · Onix 2018');
    // o que o consultor digitou fica e ocupa uma das 3 vagas
    assert.equal(comporInteresse([
        { descricao: 'Hilux até 200 mil', origem: 'anterior', quando: t(0) },
        { descricao: 'A', origem: 'cliente_citou', quando: t(1) }, { descricao: 'B', origem: 'cliente_citou', quando: t(2) }, { descricao: 'C', origem: 'cliente_citou', quando: t(3) },
    ]), 'C · B · Hilux até 200 mil');
    assert.equal(comporInteresse([{ descricao: 'X', origem: 'cliente_citou', quando: t(1), oculto: true }]), '');
    assert.equal(mesmoCarro('Onix 2018', 'Chevrolet Onix HATCH LTZ 1.4 8V FlexPower 5p Aut. 2018'), true);
    assert.equal(mesmoCarro('Onix 2018', 'Chevrolet Onix HATCH PREM. PII 2025'), false);
});
