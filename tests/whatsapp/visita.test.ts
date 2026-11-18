// Visita da Laura → Agenda. Rodar: npm run test:visita
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDeVisita, decidirVisita, montarLinhaVisita, quandoPorExtenso, telefoneComDdi } from '@/lib/whatsapp/ia/visita';

const AGORA = new Date('2026-11-18T12:00:00Z');                       // 09h em Brasília
const conv = { lead_uid: 'leads_distribuicao_crm_26:4208', telefone_key: '47989231747', nome_cliente: 'Fabricio', nome_contato: '™' };

test('caso real: a linha leva tipo "loja" (a coluna obrigatória que faltava) e os campos da Agenda', () => {
    const l = montarLinhaVisita({ iso: '2026-11-20T13:00:00.000Z', conversa: conv, carroInteresse: 'Ford Fusion 2.5 flex aut branca 2014', vendedorAuthId: 'auth-victor' });
    assert.equal(l.tipo, 'loja');
    assert.equal(l.status, 'agendado');
    assert.equal(l.vendedor_id, 'auth-victor');
    assert.equal(l.cliente_nome, 'Fabricio');
    assert.equal(l.cliente_whatsapp, '5547989231747');
    assert.equal(l.cliente_telefone, '5547989231747');
    assert.equal(l.lead_uid, 'leads_distribuicao_crm_26:4208');
    assert.equal(l.data_hora, '2026-11-20T13:00:00.000Z');
    assert.match(l.observacoes, /Laura/);
});

test('nome: ficha > nome do cliente > perfil do WhatsApp > genérico', () => {
    const base = { iso: '2026-11-20T13:00:00.000Z', vendedorAuthId: 'a' };
    assert.equal(montarLinhaVisita({ ...base, conversa: conv, nomeNaFicha: 'Fabrício Souza' }).cliente_nome, 'Fabrício Souza');
    assert.equal(montarLinhaVisita({ ...base, conversa: { ...conv, nome_cliente: null } }).cliente_nome, '™');
    assert.equal(montarLinhaVisita({ ...base, conversa: { ...conv, nome_cliente: null, nome_contato: null } }).cliente_nome, 'Cliente do WhatsApp');
});

test('sem consultor: fica com a gerência e a observação pede para assumir', () => {
    const l = montarLinhaVisita({ iso: '2026-11-20T13:00:00.000Z', conversa: conv, vendedorAuthId: 'auth-adm', semConsultor: true });
    assert.match(l.observacoes, /assuma/i);
});

test('telefone com 55, sem duplicar e sem lixo', () => {
    assert.equal(telefoneComDdi('47997676966'), '5547997676966');
    assert.equal(telefoneComDdi('5547997676966'), '5547997676966');
    assert.equal(telefoneComDdi('(47) 99767-6966'), '5547997676966');
    assert.equal(telefoneComDdi(''), null);
    assert.equal(telefoneComDdi(null), null);
});

test('decisão: sem visita ativa cria; mesma hora mantém; outra hora move a mesma linha (nunca duplica)', () => {
    const iso = '2026-11-20T13:00:00.000Z';
    assert.deepEqual(decidirVisita([], iso, AGORA), { acao: 'criar' });
    assert.deepEqual(decidirVisita([{ id: 'v1', data_hora: iso, status: 'agendado' }], iso, AGORA), { acao: 'manter', id: 'v1' });
    assert.deepEqual(decidirVisita([{ id: 'v1', data_hora: '2026-11-19T13:00:00.000Z', status: 'confirmado' }], iso, AGORA), { acao: 'mover', id: 'v1', de: '2026-11-19T13:00:00.000Z' });
});

test('decisão: visita cancelada, passada ou concluída não conta como ativa', () => {
    const iso = '2026-11-20T13:00:00.000Z';
    const ex = [
        { id: 'a', data_hora: '2026-11-19T13:00:00.000Z', status: 'cancelado' },
        { id: 'b', data_hora: '2026-11-17T13:00:00.000Z', status: 'agendado' },       // já passou
        { id: 'c', data_hora: '2026-11-19T13:00:00.000Z', status: 'compareceu' },
        { id: 'd', data_hora: '2026-11-19T15:00:00.000Z', status: 'nao_compareceu' },
    ];
    assert.deepEqual(decidirVisita(ex, iso, AGORA), { acao: 'criar' });
});

test('decisão: duas ativas movem a mais próxima', () => {
    const r = decidirVisita([
        { id: 'longe', data_hora: '2026-11-25T13:00:00.000Z', status: 'agendado' },
        { id: 'perto', data_hora: '2026-11-19T13:00:00.000Z', status: 'agendado' },
    ], '2026-11-20T13:00:00.000Z', AGORA);
    assert.deepEqual(r, { acao: 'mover', id: 'perto', de: '2026-11-19T13:00:00.000Z' });
});

test('quando por extenso (horário de Brasília)', () => {
    assert.equal(quandoPorExtenso('2026-11-18T17:00:00.000Z', AGORA), 'hoje às 14h');
    assert.equal(quandoPorExtenso('2026-11-19T13:00:00.000Z', AGORA), 'amanhã às 10h');
    assert.equal(quandoPorExtenso('2026-11-18T18:30:00.000Z', AGORA), 'hoje às 15h30');
    assert.match(quandoPorExtenso('2026-11-20T13:00:00.000Z', AGORA), /20\/11 às 10h$/);
});

test('aviso ao consultor: criação e remarcação, sem telefone do cliente', () => {
    const c = avisoDeVisita({ acao: 'criar', quando: 'hoje às 14h', cliente: 'Cleverson', carro: 'Fox vermelho 2010' });
    assert.equal(c.titulo, 'Visita marcada: hoje às 14h');
    assert.match(c.corpo, /Cleverson · Fox vermelho 2010/);
    assert.match(c.corpo, /Agenda/);
    const m = avisoDeVisita({ acao: 'mover', quando: 'sex, 20/11 às 10h', quandoAntes: 'hoje às 14h', cliente: 'Dion' });
    assert.match(m.titulo, /remarcada/);
    assert.match(m.corpo, /Era hoje às 14h/);
    assert.doesNotMatch(c.corpo + m.corpo, /\d{8,}/);
    assert.match(avisoDeVisita({ acao: 'criar', quando: 'x', cliente: 'Y', semConsultor: true }).corpo, /assuma/i);
});
