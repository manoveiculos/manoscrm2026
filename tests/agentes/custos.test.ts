// Gasto de IA por dia, semana e mês. Rodar: npm run test:custos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diaBR, inicioDoPeriodo, resumirCustos, type LinhaCusto } from '@/lib/agentes/custos';

// quinta 12/11/2026 15:00 em Brasília = 18:00 UTC
const AGORA = new Date('2026-11-12T18:00:00Z');
const l = (agente: string, em: string, usd: number): LinhaCusto => ({ agente, em, usd });

test('período = calendário de Brasília: dia, semana (desde a segunda) e mês (desde o dia 1º)', () => {
    assert.equal(new Date(inicioDoPeriodo('dia', AGORA)).toISOString(), '2026-11-12T03:00:00.000Z');
    assert.equal(new Date(inicioDoPeriodo('semana', AGORA)).toISOString(), '2026-11-09T03:00:00.000Z');
    assert.equal(new Date(inicioDoPeriodo('mes', AGORA)).toISOString(), '2026-11-01T03:00:00.000Z');
    // 01:00 de Brasília do dia 13 (04:00 UTC) já é o dia 13, não o 12
    assert.equal(new Date(inicioDoPeriodo('dia', new Date('2026-11-13T04:00:00Z'))).toISOString(), '2026-11-13T03:00:00.000Z');
    assert.equal(diaBR('2026-11-13T02:59:00Z'), '2026-11-12');
    assert.equal(diaBR('2026-11-13T03:00:00Z'), '2026-11-13');
});

const LINHAS = [
    l('laura', '2026-11-12T14:00:00Z', 0.04),      // hoje
    l('followup', '2026-11-12T15:00:00Z', 0.01),   // hoje
    l('triagem', '2026-11-11T14:00:00Z', 0.02),    // ontem (mesma semana)
    l('analista', '2026-11-09T12:00:00Z', 0.003),  // segunda
    l('laura', '2026-11-08T12:00:00Z', 5),         // domingo anterior: fora da semana, dentro do mês
    l('laura', '2026-10-31T12:00:00Z', 100),       // mês passado: fora de tudo
    l('laura', '2026-11-12T23:00:00Z', 7),         // no futuro: ignorado
];

test('hoje, semana e mês somam só o que cabe em cada período', () => {
    assert.equal(resumirCustos(LINHAS, 'dia', AGORA).total, 0.05);
    assert.equal(resumirCustos(LINHAS, 'semana', AGORA).total, 0.073);
    assert.equal(resumirCustos(LINHAS, 'mes', AGORA).total, 5.073);
});

test('por agente: ordenado do maior para o menor, com rótulo e número de chamadas', () => {
    const s = resumirCustos(LINHAS, 'semana', AGORA);
    assert.deepEqual(s.porAgente.map(a => [a.agente, a.usd, a.chamadas]), [['laura', 0.04, 1], ['triagem', 0.02, 1], ['followup', 0.01, 1], ['analista', 0.003, 1]]);
    assert.equal(s.porAgente[0].rotulo, 'Laura (atendimento)');
});

test('por dia: todos os dias do período aparecem, inclusive os sem gasto', () => {
    const s = resumirCustos(LINHAS, 'semana', AGORA);
    assert.deepEqual(s.porDia.map(d => d.dia), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
    assert.deepEqual(s.porDia.map(d => d.usd), [0.003, 0, 0.02, 0.05]);
    assert.equal(resumirCustos(LINHAS, 'dia', AGORA).porDia.length, 1);
});

test('média por dia e projeção do mês', () => {
    const m = resumirCustos([l('laura', '2026-11-05T12:00:00Z', 6), l('laura', '2026-11-12T12:00:00Z', 6)], 'mes', AGORA);
    assert.equal(m.total, 12);
    assert.equal(m.porDia.length, 12);          // dias 1 a 12
    assert.equal(m.mediaDia, 1);
    assert.equal(m.projecaoMes, 30);            // novembro tem 30 dias
    assert.equal(resumirCustos(LINHAS, 'dia', AGORA).projecaoMes, null);
});

test('sem gasto: tudo zero, sem inventar', () => {
    const s = resumirCustos([], 'semana', AGORA);
    assert.equal(s.total, 0);
    assert.deepEqual(s.porAgente, []);
    assert.equal(s.mediaDia, 0);
});
