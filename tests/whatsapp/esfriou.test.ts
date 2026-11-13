// Plano "esfriou": lead que conversou com a Laura e parou de responder. Rodar: npm run test:esfriou
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirTriagem, instrucaoLembrete, nivelDeInteresse, resumoParaConsultor, type EntradaTriagem } from '@/lib/whatsapp/ia/triagem';
import { decidirFollowup } from '@/lib/whatsapp/ia/followup';

// quinta 12/11/2026 às 14:00 em Brasília = 17:00 UTC (dentro da janela 8h-21h)
const AGORA = new Date('2026-11-12T17:00:00Z');
const minAtras = (n: number, ref = AGORA) => new Date(ref.getTime() - n * 60_000).toISOString();

/** Lead que a Laura atendeu e ela falou por último, há `silencio` minutos. */
const esfriando = (silencio: number, extra: Partial<EntradaTriagem> = {}): EntradaTriagem => ({
    criadoEm: minAtras(silencio + 30), contatoEm: minAtras(silencio + 28), ultimaDoClienteEm: minAtras(silencio + 2), lauraRespondeuDepois: true,
    telefoneValido: true, chaveLigada: true, lauraPodeEnviar: true, agora: AGORA,
    ultimaMsgEm: minAtras(silencio), nivel: 'morno', lembreteEm: null, lembretePermitido: true, ...extra,
});

test('nível de interesse: sinal de compra em 2+ mensagens é quente; 3+ mensagens é morno; o resto é leve', () => {
    assert.equal(nivelDeInteresse({ falasDoCliente: ['oi, vi o anúncio', 'qual o valor dele?'] }), 'quente');
    assert.equal(nivelDeInteresse({ falasDoCliente: ['tem o compass?', 'pode mandar fotos?'] }), 'quente');
    assert.equal(nivelDeInteresse({ falasDoCliente: ['aceita meu gol na troca?', 'é 2012'] }), 'quente');
    assert.equal(nivelDeInteresse({ falasDoCliente: ['qual o valor dele?'] }), 'leve');            // 1 mensagem não basta
    assert.equal(nivelDeInteresse({ falasDoCliente: ['oi', 'tem sedã?', 'blz, vou pensar'] }), 'morno');
    assert.equal(nivelDeInteresse({ falasDoCliente: ['oi', 'tem sedã?'] }), 'leve');
    assert.equal(nivelDeInteresse({ falasDoCliente: [] }), 'leve');
    // o selo do Classificador manda quando existe
    assert.equal(nivelDeInteresse({ falasDoCliente: ['oi'], selo: 'quente' }), 'quente');
    assert.equal(nivelDeInteresse({ falasDoCliente: ['oi'], selo: 'morno' }), 'morno');
    // selo oficial morno + palavra de troca/valor: continua morno (caso real do 1º lead de 13/11)
    assert.equal(nivelDeInteresse({ falasDoCliente: ['quero trocar meu celta', 'qual o valor de um sedan?', 'tem suv?'], selo: 'morno' }), 'morno');
    // sem selo, a palavra ainda vale
    assert.equal(nivelDeInteresse({ falasDoCliente: ['quero trocar meu celta', 'qual o valor de um sedan?'] }), 'quente');
    assert.equal(nivelDeInteresse({ falasDoCliente: ['qual o valor?', 'fotos?', 'e a entrada?'], selo: 'fora_do_perfil' }), 'leve');
});

test('quente: 60 minutos calado vai ao consultor, 59 ainda não', () => {
    assert.deepEqual(decidirTriagem(esfriando(59, { nivel: 'quente' })), { acao: 'esperar', motivo: 'conversa em andamento' });
    assert.deepEqual(decidirTriagem(esfriando(60, { nivel: 'quente' })), { acao: 'liberar', motivo: 'esfriou_quente' });
    // vale a qualquer hora (a roleta guarda para abrir a loja)
    const noite = new Date('2026-11-13T02:00:00Z'); // 23:00 BR
    assert.deepEqual(decidirTriagem(esfriando(90, { nivel: 'quente', agora: noite, ultimaMsgEm: minAtras(90, noite), contatoEm: minAtras(120, noite), criadoEm: minAtras(150, noite), ultimaDoClienteEm: minAtras(92, noite) })), { acao: 'liberar', motivo: 'esfriou_quente' });
});

