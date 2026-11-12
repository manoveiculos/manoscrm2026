// Triagem da Laura nos leads de anúncio (decisões puras). Rodar: npm run test:triagem
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    dentroDaJanelaLaura, decidirTriagem, instrucaoPrimeiroContato, interesseUtil, resumoParaConsultor, type EntradaTriagem,
} from '@/lib/whatsapp/ia/triagem';
import { ancoraDoSilencio, decidirFollowup } from '@/lib/whatsapp/ia/followup';

// quarta 12/11/2026 às 14:00 em Brasília = 17:00 UTC
const AGORA = new Date('2026-11-12T17:00:00Z');
const min = (n: number) => new Date(AGORA.getTime() - n * 60_000).toISOString();
const base = (extra: Partial<EntradaTriagem> = {}): EntradaTriagem => ({
    criadoEm: min(2), contatoEm: null, ultimaDoClienteEm: null, lauraRespondeuDepois: false,
    telefoneValido: true, chaveLigada: true, lauraPodeEnviar: true, agora: AGORA, ...extra,
});

test('janela da Laura: 8h às 21h de Brasília, domingo não', () => {
    assert.equal(dentroDaJanelaLaura(new Date('2026-11-12T11:00:00Z')), true);   // 08:00
    assert.equal(dentroDaJanelaLaura(new Date('2026-11-12T10:59:00Z')), false);  // 07:59
    assert.equal(dentroDaJanelaLaura(new Date('2026-11-13T00:00:00Z')), false);  // 21:00
    assert.equal(dentroDaJanelaLaura(new Date('2026-11-13T23:59:00Z')), true);   // sexta 20:59
    assert.equal(dentroDaJanelaLaura(new Date('2026-11-15T17:00:00Z')), false);  // domingo 14:00
});

test('lead novo na janela: a Laura contata', () => {
    assert.deepEqual(decidirTriagem(base()), { acao: 'contatar' });
});

test('qualquer falha LIBERA o lead (nunca fica preso)', () => {
    assert.deepEqual(decidirTriagem(base({ telefoneValido: false })), { acao: 'liberar', motivo: 'telefone_invalido' });
    assert.deepEqual(decidirTriagem(base({ lauraPodeEnviar: false })), { acao: 'liberar', motivo: 'laura_indisponivel' });
    assert.deepEqual(decidirTriagem(base({ chaveLigada: false })), { acao: 'liberar', motivo: 'chave_desligada' });
    // a Laura não conseguiu mandar a 1ª mensagem em 20 min dentro da janela
    assert.deepEqual(decidirTriagem(base({ criadoEm: min(21) })), { acao: 'liberar', motivo: 'laura_nao_conseguiu' });
    assert.deepEqual(decidirTriagem(base({ criadoEm: min(19) })), { acao: 'contatar' });
});

test('lead da noite espera as 8h; da madrugada demais é liberado', () => {
    const noite = new Date('2026-11-13T01:30:00Z'); // 22:30 BR
    assert.deepEqual(decidirTriagem(base({ agora: noite, criadoEm: new Date('2026-11-13T01:00:00Z').toISOString() })), { acao: 'esperar', motivo: 'fora da janela da Laura (8h às 21h)' });
    // chegou 22:00 e já são 8:05 do dia seguinte: o relógio de 20 min conta a partir das 8h
    const manha = new Date('2026-11-13T11:05:00Z');
    assert.deepEqual(decidirTriagem(base({ agora: manha, criadoEm: new Date('2026-11-13T01:00:00Z').toISOString() })), { acao: 'contatar' });
    // lead que ficou mais de 16 h sem contato fora da janela
    const domingo = new Date('2026-11-15T17:00:00Z');
    assert.deepEqual(decidirTriagem(base({ agora: domingo, criadoEm: new Date('2026-11-14T20:00:00Z').toISOString() })), { acao: 'liberar', motivo: 'fora_do_horario_longo' });
});

