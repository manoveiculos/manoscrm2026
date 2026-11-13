// Passagens do cliente pelo WhatsApp da loja. Rodar: npm run test:passagens
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPassagens, resumoDaPassagem, textoCurto, type MsgPassagem } from '@/lib/whatsapp/passagens';

const m = (autor: string, iso: string, texto: string | null = 'oi', extra: Partial<MsgPassagem> = {}): MsgPassagem => ({ autor, criadaEm: iso, texto, ...extra });

test('silêncio de mais de 12 h abre nova passagem; a mais recente vem primeiro', () => {
    const p = montarPassagens([
        m('cliente', '2026-11-01T12:00:00Z', 'Tem o Onix?'),
        m('laura', '2026-11-01T12:01:00Z', 'Tem sim'),
        m('cliente', '2026-11-01T12:30:00Z', 'Quanto?'),
        m('cliente', '2026-11-05T09:00:00Z', 'Voltei, ainda tem?'),
    ], new Date('2026-11-05T10:00:00Z'));
    assert.equal(p.length, 2);
    assert.equal(p[0].primeiraDoCliente, 'Voltei, ainda tem?');
    assert.equal(p[1].mensagensCliente, 2);
    assert.equal(p[1].quemAtendeu, 'laura');
});

test('quem atendeu: Laura, consultor, os dois ou ninguém', () => {
    const [a] = montarPassagens([m('cliente', '2026-11-01T12:00:00Z'), m('vendedor', '2026-11-01T12:05:00Z')]);
    assert.equal(a.quemAtendeu, 'vendedor');
    const [b] = montarPassagens([m('cliente', '2026-11-01T12:00:00Z'), m('laura', '2026-11-01T12:01:00Z'), m('vendedor', '2026-11-01T12:09:00Z')]);
    assert.equal(b.quemAtendeu, 'laura_e_vendedor');
    const [c] = montarPassagens([m('cliente', '2026-11-01T12:00:00Z')]);
    assert.equal(c.quemAtendeu, 'ninguem');
    assert.equal(resumoDaPassagem(c), 'Sem resposta da loja · 1 mensagem');
});

test('como terminou: cliente sem resposta × cliente que sumiu (com horas de silêncio só na última)', () => {
    const agora = new Date('2026-11-04T12:00:00Z');
    const p = montarPassagens([
        m('cliente', '2026-11-01T12:00:00Z', 'Oi'),
        m('laura', '2026-11-01T12:01:00Z', 'Olá!'),
        m('cliente', '2026-11-02T12:00:00Z', 'Alguém?'),
        m('laura', '2026-11-02T12:01:00Z', 'Sim!'),
    ], agora);
    assert.equal(p[0].fimTipo, 'loja_sem_resposta');
    assert.equal(p[0].horasSemResposta, 48);
    assert.equal(p[1].fimTipo, 'loja_sem_resposta');
    assert.equal(p[1].horasSemResposta, null);
    const [d] = montarPassagens([m('cliente', '2026-11-04T11:00:00Z', 'Oi')], agora);
    assert.equal(d.fimTipo, 'cliente_sem_resposta');
    assert.equal(d.horasSemResposta, null);
});

test('áudio usa a transcrição, mídia vira rótulo, texto longo é cortado, apagadas são ignoradas', () => {
    assert.equal(textoCurto({ autor: 'cliente', criadaEm: 'x', tipo: 'audio', transcricao: 'qual é o endereço?' }), 'qual é o endereço?');
    assert.equal(textoCurto({ autor: 'cliente', criadaEm: 'x', tipo: 'imagem' }), '📷 foto');
    assert.ok((textoCurto({ autor: 'cliente', criadaEm: 'x', texto: 'a'.repeat(300) }) || '').length <= 140);
    const p = montarPassagens([m('cliente', '2026-11-01T12:00:00Z', 'segredo', { apagadaEm: '2026-11-01T12:01:00Z' }), m('cliente', '2026-11-01T12:02:00Z', 'oi')]);
    assert.equal(p[0].mensagensCliente, 1);
    assert.equal(montarPassagens([]).length, 0);
});
