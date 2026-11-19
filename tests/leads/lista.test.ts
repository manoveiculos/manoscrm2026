import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTROS_VAZIOS, inicioDoPeriodo, montarPagina, opcoesDosFiltros, termoDeBusca, type LeadMin } from '@/lib/leads/lista';
import type { Enriquecimento } from '@/lib/leads/urgencia';

const agora = new Date('2026-11-19T15:00:00Z');
const lead = (id: string, o: Partial<LeadMin> = {}): LeadMin => ({
    id, status: 'entrada', created_at: '2026-11-10T12:00:00Z', assigned_consultant_id: 'c1', source: 'google', vehicle_interest: 'Onix', ...o,
});
const enr = (o: Partial<Enriquecimento>): Enriquecimento => ({
    conversaId: 'x', situacao: null, rotuloSituacao: null, quando: null, ultimaDe: 'laura', ultimaEm: '2026-11-18T12:00:00Z', ultimaTexto: null, ...o,
});

const leads = [
    lead('a'), lead('b', { assigned_consultant_id: null }), lead('c', { source: 'whatsapp' }), lead('d', { status: 'vendido' }),
    lead('e', { created_at: '2026-11-19T13:00:00Z' }),
];
const mapa: Record<string, Enriquecimento> = {
    a: enr({ ultimaDe: 'cliente', ultimaEm: '2026-11-19T09:00:00Z' }),
    c: enr({ situacao: 'visita_marcada' }),
};
const e = (l: LeadMin) => mapa[l.id];

test('padrão: por data e horário, do mais novo ao mais antigo', () => {
    const p = montarPagina([lead('x', { created_at: '2026-11-18T09:00:00Z' }), lead('y', { created_at: '2026-11-19T14:30:00Z' }), lead('z', { created_at: '2026-11-19T08:00:00Z' })], FILTROS_VAZIOS, () => undefined, { offset: 0, limite: 30, agora });
    assert.deepEqual(p.ids, ['y', 'z', 'x']);
});

test('com ordem "urgencia": ordena por urgência, conta chips e informa o próximo offset', () => {
    const p = montarPagina(leads, FILTROS_VAZIOS, e, { offset: 0, limite: 2, agora, ordem: 'urgencia' });
    assert.deepEqual(p.ids, ['a', 'c']);            // esperando a loja → visita marcada
    assert.equal(p.total, 5);
    assert.equal(p.proximo, 2);
    assert.deepEqual(p.contagens, { todos: 5, esperando: 1, sem_contato: 1, visita: 1, novos: 1, sem_dono: 1 });
    const p2 = montarPagina(leads, FILTROS_VAZIOS, e, { offset: 4, limite: 2, agora, ordem: 'urgencia' });
    assert.deepEqual(p2.ids, ['d']);                 // encerrado por último
    assert.equal(p2.proximo, null);
});

test('chip filtra a página mas as contagens seguem sendo do conjunto filtrado pelos selects', () => {
    const p = montarPagina(leads, { ...FILTROS_VAZIOS, chip: 'esperando' }, e, { offset: 0, limite: 50, agora });
    assert.deepEqual(p.ids, ['a']);
    assert.equal(p.total, 1);
    assert.equal(p.contagens.todos, 5);
});

test('filtros de cima: consultor, origem, etapa e score', () => {
    const base = { offset: 0, limite: 50, agora };
    assert.deepEqual(montarPagina(leads, { ...FILTROS_VAZIOS, consultor: 'none' }, e, base).ids, ['b']);
    assert.deepEqual(montarPagina(leads, { ...FILTROS_VAZIOS, origem: 'whatsapp' }, e, base).ids, ['c']);
    assert.deepEqual(montarPagina(leads, { ...FILTROS_VAZIOS, status: 'vendido' }, e, base).ids, ['d']);
    assert.deepEqual(montarPagina(leads, { ...FILTROS_VAZIOS, score: 'quente' }, e, base).ids, ['d']);   // vendido = 100
});

test('opções dos selects: frequentes, sem genéricos nem texto de preenchimento', () => {
    const o = opcoesDosFiltros([
        lead('1', { vehicle_interest: 'Onix' }), lead('2', { vehicle_interest: 'Onix' }), lead('3', { vehicle_interest: 'Lead Google - Não especificado' }),
        lead('4', { vehicle_interest: 'compra' }), lead('5', { vehicle_interest: 'Polo', source: 'meta' }),
    ]);
    assert.deepEqual(o.interesses, ['Onix', 'Polo']);
    assert.deepEqual(o.origens, ['google', 'meta']);
});

test('busca segura e início do período (dia de São Paulo)', () => {
    assert.equal(termoDeBusca(' joão,(silva)%* '), 'joão silva');
    assert.equal(inicioDoPeriodo('today', new Date('2026-11-19T02:00:00Z')), '2026-11-18T03:00:00.000Z');   // 23h de 18/11 em SP
    assert.equal(inicioDoPeriodo('7days', agora), '2026-11-12T15:00:00.000Z');
    assert.equal(inicioDoPeriodo('all', agora), null);
});
