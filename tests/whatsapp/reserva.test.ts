// Reserva "só uma rodada manda" (triagem e follow-up). Bug de 19/11/2026: cron sobreposto = mensagem em dobro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MOTIVO_RESERVA, reservar, reservarToque, soltar } from '@/lib/whatsapp/ia/reserva';

type Linha = Record<string, unknown>;

/** Banco de mentira, só com o que reserva.ts usa. */
function bancoFalso() {
    const triagem = new Map<string, Linha>();
    const followups: Linha[] = [];
    let n = 0;
    const relogio = () => new Date(Date.UTC(2026, 10, 19, 11, 0, 0) + (n++) * 1000).toISOString();

    const from = (tabela: string) => {
        if (tabela === 'wa_triagem') {
            return {
                update: (vals: Linha) => {
                    let uid = ''; const nulos: string[] = [];
                    const exec = () => {
                        const l = triagem.get(uid);
                        if (!l || nulos.some(c => l[c] !== null)) return { data: [], error: null };
                        Object.assign(l, vals);
                        return { data: [{ lead_uid: uid }], error: null };
                    };
                    const q: Record<string, unknown> = {};
                    q.eq = (_c: string, v: string) => { uid = v; return q; };
                    q.is = (c: string) => { nulos.push(c); return q; };
                    q.select = () => Promise.resolve(exec());
                    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(exec()).then(ok);
                    return q;
                },
            };
        }
        return {
            insert: (row: Linha) => ({
                select: () => ({
                    single: () => {
                        const l = { id: `f${followups.length + 1}`, criado_em: relogio(), ...row };
                        followups.push(l);
                        return Promise.resolve({ data: { id: l.id }, error: null });
                    },
                }),
            }),
            select: () => ({
                eq: (_c: string, conversa: string) => ({
                    gt: (_c2: string, desde: string) =>
                        Promise.resolve({ data: followups.filter(f => f.conversa_id === conversa && String(f.criado_em) > desde), error: null }),
                }),
            }),
            delete: () => ({
                eq: (_c: string, id: string) => {
                    const i = followups.findIndex(f => f.id === id);
                    if (i >= 0) followups.splice(i, 1);
                    return Promise.resolve({ error: null });
                },
            }),
        };
    };
    return { cliente: { from } as unknown as SupabaseClient, triagem, followups };
}

const AGORA = new Date(Date.UTC(2026, 10, 19, 11, 5, 0));
const ANCORA = new Date(Date.UTC(2026, 10, 18, 12, 0, 0)).toISOString();

test('triagem: só a primeira rodada reserva o lead', async () => {
    const b = bancoFalso();
    b.triagem.set('lead:1', { contato_em: null, lembrete_em: null });
    assert.equal(await reservar(b.cliente, 'lead:1', 'contato_em', AGORA), true);
    assert.equal(await reservar(b.cliente, 'lead:1', 'contato_em', AGORA), false);
});

test('triagem: duas rodadas ao mesmo tempo, só uma ganha', async () => {
    const b = bancoFalso();
    b.triagem.set('lead:1', { contato_em: null, lembrete_em: null });
    const r = await Promise.all([reservar(b.cliente, 'lead:1', 'contato_em', AGORA), reservar(b.cliente, 'lead:1', 'contato_em', AGORA), reservar(b.cliente, 'lead:1', 'contato_em', AGORA)]);
    assert.equal(r.filter(Boolean).length, 1);
});

test('triagem: soltar devolve o lead para a próxima rodada; contato e lembrete são independentes', async () => {
    const b = bancoFalso();
    b.triagem.set('lead:1', { contato_em: null, lembrete_em: null });
    assert.equal(await reservar(b.cliente, 'lead:1', 'contato_em', AGORA), true);
    assert.equal(await reservar(b.cliente, 'lead:1', 'lembrete_em', AGORA), true);
    await soltar(b.cliente, 'lead:1', 'contato_em');
    assert.equal(await reservar(b.cliente, 'lead:1', 'contato_em', AGORA), true);
});

test('triagem: lead sem linha em wa_triagem não é reservado', async () => {
    const b = bancoFalso();
    assert.equal(await reservar(b.cliente, 'lead:x', 'contato_em', AGORA), false);
});

test('follow-up: sozinha, a rodada reserva e a reserva vira o registro do toque', async () => {
    const b = bancoFalso();
    const id = await reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA);
    assert.ok(id);
    assert.equal(b.followups.length, 1);
    assert.equal(b.followups[0].motivo, MOTIVO_RESERVA);
});

test('follow-up: segunda rodada vê a reserva da primeira e desiste (sem deixar lixo)', async () => {
    const b = bancoFalso();
    assert.ok(await reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA));
    assert.equal(await reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA), null);
    assert.equal(b.followups.length, 1);
});

test('follow-up: duas rodadas ao mesmo tempo, nunca as duas passam', async () => {
    const b = bancoFalso();
    const r = await Promise.all([reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA), reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA)]);
    assert.ok(r.filter(Boolean).length <= 1);
});

test('follow-up: se a outra rodada já enviou depois da decisão, esta desiste', async () => {
    const b = bancoFalso();
    b.followups.push({ id: 'velho', conversa_id: 'c1', etapa: 1, status: 'enviado', motivo: null, criado_em: new Date(Date.UTC(2026, 10, 19, 11, 1, 0)).toISOString() });
    assert.equal(await reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA), null);
});

test('follow-up: reserva velha (rodada que caiu) não trava o toque', async () => {
    const b = bancoFalso();
    b.followups.push({ id: 'velha', conversa_id: 'c1', etapa: 1, status: 'rascunho', motivo: MOTIVO_RESERVA, criado_em: new Date(Date.UTC(2026, 10, 19, 10, 0, 0)).toISOString() });
    assert.ok(await reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA));
});

test('follow-up: conversas diferentes não se atrapalham', async () => {
    const b = bancoFalso();
    assert.ok(await reservarToque(b.cliente, 'c1', 1, ANCORA, 0, AGORA));
    assert.ok(await reservarToque(b.cliente, 'c2', 1, ANCORA, 0, AGORA));
});
