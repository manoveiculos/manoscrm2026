// Follow-up da Laura (decisão pura). Rodar: npm run test:followup
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancoraDoSilencio, decidirFollowup, instrucaoDoToque, pediuParar, type EntradaDecisao, type MsgFollowup } from '@/lib/whatsapp/ia/followup';

const DIA = 86_400_000;
const T0 = Date.parse('2026-11-02T14:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const base = (msgs: MsgFollowup[], agoraMs: number, extra: Partial<EntradaDecisao> = {}): EntradaDecisao => ({
    status: 'ia', iaSilenciadaAte: null, msgs, enviadosDepoisDaAncora: [], leadFechado: false, temVisitaMarcada: false, lojaAberta: true, agora: new Date(agoraMs), ...extra,
});
const conversa: MsgFollowup[] = [
    { autor: 'cliente', texto: 'Tem o Compass?', criadaEm: iso(T0) },
    { autor: 'laura', texto: 'Tem sim! Qual seu nome?', criadaEm: iso(T0 + 60_000) },
];

test('âncora = primeira mensagem da loja depois da última do cliente', () => {
    assert.equal(ancoraDoSilencio(conversa), iso(T0 + 60_000));
    assert.equal(ancoraDoSilencio([conversa[0]]), null);          // cliente ainda espera
    assert.equal(ancoraDoSilencio([conversa[1]]), null);          // cliente nunca falou
    assert.equal(ancoraDoSilencio([...conversa, { autor: 'laura', texto: 'Oi?', criadaEm: iso(T0 + DIA) }]), iso(T0 + 60_000));
    assert.equal(ancoraDoSilencio([...conversa, { autor: 'cliente', texto: 'ok', criadaEm: iso(T0 + 2 * DIA) }]), null);
});

test('cadência 1, 2, 4 e 10 dias: respeita a espera de cada toque', () => {
    const a = T0 + 60_000;
    assert.deepEqual(decidirFollowup(base(conversa, a + 0.5 * DIA)), { acao: 'pular', motivo: 'ainda não é a hora' });
    assert.deepEqual(decidirFollowup(base(conversa, a + 1 * DIA)), { acao: 'enviar', etapa: 1 });
    const e1 = [iso(a + 1 * DIA)];
    assert.deepEqual(decidirFollowup(base(conversa, a + 1.5 * DIA, { enviadosDepoisDaAncora: e1 })), { acao: 'pular', motivo: 'ainda não é a hora' });
    assert.deepEqual(decidirFollowup(base(conversa, a + 2 * DIA + 3_600_000, { enviadosDepoisDaAncora: e1 })), { acao: 'enviar', etapa: 2 });
    const e2 = [...e1, iso(a + 2 * DIA)];
    assert.deepEqual(decidirFollowup(base(conversa, a + 4 * DIA, { enviadosDepoisDaAncora: e2 })), { acao: 'enviar', etapa: 3 });
    const e3 = [...e2, iso(a + 4 * DIA)];
    assert.deepEqual(decidirFollowup(base(conversa, a + 9 * DIA, { enviadosDepoisDaAncora: e3 })), { acao: 'pular', motivo: 'ainda não é a hora' });
    assert.deepEqual(decidirFollowup(base(conversa, a + 10 * DIA, { enviadosDepoisDaAncora: e3 })), { acao: 'enviar', etapa: 4 });
    const e4 = [...e3, iso(a + 10 * DIA)];
    assert.deepEqual(decidirFollowup(base(conversa, a + 11 * DIA, { enviadosDepoisDaAncora: e4 })), { acao: 'pular', motivo: 'cadência completa' });
});

test('nunca dois toques em menos de 20 h (mesmo atrasado)', () => {
    const a = T0 + 60_000;
    const r = decidirFollowup(base(conversa, a + 4 * DIA + 3_600_000, { enviadosDepoisDaAncora: [iso(a + 1 * DIA), iso(a + 4 * DIA + 1_800_000)] }));
    assert.deepEqual(r, { acao: 'pular', motivo: 'toque recente' });
});

test('travas: conversa com humano, silenciada, lead fechado, visita, horário, silêncio longo', () => {
    const a = T0 + 60_000;
    const agora = a + 1 * DIA;
    assert.equal((decidirFollowup(base(conversa, agora, { status: 'humano' })) as { motivo: string }).motivo, 'conversa não está com a Laura');
    assert.equal((decidirFollowup(base(conversa, agora, { iaSilenciadaAte: iso(agora + DIA) })) as { motivo: string }).motivo, 'Laura silenciada');
    assert.equal((decidirFollowup(base(conversa, agora, { leadFechado: true })) as { motivo: string }).motivo, 'lead vendido, perdido ou arquivado');
    assert.equal((decidirFollowup(base(conversa, agora, { temVisitaMarcada: true })) as { motivo: string }).motivo, 'visita marcada');
    assert.equal((decidirFollowup(base(conversa, agora, { lojaAberta: false })) as { motivo: string }).motivo, 'fora do horário da loja');
    assert.equal((decidirFollowup(base(conversa, a + 31 * DIA)) as { motivo: string }).motivo, 'silêncio longo demais');
    assert.equal((decidirFollowup(base(conversa, agora, { rascunhoDaEtapaExiste: e => e === 1 })) as { motivo: string }).motivo, 'rascunho desta etapa já existe');
    assert.equal((decidirFollowup(base([conversa[0]], agora)) as { motivo: string }).motivo, 'cliente aguardando resposta ou sem histórico');
});

test('quem pediu para parar ou já comprou não recebe follow-up', () => {
    const quer = (t: string): MsgFollowup[] => [{ autor: 'cliente', texto: t, criadaEm: iso(T0) }, conversa[1]];
    for (const t of ['não quero mais, obrigado', 'pare de mandar mensagem', 'Já comprei outro carro', 'sem interesse', 'por favor me tira dessa lista']) {
        assert.equal(pediuParar(quer(t)), true, t);
        assert.equal((decidirFollowup(base(quer(t), T0 + 3 * DIA)) as { motivo: string }).motivo, 'cliente pediu para parar ou já resolveu', t);
    }
    for (const t of ['Tem o Compass?', 'quero ver o carro amanhã', 'não sei ainda, vou pensar']) assert.equal(pediuParar(quer(t)), false, t);
    assert.equal(pediuParar([{ autor: 'cliente', transcricao: 'não tenho interesse', criadaEm: iso(T0) }]), true); // áudio transcrito
});

test('instrução do toque: objetivo por etapa, sem inventar nome nem carro', () => {
    const i1 = instrucaoDoToque({ etapa: 1, nome: 'Ana', carro: 'Compass 2019', contexto: 'Conversa até agora:\nCliente: oi' });
    assert.match(i1, /Passou 1 dia/);
    assert.match(i1, /Nome do cliente: Ana/);
    assert.match(i1, /Carro de interesse: Compass 2019/);
    assert.match(instrucaoDoToque({ etapa: 4, nome: null, carro: null, contexto: '' }), /Último toque[\s\S]*Você ainda não sabe o nome/);
    assert.doesNotMatch(instrucaoDoToque({ etapa: 2, nome: null, carro: null, contexto: '' }), /Carro de interesse/);
});
