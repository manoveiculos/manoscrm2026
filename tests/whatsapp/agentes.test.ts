// Time de agentes do atendimento, Fases 0 e 1. Rodar: npm run test:time-agentes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANALISTA_PROMPT, ROTULO_SITUACAO, SITUACOES, lerSituacao, pedidoDoAnalista, precisaAnalisar, transcricaoParaAnalista } from '@/lib/whatsapp/ia/analista';
import { CORTE_PADRAO, dataDeCorte, decidirFollowup, type MsgFollowup } from '@/lib/whatsapp/ia/followup';
import { comentaAtendimentoAnterior } from '@/lib/whatsapp/ia/regras';
import { LAURA_CRM_PROMPT } from '@/lib/whatsapp/ia/prompt';
import { chaveDoNome, comRotaPorNome, corpoDoAviso } from '@/lib/avisos/webhookVendedor';

// ── Analista de contexto ────────────────────────────────────────────────────

test('analista: lê o JSON do modelo, mesmo com texto em volta', () => {
    const s = lerSituacao('Aqui está:\n{"situacao":"consultor_levou_para_particular","resumo":"Consultor disse que chamaria no número dele.","proxima_acao":"Perguntar ao cliente como foi o atendimento","quando":null,"confianca":"alta"}\n');
    assert.equal(s.situacao, 'consultor_levou_para_particular');
    assert.equal(s.proximaAcao, 'Perguntar ao cliente como foi o atendimento');
    assert.equal(s.quando, null);
    assert.equal(s.confianca, 'alta');
});

test('analista: resposta fora do formato vira "indefinida", nunca quebra', () => {
    for (const ruim of ['', 'não sei', '{quebrado', '{"situacao":"inventada","confianca":"alta"}', '[]', '{"situacao":123}']) {
        const s = lerSituacao(ruim);
        assert.equal(s.situacao, 'indefinida', ruim);
        assert.equal(s.confianca, 'baixa', ruim);
    }
    // data inválida é descartada; texto longo é cortado; confiança desconhecida vira baixa
    const s = lerSituacao(JSON.stringify({ situacao: 'visita_marcada', resumo: 'x'.repeat(500), proxima_acao: 'ok', quando: 'sábado', confianca: 'altíssima' }));
    assert.equal(s.situacao, 'visita_marcada');
    assert.equal(s.quando, null);
    assert.equal(s.resumo.length, 200);
    assert.equal(s.confianca, 'baixa');
    assert.equal(lerSituacao('{"situacao":"visita_marcada","quando":"2026-11-14","confianca":"media"}').quando, '2026-11-14');
});

test('analista: todo código tem rótulo e aparece no prompt', () => {
    for (const c of SITUACOES) {
        assert.ok(ROTULO_SITUACAO[c], c);
        assert.match(ANALISTA_PROMPT, new RegExp(c), c);
    }
    assert.match(ANALISTA_PROMPT, /NÃO fala com o cliente/);
});

test('analista: transcrição identifica quem falou e ignora mensagem vazia ou de sistema', () => {
    const t = transcricaoParaAnalista([
        { autor: 'vendedor', texto: 'Vou te chamar no meu número', criadaEm: '2026-11-11T22:37:00Z' },
        { autor: 'cliente', texto: 'Tem o Nivus?', criadaEm: '2026-11-11T22:20:00Z' },
        { autor: 'laura', texto: 'Tem sim!', criadaEm: '2026-11-11T22:21:00Z' },
        { autor: 'sistema', texto: 'aviso interno', criadaEm: '2026-11-11T22:22:00Z' },
        { autor: 'cliente', texto: '   ', criadaEm: '2026-11-11T22:23:00Z' },
    ]);
    const linhas = t.split('\n');
    assert.equal(linhas.length, 3);
    assert.match(linhas[0], /^\[11\/11 19:20\] Cliente: Tem o Nivus\?$/);
    assert.match(linhas[1], /Laura: Tem sim!/);
    assert.match(linhas[2], /Consultor: Vou te chamar no meu número/);
    assert.match(pedidoDoAnalista(t, new Date('2026-11-11T23:00:00Z')), /Hoje é quarta-feira, 11\/11\/2026/);
});

