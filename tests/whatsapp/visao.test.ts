// Visão da Laura (fotos do cliente) e filtros de entrada. Rodar: npm run test:visao
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descricaoDoExtra, descricaoParaIa, lerDescricao, mimeSuportado, FOTO_SEM_DESCRICAO } from '@/lib/whatsapp/ia/visao';
import { ehRespostaAutomatica, textoParaIa, montarHistorico } from '@/lib/whatsapp/ia/regras';

test('lê o JSON do Claude mesmo com cerca ```json e texto em volta', () => {
    const d = lerDescricao('Claro:\n```json\n{"tipo":"carro","marca":"Chevrolet","modelo":"Onix","ano":"2018","cor":"prata","confianca":"media","resumo":"Hatch prata de frente","texto_visivel":null}\n```');
    assert.equal(d?.modelo, 'Onix');
    assert.equal(d?.confianca, 'media');
});

test('resposta sem JSON ou sem resumo é descartada', () => {
    assert.equal(lerDescricao('não consegui'), null);
    assert.equal(lerDescricao('{"tipo":"carro"}'), null);
    assert.equal(lerDescricao('{quebrado'), null);
});

test('foto de carro com confiança média/baixa vira "parece ser", nunca certeza', () => {
    const media = lerDescricao('{"tipo":"carro","marca":"Fiat","modelo":"Uno","ano":"2012","cor":"branco","confianca":"media","resumo":"Uno branco de lado"}')!;
    assert.match(descricaoParaIa(media), /parece ser Fiat Uno 2012 branco/);
    const baixa = lerDescricao('{"tipo":"carro","marca":null,"modelo":null,"ano":null,"cor":null,"confianca":"baixa","resumo":"Carro escuro de longe"}')!;
    assert.match(descricaoParaIa(baixa), /identificação incerta/);
    const alta = lerDescricao('{"tipo":"carro","marca":"Honda","modelo":"Civic","ano":"2014","cor":"cinza","confianca":"alta","resumo":"Civic cinza"}')!;
    assert.doesNotMatch(descricaoParaIa(alta), /parece ser/);
});

test('documento: nunca leva dado pessoal nem texto da imagem para o histórico', () => {
    const d = lerDescricao('{"tipo":"documento","marca":"X","modelo":"Y","ano":"2020","cor":"azul","confianca":"alta","resumo":"CNH de João da Silva CPF 123.456.789-00","texto_visivel":"CPF 123.456.789-00"}')!;
    assert.equal(d.marca, null);
    assert.equal(d.texto_visivel, null);
    assert.match(descricaoParaIa(d), /não leia nem peça dados/i);
    assert.doesNotMatch(descricaoParaIa(d), /João|123/);
});

test('print de anúncio carrega o texto do anúncio', () => {
    const d = lerDescricao('{"tipo":"print_anuncio","marca":"Volkswagen","modelo":"Polo","ano":"2019","cor":null,"confianca":"alta","resumo":"Anúncio de Polo","texto_visivel":"Polo Highline 2019 R$ 85.900"}')!;
    const t = descricaoParaIa(d);
    assert.match(t, /print de anúncio/);
    assert.match(t, /Polo Highline 2019 R\$ 85.900/);
});

test('descricaoDoExtra: com visão, sem visão e depois de 2 falhas', () => {
    assert.equal(descricaoDoExtra(null), null);
    assert.equal(descricaoDoExtra({ visao_tentativas: 1 }), null);                    // ainda vai tentar de novo
    assert.equal(descricaoDoExtra({ visao_tentativas: 2 }), FOTO_SEM_DESCRICAO);
    const t = descricaoDoExtra({ visao: { tipo: 'outro', confianca: 'baixa', resumo: 'Tela de celular' } });
    assert.match(t || '', /Tela de celular/);
});

test('histórico mostra a descrição da foto do cliente; foto da loja continua "[foto]"', () => {
    const base = { texto: null, legenda: null, transcricao: null, midiaNome: null, apagadaEm: null };
    assert.equal(textoParaIa({ ...base, autor: 'cliente', tipo: 'imagem', criadaEm: '1', descricaoImagem: '(parece ser Fiat Uno 2012)' }), '[foto] (parece ser Fiat Uno 2012)');
    assert.equal(textoParaIa({ ...base, autor: 'laura', tipo: 'imagem', criadaEm: '1' }), '[foto]');
    const h = montarHistorico([{ ...base, autor: 'cliente', tipo: 'imagem', legenda: 'esse é o meu', criadaEm: '2026-11-18T10:00:00Z', descricaoImagem: '(Uno branco)' }]);
    assert.equal(h[0].content, '[foto] (Uno branco) esse é o meu');
});

test('mensagem que o Evolution não abriu: a Laura vê um aviso, não o texto técnico', () => {
    const m = { autor: 'cliente' as const, tipo: 'texto', texto: '[mensagem do tipo secretEncryptedMessage]', legenda: null, transcricao: null, midiaNome: null, apagadaEm: null, criadaEm: '1' };
    assert.equal(textoParaIa(m), '[mensagem que não consegui abrir]');
    assert.equal(textoParaIa({ ...m, texto: 'Olá [teste]' }), 'Olá [teste]');
});

test('resposta automática de empresa não é respondida', () => {
    assert.ok(ehRespostaAutomatica('Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.'));
    assert.ok(ehRespostaAutomatica('Esta é uma mensagem automática. Retornaremos em breve.'));
    assert.ok(ehRespostaAutomatica('Estamos fora do horário de atendimento, retornaremos amanhã.'));
    for (const t of ['Bom dia, tem Onix?', 'Não estou disponível hoje, passo na loja amanhã', 'Obrigado pela mensagem', '']) {
        assert.equal(ehRespostaAutomatica(t), false, t);
    }
});

test('só imagens que o Claude aceita', () => {
    assert.equal(mimeSuportado('image/jpeg'), 'image/jpeg');
    assert.equal(mimeSuportado('image/jpg; x=1'), 'image/jpeg');
    assert.equal(mimeSuportado('image/heic'), null);
    assert.equal(mimeSuportado(null), null);
});
