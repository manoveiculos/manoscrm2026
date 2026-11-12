// Cobrança do consultor quando o cliente espera. Rodar: npm run test:cobranca
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirCobranca, esperaDesde, textoDaCobranca, type EntradaCobranca, type MsgCobranca } from '@/lib/avisos/cobranca';

const T0 = Date.parse('2026-11-12T14:00:00Z');
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString();
const m = (autor: string, min: number): MsgCobranca => ({ autor, criadaEm: iso(min) });
const base = (extra: Partial<EntradaCobranca>): EntradaCobranca => ({
    status: 'ia', temConsultor: true, msgs: [], passagemEm: null, niveisJaEnviados: [], lojaAberta: true, agora: new Date(T0 + 60 * 60_000), ...extra,
});

test('espera: Laura passou o cliente e nenhum humano escreveu', () => {
    assert.equal(esperaDesde([m('cliente', 0), m('laura', 1)], iso(1), 'ia'), iso(1));
    // consultor respondeu depois da passagem: ninguém esperando
    assert.equal(esperaDesde([m('cliente', 0), m('laura', 1), m('vendedor', 5)], iso(1), 'humano'), null);
    // consultor respondeu ANTES da passagem: continua esperando
    assert.equal(esperaDesde([m('vendedor', 0), m('cliente', 2), m('laura', 3)], iso(3), 'ia'), iso(3));
});

test('espera: conversa com o consultor e o cliente falou por último', () => {
    assert.equal(esperaDesde([m('vendedor', 0), m('cliente', 10), m('cliente', 12)], null, 'humano'), iso(10));
    assert.equal(esperaDesde([m('cliente', 10), m('vendedor', 12)], null, 'humano'), null);
    // com a Laura atendendo (status ia) e sem passagem, quem responde é a Laura: não cobra o consultor
    assert.equal(esperaDesde([m('cliente', 10)], null, 'ia'), null);
    assert.equal(esperaDesde([], null, 'humano'), null);
});

test('níveis: 10 min → consultor; 30 min → consultor e Alexandre; 120 min → Alexandre', () => {
    const msgs = [m('cliente', 0), m('laura', 1)];
    const em = (min: number) => base({ msgs, passagemEm: iso(1), agora: new Date(T0 + (1 + min) * 60_000) });
    assert.deepEqual(decidirCobranca(em(5)), { acao: 'pular', motivo: 'ainda dentro dos 10 minutos' });
    const n1 = decidirCobranca(em(10));
    assert.deepEqual(n1.acao === 'avisar' && [n1.nivel, n1.avisarConsultor, n1.avisarGestor], [1, true, false]);
    const n2 = decidirCobranca(em(35));
    assert.deepEqual(n2.acao === 'avisar' && [n2.nivel, n2.avisarConsultor, n2.avisarGestor], [2, true, true]);
    const n3 = decidirCobranca(em(130));
    assert.deepEqual(n3.acao === 'avisar' && [n3.nivel, n3.avisarConsultor, n3.avisarGestor], [3, false, true]);
});

test('cada nível sai uma vez por espera; depois do atraso, só o nível mais alto devido', () => {
    const msgs = [m('cliente', 0), m('laura', 1)];
    const e = (min: number, ja: number[]) => base({ msgs, passagemEm: iso(1), niveisJaEnviados: ja, agora: new Date(T0 + (1 + min) * 60_000) });
    assert.equal(decidirCobranca(e(12, [1])).acao, 'pular');
    const n2 = decidirCobranca(e(40, [1]));
    assert.equal(n2.acao === 'avisar' && n2.nivel, 2);
    assert.equal(decidirCobranca(e(40, [1, 2])).acao, 'pular');
    // abriu a loja com 3 h de espera e nada avisado: manda só o nível 3, não os três
    const n3 = decidirCobranca(e(180, []));
    assert.equal(n3.acao === 'avisar' && n3.nivel, 3);
});

test('travas: sem consultor, arquivada, fora do horário, espera antiga', () => {
    const msgs = [m('cliente', 0), m('laura', 1)];
    const pronto = base({ msgs, passagemEm: iso(1), agora: new Date(T0 + 30 * 60_000) });
    assert.equal(decidirCobranca(pronto).acao, 'avisar');
    assert.deepEqual(decidirCobranca({ ...pronto, temConsultor: false }), { acao: 'pular', motivo: 'sem consultor responsável' });
    assert.deepEqual(decidirCobranca({ ...pronto, status: 'encerrada' }), { acao: 'pular', motivo: 'conversa arquivada' });
    assert.deepEqual(decidirCobranca({ ...pronto, lojaAberta: false }), { acao: 'pular', motivo: 'fora do horário da loja' });
    assert.match((decidirCobranca({ ...pronto, agora: new Date(T0 + 30 * 3_600_000) }) as { motivo: string }).motivo, /antiga demais/);
    assert.deepEqual(decidirCobranca({ ...pronto, msgs: [m('cliente', 0), m('laura', 1), m('vendedor', 3)] }), { acao: 'pular', motivo: 'ninguém esperando' });
});

test('texto do aviso: nome e carro, sem telefone, com link; versão do gestor aponta o consultor', () => {
    const t = textoDaCobranca({ nivel: 1, minutos: 12, cliente: 'Maria Souza', carro: 'Onix 2019', consultor: 'Sérgio Silva', link: 'https://x.com.br/conversas?c=1', paraGestor: false });
    assert.match(t, /Cliente esperando há 12 min/);
    assert.match(t, /Maria \(Onix 2019\)/);
    assert.doesNotMatch(t, /Souza|\d{8,}/);
    assert.match(t, /A Laura passou para você/);
    assert.match(textoDaCobranca({ nivel: 2, minutos: 35, cliente: null, carro: null, consultor: 'Sérgio Silva', link: 'l', paraGestor: false }), /Você ainda não respondeu/);
    const g = textoDaCobranca({ nivel: 3, minutos: 150, cliente: 'Maria', carro: null, consultor: 'Sérgio Silva', link: 'l', paraGestor: true });
    assert.match(g, /Sérgio deixou cliente esperando 2 h/);
});