test('analista: só analisa conversa quieta há 30 min e que mudou desde a última análise', () => {
    const agora = new Date('2026-11-11T20:00:00Z');
    assert.equal(precisaAnalisar({ ultimaMensagemEm: '2026-11-11T19:50:00Z', situacaoEm: null, agora }), false); // ainda conversando
    assert.equal(precisaAnalisar({ ultimaMensagemEm: '2026-11-11T19:00:00Z', situacaoEm: null, agora }), true);
    assert.equal(precisaAnalisar({ ultimaMensagemEm: '2026-11-11T19:00:00Z', situacaoEm: '2026-11-11T19:40:00Z', agora }), false); // já analisada
    assert.equal(precisaAnalisar({ ultimaMensagemEm: '2026-11-11T19:00:00Z', situacaoEm: '2026-11-11T18:00:00Z', agora }), true);  // mudou depois
    assert.equal(precisaAnalisar({ ultimaMensagemEm: null, situacaoEm: null, agora }), false);
});

// ── Follow-up: data de corte ────────────────────────────────────────────────

test('follow-up: silêncio que começou antes da data de corte nunca recebe toque', () => {
    const msgs: MsgFollowup[] = [
        { autor: 'cliente', texto: 'Tem o Onix?', criadaEm: '2026-11-05T14:00:00Z' },
        { autor: 'laura', texto: 'Tem sim!', criadaEm: '2026-11-05T14:01:00Z' },
    ];
    const base = { status: 'ia', iaSilenciadaAte: null, msgs, enviadosDepoisDaAncora: [], leadFechado: false, temVisitaMarcada: false, lojaAberta: true, agora: new Date('2026-11-13T14:00:00Z') };
    assert.deepEqual(decidirFollowup({ ...base, corte: CORTE_PADRAO }), { acao: 'pular', motivo: 'silêncio anterior ao início do follow-up' });
    assert.deepEqual(decidirFollowup({ ...base, corte: '2026-11-01T00:00:00Z' }), { acao: 'enviar', etapa: 1 });
    assert.equal(dataDeCorte(undefined), CORTE_PADRAO);
    assert.equal(dataDeCorte('lixo'), CORTE_PADRAO);
    assert.equal(dataDeCorte('2026-12-01T03:00:00Z'), '2026-12-01T03:00:00.000Z');
});

// ── Laura: não comentar o atendimento anterior (caso "Canoas") ──────────────

test('Laura: resposta que aponta erro do atendimento anterior é detectada', () => {
    const ruins = [
        'A loja fica na Rua Dom Pedro II, nº 374, em Rio do Sul (a mensagem anterior sobre "Canoas" estava errada).',
        'Corrigindo: o Onix é 2019, não 2020.',
        'A informação anterior estava incorreta, o preço é R$ 59.900.',
        'Desculpa, te passaram errado o endereço.',
    ];
    for (const t of ruins) assert.equal(comentaAtendimentoAnterior(t), true, t);
    const boas = [
        'A loja fica na Rua Dom Pedro II, nº 374, em Rio do Sul.',
        'O Onix é 2019 e está por R$ 59.900.',
        'Anotei que o pagamento é à vista. O Sérgio te responde assim que a loja abrir.',
        'Sua visita anterior foi ótima, né? Quer marcar outra?',
    ];
    for (const t of boas) assert.equal(comentaAtendimentoAnterior(t), false, t);
    assert.match(LAURA_CRM_PROMPT, /NÃO aponte o erro/);
    assert.match(LAURA_CRM_PROMPT, /nunca comente o atendimento anterior/i);
});

// ── Webhook único, roteado pelo nome ────────────────────────────────────────

test('webhook do consultor: chave do Switch é o primeiro nome, minúsculo e sem acento', () => {
    assert.equal(chaveDoNome('Sérgio Silva'), 'sergio');
    assert.equal(chaveDoNome('  VICTOR  '), 'victor');
    assert.equal(chaveDoNome('Alexandre Gorges'), 'alexandre');
    assert.equal(chaveDoNome(null), '');
    const c = corpoDoAviso({ nome: 'Wilson Souza', mensagem: 'Cliente pediu para falar com você.', tipo: 'precisa_humano', meta: { conversa: 'c1' } });
    assert.equal(c.vendedor_lower, 'wilson');
    assert.equal(c.mensagem, 'Cliente pediu para falar com você.');
    assert.equal(c.consultant_name, 'Wilson Souza'); // formato antigo continua indo
    assert.equal(c.message, c.mensagem);
    assert.equal(c.type, 'precisa_humano');
    const antigo = comRotaPorNome({ consultant_name: 'Sérgio', consultant_phone: '0', type: 'lead_arrival', message: 'Lead novo' });
    assert.equal(antigo.vendedor_lower, 'sergio');
    assert.equal(antigo.mensagem, 'Lead novo');
    assert.equal(antigo.type, 'lead_arrival');
});
