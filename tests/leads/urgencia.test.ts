import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grupoDoLead, ordenarPorUrgencia, type Enriquecimento, type LeadParaOrdenar } from '@/lib/leads/urgencia';

const agora = new Date('2026-11-19T15:00:00Z');
const lead = (id: string, o: Partial<LeadParaOrdenar> = {}): LeadParaOrdenar => ({ id, status: 'entrada', created_at: '2026-11-10T12:00:00Z', ...o });
const enr = (o: Partial<Enriquecimento>): Enriquecimento => ({
    conversaId: 'c', situacao: null, rotuloSituacao: null, quando: null, ultimaDe: null, ultimaEm: '2026-11-18T12:00:00Z', ultimaTexto: null, ...o,
});

test('cada lead cai no grupo certo', () => {
    assert.equal(grupoDoLead(lead('1'), enr({ ultimaDe: 'cliente' }), agora), 'esperando_loja');
    assert.equal(grupoDoLead(lead('1'), enr({ situacao: 'visita_marcada', ultimaDe: 'laura' }), agora), 'visita');
    assert.equal(grupoDoLead(lead('1'), enr({ situacao: 'cliente_pediu_tempo', quando: '2026-11-18', ultimaDe: 'laura' }), agora), 'retorno');
    assert.equal(grupoDoLead(lead('1'), enr({ situacao: 'cliente_pediu_tempo', quando: '2026-12-20', ultimaDe: 'laura' }), agora), 'normal');
    assert.equal(grupoDoLead(lead('1', { created_at: '2026-11-19T10:00:00Z' }), undefined, agora), 'novo_hoje');
    assert.equal(grupoDoLead(lead('1'), enr({ ultimaDe: 'laura', ultimaEm: '2026-11-10T12:00:00Z' }), agora), 'sem_contato');
    assert.equal(grupoDoLead(lead('1'), enr({ ultimaDe: 'laura' }), agora), 'normal');
});

test('vendido, perdido e cliente que comprou/recusou ficam encerrados mesmo esperando resposta', () => {
    assert.equal(grupoDoLead(lead('1', { status: 'vendido' }), enr({ ultimaDe: 'cliente' }), agora), 'encerrado');
    assert.equal(grupoDoLead(lead('1', { status: 'perdido' }), undefined, agora), 'encerrado');
    assert.equal(grupoDoLead(lead('1'), enr({ situacao: 'cliente_comprou', ultimaDe: 'cliente' }), agora), 'encerrado');
});

test('ordem: esperando (o mais antigo primeiro) → visita → retorno → novo → sem contato → resto → encerrado', () => {
    const mapa: Record<string, Enriquecimento | undefined> = {
        a: enr({ ultimaDe: 'cliente', ultimaEm: '2026-11-19T14:00:00Z' }),
        b: enr({ ultimaDe: 'cliente', ultimaEm: '2026-11-19T09:00:00Z' }),
        c: enr({ situacao: 'visita_marcada', ultimaDe: 'laura' }),
        d: undefined,
        e: enr({ ultimaDe: 'laura', ultimaEm: '2026-11-01T12:00:00Z' }),
        f: enr({ ultimaDe: 'laura' }),
    };
    const leads = [
        lead('f'), lead('e'), lead('d', { created_at: '2026-11-19T13:00:00Z' }), lead('c'), lead('a'), lead('b'), lead('g', { status: 'vendido' }),
    ];
    const r = ordenarPorUrgencia(leads, l => mapa[l.id], agora);
    assert.deepEqual(r.map(x => x.lead.id), ['b', 'a', 'c', 'd', 'e', 'f', 'g']);
});
