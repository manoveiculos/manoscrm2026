// Fila de espera dos leads e retorno do cliente. Rodar: npm run test:fila-espera
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    FILA_ESCALADA_MIN, FILA_LEMBRETE_MIN, decidirFila, escolherDestinatarios, respostaAoFollowup, textoEscaladaFila, textoFila, textoLembreteFila, textoRetorno,
    type Consultor, type EntradaFila,
} from '@/lib/avisos/fila';
import { lerModoDistribuicao } from '@/lib/services/modoDistribuicao';
import type { SupabaseClient } from '@supabase/supabase-js';

const AGORA = new Date('2026-11-13T15:00:00Z');
const base = (extra: Partial<EntradaFila> = {}): EntradaFila => ({
    status: 'fila_espera', avisadaEm: null, lembreteEm: null, escalouEm: null, lojaAberta: true, agora: AGORA, minutosAbertosDesdeAviso: 0, ...extra,
});

test('fila: avisa todos quando o lead entra, lembra em 10 min e escala em 20; só com a loja aberta', () => {
    assert.equal(decidirFila(base()), 'avisar');
    assert.equal(decidirFila(base({ lojaAberta: false })), 'esperar');                    // de madrugada espera abrir
    const avisada = (m: number, extra: Partial<EntradaFila> = {}) => base({ avisadaEm: '2026-11-13T14:00:00Z', minutosAbertosDesdeAviso: m, ...extra });
    assert.equal(decidirFila(avisada(5)), 'esperar');
    assert.equal(decidirFila(avisada(FILA_LEMBRETE_MIN)), 'lembrar');
    assert.equal(decidirFila(avisada(15, { lembreteEm: '2026-11-13T14:10:00Z' })), 'esperar');
    assert.equal(decidirFila(avisada(FILA_ESCALADA_MIN, { lembreteEm: '2026-11-13T14:10:00Z' })), 'escalar');
    assert.equal(decidirFila(avisada(25, { lembreteEm: 'x', escalouEm: 'y' })), 'esperar');   // cada passo uma vez
    assert.equal(decidirFila(avisada(30)), 'escalar');                                     // atrasou: vai direto ao alerta, sem lembrete atrasado
    assert.equal(decidirFila(base({ status: 'distribuido' })), 'esperar');                 // lead que alguém já pegou não é da fila
    assert.equal(decidirFila(base({ status: 'atendido' })), 'esperar');
});

const c = (id: string, extra: Partial<Consultor> = {}): Consultor => ({ id, name: `Consultor ${id}`, phone: '5547999990001', phoneVerificado: true, ativo: true, recebeLeads: true, disponivelEm: null, ...extra });

test('quem recebe o aviso: ativo, recebe leads, WhatsApp confirmado; quem bateu o ponto hoje tem preferência', () => {
    const hoje = '2026-11-13';
    const todos = [
        c('a', { disponivelEm: hoje }), c('b'), c('c', { phoneVerificado: false, disponivelEm: hoje }),
        c('d', { ativo: false, disponivelEm: hoje }), c('e', { recebeLeads: false, disponivelEm: hoje }), c('f', { phone: null, disponivelEm: hoje }),
    ];
    assert.deepEqual(escolherDestinatarios(todos, hoje).map(x => x.id), ['a']);              // só quem bateu o ponto
    assert.deepEqual(escolherDestinatarios([c('b'), c('g')], hoje).map(x => x.id), ['b', 'g']); // ninguém bateu: avisa todos os aptos
    assert.deepEqual(escolherDestinatarios([c('x', { phoneVerificado: false })], hoje), []);
});

test('textos: quem, carro, resumo da Laura, link e a regra "o primeiro que clicar leva"', () => {
    const d = { nome: 'Maria Souza', carro: 'Compass 2019', origem: 'WhatsApp', resumo: 'Quer trocar o Celta por um SUV.', link: 'https://x.com.br/lead/1' };
    const t = textoFila(d);
    assert.match(t, /LEAD NA FILA DE ESPERA/);
    assert.match(t, /Maria · Compass 2019/);
    assert.doesNotMatch(t, /Souza/);
    assert.match(t, /🤖 Quer trocar o Celta por um SUV\./);
    assert.match(t, /O primeiro que clicar leva o lead/);
    assert.match(t, /https:\/\/x\.com\.br\/lead\/1/);
    assert.match(textoLembreteFila(d, 10), /Ninguém pegou ainda\* \(10 min\)/);
    assert.match(textoEscaladaFila(d, 20), /Lead parado na fila há 20 min/);
    assert.match(textoFila({ ...d, nome: null, carro: null, origem: null, resumo: null }), /Cliente novo/);
});

test('retorno: só avisa a 1ª resposta depois do follow-up, uma vez, se há consultor responsável', () => {
    const falas = [{ em: '2026-11-12T10:00:00Z', texto: 'oi' }, { em: '2026-11-13T09:00:00Z', texto: 'Oi! Ainda tem o Compass?' }, { em: '2026-11-13T09:05:00Z', texto: 'e o preço?' }];
    const e = { falasDoCliente: falas, followupEm: '2026-11-13T08:00:00Z', temConsultor: true, jaAvisado: false };
    assert.deepEqual(respostaAoFollowup(e), { em: '2026-11-13T09:00:00Z', texto: 'Oi! Ainda tem o Compass?' });
    assert.equal(respostaAoFollowup({ ...e, jaAvisado: true }), null);
    assert.equal(respostaAoFollowup({ ...e, temConsultor: false }), null);
    assert.equal(respostaAoFollowup({ ...e, followupEm: '2026-11-13T09:30:00Z' }), null);          // ainda não respondeu
    assert.equal(respostaAoFollowup({ ...e, falasDoCliente: [] }), null);
    const t = textoRetorno({ cliente: 'Maria Souza', carro: 'Compass 2019', texto: 'Oi! Ainda tem o Compass?', link: 'https://x.com.br/conversas?c=1' });
    assert.match(t, /Maria respondeu!/);
    assert.match(t, /Disse: “Oi! Ainda tem o Compass\?”/);
    assert.match(t, /a Laura tinha chamado ele de novo/i);
    assert.doesNotMatch(t, /Souza/);
});

test('modo de distribuição: só "fila" liga a fila; qualquer erro ou outro valor = rodízio (comportamento de sempre)', async () => {
    const banco = (resp: { data?: unknown; error?: unknown }) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => resp }) }) }) }) as unknown as SupabaseClient;
    assert.equal(await lerModoDistribuicao(banco({ data: { distribuicao: 'fila' } })), 'fila');
    assert.equal(await lerModoDistribuicao(banco({ data: { distribuicao: 'rodizio' } })), 'rodizio');
    assert.equal(await lerModoDistribuicao(banco({ data: { distribuicao: 'qualquer' } })), 'rodizio');
    assert.equal(await lerModoDistribuicao(banco({ data: null })), 'rodizio');
    assert.equal(await lerModoDistribuicao(banco({ error: { message: 'coluna não existe' } })), 'rodizio');
    const quebrado = { from: () => { throw new Error('banco fora'); } } as unknown as SupabaseClient;
    assert.equal(await lerModoDistribuicao(quebrado), 'rodizio');
});
