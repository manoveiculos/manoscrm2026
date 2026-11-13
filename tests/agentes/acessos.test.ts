import test from 'node:test';
import assert from 'node:assert/strict';
import { blocosDePresenca, resumirAcesso, fraseDaRota } from '@/lib/agentes/acessos';

const T = (h: number, m = 0) => `2026-11-12T${String(h + 3).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`; // h em BRT

test('batimentos contínuos viram um bloco; lacuna > 3 min quebra', () => {
    const b = blocosDePresenca([T(9, 0), T(9, 1), T(9, 2), T(9, 30), T(9, 31)]);
    assert.equal(b.length, 2);
    assert.equal(b[0].minutos, 3);
    assert.equal(b[1].minutos, 2);
});

test('sem batimento: tempo online não consta (null), nada é estimado', () => {
    const r = resumirAcesso([{ em: T(8, 0), tipo: 'login' }, { em: T(18, 0), tipo: 'logout' }], new Date(T(19)).getTime(), 2);
    const d = r.dias.find(x => x.dia === '2026-11-12')!;
    assert.equal(d.minutosOnline, null);
    assert.equal(d.logins, 1);
    assert.equal(d.ausencias.length, 1); // 8h -> 18h sem sinal no meio
    assert.equal(r.online, false);
    assert.equal(r.minutosSemana, null);
});

test('online agora quando o último batimento é recente', () => {
    const agora = new Date(T(10, 5)).getTime();
    const r = resumirAcesso([{ em: T(10, 4), tipo: 'batimento' }], agora, 1);
    assert.equal(r.online, true);
    assert.equal(r.semAcessarMs, 60_000);
});

test('rota vira frase sem dado de cliente', () => {
    assert.equal(fraseDaRota('/lead/leads_distribuicao_crm_26:99?x=1'), 'abriu um lead');
});