test('já contatado: espera o lead; libera se ele respondeu e a conversa não fechou', () => {
    assert.deepEqual(decidirTriagem(base({ contatoEm: min(60) })), { acao: 'esperar', motivo: 'aguardando resposta do lead' });
    assert.deepEqual(decidirTriagem(base({ contatoEm: min(120), ultimaDoClienteEm: min(30) })), { acao: 'esperar', motivo: 'conversa em andamento' });
    assert.deepEqual(decidirTriagem(base({ contatoEm: min(600), ultimaDoClienteEm: min(5 * 60), lauraRespondeuDepois: false })), { acao: 'liberar', motivo: 'sem_conclusao' });
    // a Laura respondeu e o cliente sumiu há 5 h: ainda dentro do prazo de 16 h, segue com a Laura
    assert.deepEqual(decidirTriagem(base({ contatoEm: min(600), ultimaDoClienteEm: min(5 * 60), lauraRespondeuDepois: true })).acao, 'esperar');
    assert.deepEqual(decidirTriagem(base({ contatoEm: min(2000), ultimaDoClienteEm: min(17 * 60), lauraRespondeuDepois: true })), { acao: 'liberar', motivo: 'sem_conclusao' });
});

test('lead que nunca respondeu, nem aos follow-ups, vai ao consultor depois de 11 dias', () => {
    assert.deepEqual(decidirTriagem(base({ contatoEm: min(10 * 24 * 60) })).acao, 'esperar');
    assert.deepEqual(decidirTriagem(base({ contatoEm: min(11 * 24 * 60) })), { acao: 'liberar', motivo: 'sem_resposta' });
});

test('primeiro contato: usa o carro do formulário, não inventa nome nem preço', () => {
    const i = instrucaoPrimeiroContato({ nome: 'Maria Souza', interesse: 'Onix 2019', cidade: 'Rio do Sul' });
    assert.match(i, /ainda NÃO escreveu/);
    assert.match(i, /Nome informado no formulário: Maria/);
    assert.doesNotMatch(i, /Souza/);
    assert.match(i, /Carro que ele viu: Onix 2019/);
    const vazio = instrucaoPrimeiroContato({ nome: null, interesse: null, cidade: null });
    assert.match(vazio, /não inventes? nome|não invente nome/);
    assert.match(vazio, /pergunte qual carro/);
    assert.equal(interesseUtil('Não informado'), null);
    assert.equal(interesseUtil('  Compass   2019 '), 'Compass 2019');
    assert.equal(interesseUtil(null), null);
});

test('resumo para o consultor: curto, com motivo, sem telefone', () => {
    const r = resumoParaConsultor({ motivo: 'qualificado', quando: AGORA, nome: 'Maria Souza', interesse: 'Onix 2019', resumoDaLaura: 'Quer financiar, entrada de 20 mil, sem troca.', contatado: true, respondeu: true });
    assert.match(r, /^RESUMO DA LAURA \(atendimento inicial, 12\/11 14:00\)/);
    assert.match(r, /Cliente: Maria\n/);
    assert.match(r, /O que ela apurou: Quer financiar/);
    assert.match(r, /Passou para você porque: a Laura qualificou o lead\./);
    assert.doesNotMatch(r, /Souza|\d{8,}/);
    assert.match(resumoParaConsultor({ motivo: 'laura_nao_conseguiu', quando: AGORA, nome: null, interesse: null, resumoDaLaura: null, contatado: false, respondeu: false }), /não chegou a falar com o cliente/);
});

test('follow-up: lead que a Laura chamou e nunca respondeu também recebe toque', () => {
    const msgs = [{ autor: 'laura', texto: 'Oi!', criadaEm: '2026-11-12T15:00:00Z' }];
    assert.equal(ancoraDoSilencio(msgs), null);                                  // sem a marca, não conta
    assert.equal(ancoraDoSilencio(msgs, true), '2026-11-12T15:00:00Z');
    const e = { status: 'ia', iaSilenciadaAte: null, msgs, enviadosDepoisDaAncora: [], leadFechado: false, temVisitaMarcada: false, lojaAberta: true, agora: new Date('2026-11-13T16:00:00Z'), corte: '2026-11-12T03:00:00.000Z' };
    assert.deepEqual(decidirFollowup({ ...e, iniciadaPelaLoja: true }), { acao: 'enviar', etapa: 1 });
    assert.equal(decidirFollowup(e).acao, 'pular');
});
