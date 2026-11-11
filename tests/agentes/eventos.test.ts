// Testes de novosEventos() — o escritório só anima o que acabou de acontecer.
// Rodar: npm run test:agentes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDosAgentes, type EntradaAgentes, type RegistroAgente } from '@/lib/agentes/estado';
import { novosEventos } from '@/lib/agentes/eventos';

const AGORA = Date.parse('2026-11-06T13:00:00Z');
const MIN = 60_000;
const atras = (ms: number) => new Date(AGORA - ms).toISOString();
const reg = (agenteId: string, msAtras: number, extra: Partial<RegistroAgente>): RegistroAgente =>
    ({ agenteId, em: atras(msAtras), status: 'ok', frase: `${agenteId} fez algo`, ...extra });
const estado = (registros: RegistroAgente[]) =>
    estadoDosAgentes({ agora: AGORA, registros, configs: {}, configInstalada: true, modoLaura: null, decisoes: [] } as EntradaAgentes);

test('primeira leitura só marca os ids: nada do passado é reproduzido', () => {
    const vistos = new Set<string>();
    const d = estado([reg('laura', MIN, { id: 'a', evento: { tipo: 'fala' } })]);
    assert.deepEqual(novosEventos(d, vistos, true, AGORA), []);
    assert.ok(vistos.has('a'));
});

test('registro novo na leitura seguinte vira evento; o repetido não', () => {
    const vistos = new Set<string>();
    novosEventos(estado([reg('laura', 5 * MIN, { id: 'a', evento: { tipo: 'fala' } })]), vistos, true, AGORA);
    const d2 = estado([reg('laura', 5 * MIN, { id: 'a', evento: { tipo: 'fala' } }), reg('laura', 10_000, { id: 'b', evento: { tipo: 'fala' }, frase: 'respondeu Bruna' })]);
    const ev = novosEventos(d2, vistos, false, AGORA);
    assert.equal(ev.length, 1);
    assert.deepEqual(ev[0], { id: 'b', tipo: 'fala', agenteId: 'laura', texto: 'respondeu Bruna' });
    assert.deepEqual(novosEventos(d2, vistos, false, AGORA), []);
});

test('lead distribuído sem vendedor conhecido cai para fala; com vendedor vira pacote', () => {
    const vistos = new Set<string>();
    novosEventos(estado([]), vistos, true, AGORA);
    const ev = novosEventos(estado([
        reg('distribuidor', 5_000, { id: 'd1', evento: { tipo: 'lead_distribuido', para: 'consultor_wilson' } }),
        reg('distribuidor', 4_000, { id: 'd2', evento: { tipo: 'lead_distribuido' } }),
    ]), vistos, false, AGORA);
    assert.equal(ev[0].tipo, 'lead_distribuido');
    assert.equal(ev[1].tipo, 'fala');
});

test('registro antigo (aba oculta) não anima; falas limitadas; especiais sempre passam', () => {
    const vistos = new Set<string>();
    novosEventos(estado([]), vistos, true, AGORA);
    const regs = [
        reg('laura', 20 * MIN, { id: 'velho', evento: { tipo: 'fala' } }),
        ...Array.from({ length: 9 }, (_, i) => reg('copiloto', (9 - i) * 1000, { id: `f${i}`, evento: { tipo: 'fala' } })),
        reg('consultor_wilson', 20 * MIN, { id: 'v', evento: { tipo: 'venda' } }),
    ];
    const ev = novosEventos(estado(regs), vistos, false, AGORA);
    assert.ok(!ev.some(e => e.id === 'velho'));
    assert.equal(ev.filter(e => e.tipo === 'fala').length, 4);
    assert.ok(ev.some(e => e.tipo === 'venda'));
});

test('registro sem evento (ex.: varredura de SLA) nunca anima', () => {
    const vistos = new Set<string>();
    novosEventos(estado([]), vistos, true, AGORA);
    assert.deepEqual(novosEventos(estado([reg('supervisor', 1000, { id: 'sla', noFeed: true })]), vistos, false, AGORA), []);
});