test('morno: lembrete da Laura com 2 h de silêncio, dentro da janela; sem lembrete possível vai ao consultor', () => {
    assert.deepEqual(decidirTriagem(esfriando(119)), { acao: 'esperar', motivo: 'conversa em andamento' });
    assert.deepEqual(decidirTriagem(esfriando(120)), { acao: 'lembrete' });
    // fora da janela (22h), ainda dentro das 6 h: espera
    const noite = new Date('2026-11-13T01:00:00Z'); // 22:00 BR
    const fora = (silencio: number) => esfriando(silencio, { agora: noite, ultimaMsgEm: minAtras(silencio, noite), contatoEm: minAtras(silencio + 20, noite), criadoEm: minAtras(silencio + 40, noite), ultimaDoClienteEm: minAtras(silencio + 2, noite) });
    assert.deepEqual(decidirTriagem(fora(150)).acao, 'esperar');
    assert.deepEqual(decidirTriagem(fora(360)), { acao: 'liberar', motivo: 'esfriou_morno' });
    // follow-up desligado: a Laura não manda lembrete, então o morno vai ao consultor em 2 h
    assert.deepEqual(decidirTriagem(esfriando(120, { lembretePermitido: false })), { acao: 'liberar', motivo: 'esfriou_morno' });
});

test('morno depois do lembrete: espera 12 h; sem resposta vai ao consultor (com o aviso de lembrete ignorado)', () => {
    const lembrete = (horas: number) => esfriando(horas * 60 + 30, { lembreteEm: minAtras(horas * 60), ultimaMsgEm: minAtras(horas * 60) });
    assert.deepEqual(decidirTriagem(lembrete(11)).acao, 'esperar');
    assert.deepEqual(decidirTriagem(lembrete(12)), { acao: 'liberar', motivo: 'esfriou_morno' });
    const r = resumoParaConsultor({ motivo: 'esfriou_morno', quando: AGORA, nome: 'Maria Souza', interesse: 'Compass 2019', resumoDaLaura: 'Quer financiar, 20 mil de entrada.', contatado: true, respondeu: true, lembreteIgnorado: true });
    assert.match(r, /A Laura mandou um lembrete e ele não respondeu\./);
    assert.match(r, /Passou para você porque: o cliente parou de responder/);
    assert.doesNotMatch(r, /Souza/);
});

test('leve: só a Laura (follow-up); a triagem não solta por silêncio curto', () => {
    assert.deepEqual(decidirTriagem(esfriando(600, { nivel: 'leve' })).acao, 'esperar');
    assert.deepEqual(decidirTriagem(esfriando(60 * 24, { nivel: 'leve' })).acao, 'esperar');
});

test('cliente com mensagem sem resposta da Laura continua nas regras antigas (4 h)', () => {
    const e = esfriando(30, { lauraRespondeuDepois: false, ultimaDoClienteEm: minAtras(5 * 60), ultimaMsgEm: minAtras(5 * 60), nivel: 'quente' });
    assert.deepEqual(decidirTriagem(e), { acao: 'liberar', motivo: 'sem_conclusao' });
    // sem o nível (compatível com o comportamento anterior)
    assert.deepEqual(decidirTriagem({ ...esfriando(600), nivel: undefined, ultimaMsgEm: undefined }).acao, 'esperar');
});

test('lembrete: uma frase leve, retoma o assunto, sem preço e sem inventar nome', () => {
    const i = instrucaoLembrete({ nome: 'Maria Souza', carro: 'Compass 2019', contexto: 'Conversa até agora:\nCliente: oi' });
    assert.match(i, /parou de responder faz umas horas/);
    assert.match(i, /Nome: Maria/);
    assert.doesNotMatch(i, /Souza/);
    assert.match(i, /Carro de interesse: Compass 2019/);
    assert.match(i, /Não cite preço/);
    assert.match(instrucaoLembrete({ nome: null, carro: null, contexto: '' }), /não invente/);
});

test('depois que o lead vai ao consultor, a Laura para o follow-up dele', () => {
    const msgs = [{ autor: 'cliente', texto: 'Tem o Compass?', criadaEm: '2026-11-12T10:00:00Z' }, { autor: 'laura', texto: 'Tem sim!', criadaEm: '2026-11-12T10:01:00Z' }];
    const base = { status: 'ia', iaSilenciadaAte: null, msgs, enviadosDepoisDaAncora: [], leadFechado: false, temVisitaMarcada: false, lojaAberta: true, agora: new Date('2026-11-13T14:00:00Z'), corte: '2026-11-12T03:00:00.000Z' };
    assert.deepEqual(decidirFollowup(base), { acao: 'enviar', etapa: 1 });
    assert.deepEqual(decidirFollowup({ ...base, entregueAoConsultor: true }), { acao: 'pular', motivo: 'lead já entregue ao consultor' });
});
