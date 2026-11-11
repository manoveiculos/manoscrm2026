// Histórico de avisos e cobranças aos consultores. Rodar: npm run test:avisos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicioDaSemanaBR, paraCsv, resumirSemana, rotuloTipo, type AvisoRegistro } from '@/lib/avisos/historico';

const a = (criadoEm: string, consultorNome: string, tipo: string, status: 'enviado' | 'falhou' = 'enviado', mensagem = 'oi'): AvisoRegistro => ({
    id: criadoEm + consultorNome, criadoEm, tipo, consultorNome, telefone: null, mensagem, status, erro: status === 'falhou' ? 'HTTP 500' : null, leadRef: null, origem: null,
});

test('a semana começa na segunda 00:00 de Brasília', () => {
    // quarta 12/11/2026 15:00 BR
    assert.equal(inicioDaSemanaBR(new Date('2026-11-11T18:00:00Z')).toISOString(), '2026-11-09T03:00:00.000Z');
    // domingo 15/11 23:00 BR ainda é a mesma semana; segunda 16/11 00:30 BR já é a seguinte
    assert.equal(inicioDaSemanaBR(new Date('2026-11-16T02:00:00Z')).toISOString(), '2026-11-09T03:00:00.000Z');
    assert.equal(inicioDaSemanaBR(new Date('2026-11-16T03:30:00Z')).toISOString(), '2026-11-16T03:00:00.000Z');
});

test('resumo da semana: totais, cobranças, falhas e por consultor', () => {
    const ini = new Date('2026-11-09T03:00:00Z');
    const r = resumirSemana([
        a('2026-11-09T14:00:00Z', 'Sergio', 'lead_arrival'),
        a('2026-11-10T14:00:00Z', 'Sergio', 'cobranca'),
        a('2026-11-10T15:00:00Z', 'Victor', 'cobranca', 'falhou'),
        a('2026-11-16T02:59:00Z', 'Wilson', 'sla_warning'),   // domingo à noite: ainda conta
        a('2026-11-16T03:00:00Z', 'Wilson', 'lead_arrival'),  // segunda: semana seguinte
        a('2026-11-08T20:00:00Z', 'Sergio', 'lead_arrival'),  // semana anterior
    ], ini);
    assert.equal(r.total, 4);
    assert.equal(r.enviados, 3);
    assert.equal(r.falhas, 1);
    assert.equal(r.cobrancas, 2);
    assert.deepEqual(r.porConsultor.map(c => [c.consultor, c.total]), [['Sergio', 2], ['Victor', 1], ['Wilson', 1]]);
    assert.equal(r.porConsultor[0].porTipo.cobranca, 1);
});

test('planilha: BOM, separador ;, aspas escapadas e sem quebra de linha dentro do texto', () => {
    const csv = paraCsv([a('2026-11-10T14:00:00Z', 'Sérgio', 'cobranca', 'enviado', 'Ligue para "Ana"\nhoje')]);
    assert.ok(csv.startsWith('﻿'));
    const linhas = csv.replace('﻿', '').split('\r\n');
    assert.equal(linhas.length, 2);
    assert.match(linhas[0], /^"Data";"Consultor";"Tipo"/);
    assert.match(linhas[1], /"Sérgio";"Cobrança";"Enviado";"Ligue para ""Ana"" hoje"/);
    assert.equal(rotuloTipo('lead_arrival'), 'Lead novo');
    assert.equal(rotuloTipo('tipo_novo_qualquer'), 'tipo novo qualquer');
});
