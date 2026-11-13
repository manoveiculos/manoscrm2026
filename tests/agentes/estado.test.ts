// Testes de estadoDosAgentes() — casos da especificação (aba-agentes-tempo-real.md, §6).
// Rodar: npm run test:agentes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDosAgentes, type EntradaAgentes, type RegistroAgente } from '@/lib/agentes/estado';

const AGORA = Date.parse('2026-11-06T13:00:00Z'); // 10:00 em Brasília
const MIN = 60_000;
const H = 60 * MIN;
const atras = (ms: number) => new Date(AGORA - ms).toISOString();

const base = (p: Partial<EntradaAgentes> = {}): EntradaAgentes => ({
    agora: AGORA, registros: [], configs: {}, configInstalada: true, modoLaura: null, decisoes: [], ...p,
});
const reg = (agenteId: string, msAtras: number, status: RegistroAgente['status'], extra: Partial<RegistroAgente> = {}): RegistroAgente =>
    ({ agenteId, em: atras(msAtras), status, frase: `${agenteId} ${status}`, ...extra });
const ag = (r: ReturnType<typeof estadoDosAgentes>, id: string) => r.agentes.find(a => a.id === id)!;

test('execução aberta há menos de 2 min → trabalhando, com a frase da execução', () => {
    const r = estadoDosAgentes(base({ registros: [reg('vitrine', 30_000, 'rodando', { frase: 'montando o post do Onix' })] }));
    assert.equal(ag(r, 'vitrine').estado, 'trabalhando');
    assert.equal(ag(r, 'vitrine').frase, 'montando o post do Onix');
});

test('execução "rodando" velha (mais de 2 min) não conta como trabalhando', () => {
    const r = estadoDosAgentes(base({ registros: [reg('vitrine', 10 * MIN, 'rodando')] }));
    assert.equal(ag(r, 'vitrine').estado, 'ocioso');
});

test('sem registro nas últimas horas → ocioso (com a última ação real)', () => {
    const r = estadoDosAgentes(base({ registros: [reg('publisher', 30 * H, 'ok', { frase: 'agendou o post das 19h' })] }));
    const p = ag(r, 'publisher');
    assert.equal(p.estado, 'ocioso');
    assert.equal(p.frase, 'agendou o post das 19h');
    assert.equal(p.execucoes24h, 0);
    // Agente sem nenhum registro também é ocioso, e diz isso.
    assert.equal(ag(r, 'perito').estado, 'ocioso');
    assert.equal(ag(r, 'perito').frase, 'Nenhum registro ainda.');
});

test('agentes_config desligado → desligado', () => {
    const r = estadoDosAgentes(base({
        configs: { supervisor: { modo: 'desligado' } },
        registros: [reg('supervisor', 30_000, 'rodando')],
    }));
    assert.equal(ag(r, 'supervisor').estado, 'desligado');
    assert.equal(ag(r, 'supervisor').modo, 'desligado');
});

test('modo ensaio → etiqueta ENSAIO (config ou botão da Laura)', () => {
    let r = estadoDosAgentes(base({ configs: { trafego: { modo: 'ensaio' } } }));
    assert.equal(ag(r, 'trafego').etiqueta, 'ENSAIO');
    r = estadoDosAgentes(base({ modoLaura: 'ensaio', registros: [reg('laura', 5 * MIN, 'ok')] }));
    assert.equal(ag(r, 'laura').etiqueta, 'ENSAIO');
    assert.equal(ag(r, 'laura').modo, 'ensaio');
    assert.match(ag(r, 'laura').observacao || '', /ENSAIO/);
});

test('3 erros seguidos → erro; um sucesso no meio quebra a sequência', () => {
    let r = estadoDosAgentes(base({ registros: [reg('sentinela', 1 * H, 'erro'), reg('sentinela', 2 * H, 'erro'), reg('sentinela', 3 * H, 'erro')] }));
    assert.equal(ag(r, 'sentinela').estado, 'erro');
    assert.equal(ag(r, 'sentinela').erros24h, 3);
    r = estadoDosAgentes(base({ registros: [reg('sentinela', 1 * H, 'erro'), reg('sentinela', 2 * H, 'ok'), reg('sentinela', 3 * H, 'erro')] }));
    assert.notEqual(ag(r, 'sentinela').estado, 'erro');
});

