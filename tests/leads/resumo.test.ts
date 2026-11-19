import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faltaPerguntar, fichaEmLinhas, mensagensRecentes, situacaoDoBanco, uidDoIdDaLista, type MsgBanco } from '@/lib/leads/resumo';

test('situação: aceita objeto e texto JSON; "nada" some; código desconhecido é ignorado', () => {
    const base = { situacao: 'cliente_pediu_tempo', resumo: 'Vai passar depois do 13º', proximaAcao: 'Retomar em dezembro', confianca: 'media' };
    const a = situacaoDoBanco(base)!;
    assert.equal(a.rotulo, 'Cliente pediu um tempo');
    assert.equal(a.proximaAcao, 'Retomar em dezembro');
    assert.equal(situacaoDoBanco(JSON.stringify(base))!.resumo, 'Vai passar depois do 13º');
    assert.equal(situacaoDoBanco({ ...base, proximaAcao: 'nada' })!.proximaAcao, null);
    assert.equal(situacaoDoBanco({ situacao: 'inventada' }), null);
    assert.equal(situacaoDoBanco(null), null);
    assert.equal(situacaoDoBanco('texto solto'), null);
});

test('ficha em linhas e o que falta perguntar', () => {
    const f = { carro_interesse: 'Haval H6 GT 2024', forma_pagamento: 'troca' as const, tem_troca: true, troca: { marca: 'BYD', modelo: 'Song Plus', ano: '2025' } };
    assert.deepEqual(fichaEmLinhas(f), [
        { rotulo: 'Quer', valor: 'Haval H6 GT 2024' },
        { rotulo: 'Pagamento', valor: 'Troca' },
        { rotulo: 'Troca', valor: 'BYD · Song Plus · 2025' },
    ]);
    assert.deepEqual(faltaPerguntar(f), ['nome', 'entrada', 'prazo', 'cidade']);
    assert.deepEqual(fichaEmLinhas(null), []);
});

test('mensagens: ordem de leitura, últimas N, sem sistema', () => {
    const m = (autor: string, texto: string, criada_em: string, tipo = 'texto'): MsgBanco => ({ autor, tipo, texto, legenda: null, transcricao: null, midia_nome: null, apagada_em: null, criada_em });
    const r = mensagensRecentes([
        m('cliente', 'c', '2026-11-19T10:03:00Z'), m('sistema', 'aviso', '2026-11-19T10:02:30Z'),
        m('laura', 'b', '2026-11-19T10:02:00Z'), m('cliente', 'a', '2026-11-19T10:01:00Z'),
        m('cliente', 'foto', '2026-11-19T10:00:00Z', 'imagem'),
    ], 3);
    assert.deepEqual(r.map(x => x.texto), ['a', 'b', 'c']);
    assert.equal(mensagensRecentes([m('cliente', 'x', '2026-11-19T10:00:00Z', 'imagem')])[0].texto, '[foto]');
});

test('id da lista vira uid da view', () => {
    assert.equal(uidDoIdDaLista('crm26_4232'), 'leads_distribuicao_crm_26:4232');
    assert.equal(uidDoIdDaLista('main_abc-1'), 'leads_manos_crm:abc-1');
    assert.equal(uidDoIdDaLista('master_9'), 'leads_master:9');
    assert.equal(uidDoIdDaLista('leadsfacebook%3Aabc'), 'leadsfacebook:abc');
    assert.equal(uidDoIdDaLista('1234'), null);
    assert.equal(uidDoIdDaLista(''), null);
});
