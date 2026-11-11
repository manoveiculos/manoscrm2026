// Testes de normalizarTemperatura() e montarPainel() — números do telão.
// Rodar: npm run test:agentes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPainel, normalizarTemperatura } from '@/lib/agentes/painel';

test('classificações em vários formatos viram quente/morno/frio; o resto é sem classificação', () => {
    for (const c of ['hot', 'HOT', 'Lead Quente', 'super quente']) assert.equal(normalizarTemperatura(c), 'quente', c);
    for (const c of ['warm', 'WARM', 'LEAD MORNO', 'morno']) assert.equal(normalizarTemperatura(c), 'morno', c);
    for (const c of ['cold', 'COLD', 'lead frio', 'FRIO']) assert.equal(normalizarTemperatura(c), 'frio', c);
    for (const c of [null, undefined, '', 'FASE INICIAL', 'DESQUALIFICADO', 'LEAD PERDA TOTAL']) assert.equal(normalizarTemperatura(c as any), 'sem', String(c));
});

test('painel: contagens por temperatura e etapa, e vendas reais no funil', () => {
    const p = montarPainel([
        { status: 'attempt', ai_classification: 'hot' },
        { status: 'attempt', ai_classification: null },
        { status: 'triagem', ai_classification: 'LEAD MORNO' },
        { status: 'received', ai_classification: 'cold' },
        { status: 'estranho', ai_classification: null },
    ], 1, 3);
    assert.deepEqual(p.leads, { quente: 1, morno: 1, frio: 1, semClassificacao: 2 });
    assert.equal(p.vendasHoje, 1);
    assert.deepEqual(p.funil, [
        { rotulo: 'Recebidos', n: 1 }, { rotulo: 'Em triagem', n: 3 }, { rotulo: 'Estranho', n: 1 }, { rotulo: 'Vendidos no mês', n: 3 },
    ]);
});

test('sem leads e sem vendas: tudo zero (sem inventar)', () => {
    const p = montarPainel([], 0, 0);
    assert.deepEqual(p.leads, { quente: 0, morno: 0, frio: 0, semClassificacao: 0 });
    assert.deepEqual(p.funil, [{ rotulo: 'Vendidos no mês', n: 0 }]);
});