test('aprovação pendente → aguardando você, e acende a luz do maestro', () => {
    const r = estadoDosAgentes(base({
        decisoes: [{ id: 'r1', tipo: 'aprovacao', titulo: 'Campanha', em: atras(H), agenteId: 'trafego' }],
    }));
    assert.equal(ag(r, 'trafego').estado, 'aguardando');
    assert.equal(ag(r, 'trafego').aguardandoVoce, 1);
    assert.equal(r.maestro.aprovacoes, 1);
    assert.equal(r.maestro.luzAcesa, true);
});

test('IA geral desligada desliga só os agentes de IA (consultor e distribuidor seguem)', () => {
    const r = estadoDosAgentes(base({
        configs: { ia_geral: { modo: 'desligado' } },
        registros: [reg('distribuidor', 30_000, 'rodando'), reg('copiloto', 30_000, 'rodando')],
    }));
    assert.equal(r.maestro.iaGeral, 'desligado');
    assert.equal(ag(r, 'copiloto').estado, 'desligado');
    assert.equal(ag(r, 'distribuidor').estado, 'trabalhando');
});

test('sem a tabela agentes_config o interruptor geral aparece como não instalado', () => {
    const r = estadoDosAgentes(base({ configInstalada: false }));
    assert.equal(r.maestro.iaGeral, null);
});

test('Laura com botão desligado mas respondendo clientes não aparece como desligada', () => {
    const r = estadoDosAgentes(base({ modoLaura: 'desligada', registros: [reg('laura', 20 * MIN, 'ok')] }));
    assert.notEqual(ag(r, 'laura').estado, 'desligado');
    assert.match(ag(r, 'laura').observacao || '', /respondeu clientes/);
    const r2 = estadoDosAgentes(base({ modoLaura: 'desligada' }));
    assert.equal(ag(r2, 'laura').estado, 'desligado');
});

test('custo do dia soma só o que é de hoje (Brasília); feed ignora rotina e vem do mais novo', () => {
    const r = estadoDosAgentes(base({
        registros: [
            reg('laura', 1 * H, 'ok', { custoUsd: 0.01 }),
            reg('laura', 2 * H, 'ok', { custoUsd: 0.02 }),
            reg('laura', 20 * H, 'ok', { custoUsd: 5 }), // ontem
            reg('supervisor', 5 * MIN, 'ok', { noFeed: true }),
            reg('distribuidor', 10 * MIN, 'ok', { frase: 'lead → Victor' }),
        ],
    }));
    assert.equal(ag(r, 'laura').custoHojeUsd, 0.03);
    assert.equal(ag(r, 'publisher').custoHojeUsd, null);
    assert.equal(r.maestro.custoHojeUsd, 0.03);
    assert.ok(!r.feed.some(f => f.agenteId === 'supervisor'));
    assert.equal(r.feed[0].frase, 'lead → Victor');
    assert.equal(r.feed[0].agenteNome, 'Distribuidor');
});

test('feed junta ações iguais do mesmo agente (×N) e não esconde as outras', () => {
    const r = estadoDosAgentes(base({
        registros: [
            reg('laura', 1 * MIN, 'ok', { frase: 'respondeu Ana no WhatsApp' }),
            reg('distribuidor', 2 * MIN, 'ok', { frase: 'lead → Victor' }),
            reg('laura', 3 * MIN, 'ok', { frase: 'respondeu Ana no WhatsApp' }),
            reg('laura', 4 * MIN, 'ok', { frase: 'respondeu Ana no WhatsApp' }),
            reg('laura', 10 * H, 'ok', { frase: 'respondeu Ana no WhatsApp' }), // fora da janela de 6 h: item próprio
        ],
    }));
    assert.equal(r.feed.length, 3);
    assert.equal(r.feed[0].agenteId, 'laura');
    assert.equal(r.feed[0].repeticoes, 3);
    assert.equal(r.feed[1].agenteNome, 'Distribuidor');
    assert.equal(r.feed[1].repeticoes, 1);
    assert.equal(r.feed[2].repeticoes, 1);
    // Os números do agente continuam contando cada ação real (as 4 estão nas últimas 24 h).
    assert.equal(ag(r, 'laura').execucoes24h, 4);
});

test('feed junta rascunhos iguais mesmo com durações diferentes', () => {
    const r = estadoDosAgentes(base({
        registros: [
            reg('laura', 1 * MIN, 'ok', { frase: 'rascunhou resposta para Ana · 6,7 s' }),
            reg('laura', 4 * MIN, 'ok', { frase: 'rascunhou resposta para Ana · 5,5 s' }),
        ],
    }));
    assert.equal(r.feed.length, 1);
    assert.equal(r.feed[0].repeticoes, 2);
    assert.equal(r.feed[0].frase, 'rascunhou resposta para Ana · 6,7 s'); // mostra a mais recente
});
