// Laura dentro do CRM (etapa B, ensaio): regras, ferramentas e contas do ensaio.
// Rodar: npm run test:laura   (sem banco, sem rede, sem Claude: tudo fictício)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    custoUsd, faltandoNaFicha, iaPodeResponder, inicioDoDiaSP, limiteDiario, limparNome, mesclarFicha,
    modoEfetivo, montarHistorico, nomeDitoPeloCliente, nomeEhGenerico, podeGravarNomeNoLead, respostasReais,
    repeteMensagemAnterior, semelhanca, somarUso, valoresCitados, type MensagemParaIa,
} from '@/lib/whatsapp/ia/regras';
import { contextoDaRodada, LAURA_CRM_PROMPT } from '@/lib/whatsapp/ia/prompt';
import { acharCarro, buscarNoEstoque, idDoCarro } from '@/lib/whatsapp/ia/estoque';
import { resumirRodadas } from '@/lib/whatsapp/ia/ensaioView';
import { FERRAMENTAS, executarFerramenta, type ContextoRodada, type ConversaIa } from '@/lib/whatsapp/ia/ferramentas';
import { horariosDeVisita, horariosDeVisitaDetalhados } from '@/lib/laura/playbook';
import { revisarResposta } from '@/lib/laura/guardrails';
import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import type { HorarioConfig } from '@/lib/services/slaEngine';

// ---------------------------------------------------------------------------
// Modo
// ---------------------------------------------------------------------------

test('modo: sem WA_IA_ATIVA a IA nunca roda, mesmo com o botão ligado', () => {
    assert.equal(modoEfetivo({ ativaEnv: undefined, modoConfig: 'ensaio' }).modo, 'desligada');
    assert.equal(modoEfetivo({ ativaEnv: 'false', modoConfig: 'envia', envioLiberadoEnv: 'true' }).modo, 'desligada');
    assert.equal(modoEfetivo({ ativaEnv: 'true', modoConfig: 'ensaio' }).modo, 'ensaio');
    assert.equal(modoEfetivo({ ativaEnv: 'true', modoConfig: 'desligada' }).modo, 'desligada');
    assert.equal(modoEfetivo({ ativaEnv: 'true', modoConfig: null }).modo, 'desligada');
});

test('modo: "envia" fica bloqueado (vira ensaio) sem WA_IA_ENVIO_LIBERADO=true', () => {
    assert.equal(modoEfetivo({ ativaEnv: 'true', modoConfig: 'envia' }).modo, 'ensaio');
    assert.equal(modoEfetivo({ ativaEnv: 'true', modoConfig: 'envia', envioLiberadoEnv: 'sim' }).modo, 'ensaio');
    assert.equal(modoEfetivo({ ativaEnv: 'true', modoConfig: 'envia', envioLiberadoEnv: 'true' }).modo, 'envia');
});

test('conversa com humano não aciona a IA até o silêncio vencer', () => {
    const agora = new Date('2026-11-06T15:00:00Z');
    assert.equal(iaPodeResponder({ status: 'ia', iaSilenciadaAte: null }, agora), true);
    assert.equal(iaPodeResponder({ status: 'humano', iaSilenciadaAte: null }, agora), false);
    assert.equal(iaPodeResponder({ status: 'humano', iaSilenciadaAte: '2026-11-06T16:00:00Z' }, agora), false);
    assert.equal(iaPodeResponder({ status: 'humano', iaSilenciadaAte: '2026-11-06T14:00:00Z' }, agora), true);
    assert.equal(iaPodeResponder({ status: 'encerrada', iaSilenciadaAte: null }, agora), false);
});

test('limite diário e início do dia em Rio do Sul', () => {
    assert.equal(limiteDiario(undefined), 300);
    assert.equal(limiteDiario('50'), 50);
    assert.equal(limiteDiario('abc'), 300);
    assert.equal(limiteDiario('0'), 300);
    // 06/11 01:30 BRT (04:30Z) → dia começa 06/11 03:00Z; 06/11 00:30Z (05/11 21:30 BRT) → 05/11 03:00Z
    assert.equal(inicioDoDiaSP(new Date('2026-11-06T04:30:00Z')).toISOString(), '2026-11-06T03:00:00.000Z');
    assert.equal(inicioDoDiaSP(new Date('2026-11-06T00:30:00Z')).toISOString(), '2026-11-05T03:00:00.000Z');
});

// ---------------------------------------------------------------------------
// Nome
// ---------------------------------------------------------------------------

test('nome genérico: vazio, telefone, "Lead...", "Analisar Perfil" e o nome do perfil do WhatsApp', () => {
    assert.equal(nomeEhGenerico(null), true);
    assert.equal(nomeEhGenerico('  '), true);
    assert.equal(nomeEhGenerico('47 98888-0001'), true);
    assert.equal(nomeEhGenerico('Lead Google - não especificado'), true);
    assert.equal(nomeEhGenerico('Analisar Perfil'), true);
    assert.equal(nomeEhGenerico('Lead WhatsApp'), true);
    assert.equal(nomeEhGenerico('Cliente'), true);
    assert.equal(nomeEhGenerico('🚗🚗'), true);
    assert.equal(nomeEhGenerico('Kadu Oficina', 'kadu  oficina'), true);
    assert.equal(nomeEhGenerico('Marcos Pereira'), false);
});

test('limparNome: maiúsculas, emoji fora, partículas minúsculas', () => {
    assert.equal(limparNome('  joão  DA silva 😊'), 'João da Silva');
    assert.equal(limparNome('ANA PAULA'), 'Ana Paula');
    assert.equal(limparNome('123'), null);
    assert.equal(limparNome('cliente'), null);
});

test('nome no lead: só substitui vazio/genérico ou o que a própria IA gravou — nunca o que o consultor editou', () => {
    assert.equal(podeGravarNomeNoLead({ nomeAtual: null }), true);
    assert.equal(podeGravarNomeNoLead({ nomeAtual: 'Analisar Perfil' }), true);
    assert.equal(podeGravarNomeNoLead({ nomeAtual: 'Kadu', nomePerfilWhatsapp: 'Kadu' }), true);
    assert.equal(podeGravarNomeNoLead({ nomeAtual: 'Carlos Souza', ultimoNomeDaIa: 'Carlos Souza' }), true);
    // consultor trocou "Carlos" (da IA) por "Carlos Eduardo Souza": fica
    assert.equal(podeGravarNomeNoLead({ nomeAtual: 'Carlos Eduardo Souza', ultimoNomeDaIa: 'Carlos' }), false);
    assert.equal(podeGravarNomeNoLead({ nomeAtual: 'Marcos Pereira' }), false);
});

test('trava contra nome inventado: o primeiro nome precisa estar na fala do cliente', () => {
    const falas = ['oi, tem o onix ainda?', 'Aqui é o Carlos, de Ibirama'];
    assert.equal(nomeDitoPeloCliente('Carlos Souza', falas), true);
    assert.equal(nomeDitoPeloCliente('Marcos', falas), false);
    assert.equal(nomeDitoPeloCliente('Ana', ['banana']), false); // palavra inteira
    assert.equal(nomeDitoPeloCliente('José', ['sou o jose']), true); // sem acento também vale
});

// ---------------------------------------------------------------------------
// Ficha
// ---------------------------------------------------------------------------

test('ficha: o que falta, na ordem da conversa; à vista não pede entrada', () => {
    assert.deepEqual(faltandoNaFicha({}), ['nome', 'carro_interesse', 'forma_pagamento', 'entrada', 'troca', 'prazo', 'cidade']);
    assert.deepEqual(
        faltandoNaFicha({ nome: 'Carlos', carro_interesse: 'Onix', forma_pagamento: 'a_vista', tem_troca: false, prazo: 'este mês', cidade: 'Ibirama' }),
        [],
    );
    assert.deepEqual(faltandoNaFicha({ nome: 'Carlos', carro_interesse: 'Onix', forma_pagamento: 'financiado', tem_troca: true, troca: { modelo: 'Gol' } }),
        ['entrada', 'troca', 'prazo', 'cidade']);
});

test('ficha: mesclar nunca apaga com vazio e junta os dados da troca', () => {
    const a = mesclarFicha({ nome: 'Carlos', entrada: '20 mil', troca: { modelo: 'Gol' } }, { nome: '', entrada: null, troca: { ano: '2015', cor: ' prata ' } });
    assert.equal(a.nome, 'Carlos');
    assert.equal(a.entrada, '20 mil');
    assert.deepEqual(a.troca, { modelo: 'Gol', ano: '2015', cor: 'prata' });
    assert.equal(a.tem_troca, true);
});

// ---------------------------------------------------------------------------
// Histórico, contexto e custo
// ---------------------------------------------------------------------------

const msg = (autor: MensagemParaIa['autor'], texto: string, min: number, extra: Partial<MensagemParaIa> = {}): MensagemParaIa => ({
    autor, tipo: 'texto', texto, legenda: null, transcricao: null, midiaNome: null, apagadaEm: null,
    criadaEm: new Date(Date.UTC(2026, 10, 6, 15, min)).toISOString(), ...extra,
});

test('histórico: cliente = user, Laura/vendedor = assistant, aviso do sistema fora, começa e termina no cliente', () => {
    const turnos = montarHistorico([
        msg('laura', 'Olá! Sou a Laura', 0),
        msg('cliente', 'oi', 1),
        msg('cliente', 'tem onix?', 2),
        msg('sistema', 'Novo lead para você', 3),
        msg('laura', 'Tem sim! Com quem eu falo?', 4),
        msg('cliente', '', 5, { tipo: 'audio', transcricao: 'sou o carlos' }),
        msg('cliente', '', 6, { tipo: 'imagem', legenda: 'meu gol' }),
    ]);
    assert.deepEqual(turnos.map(t => t.role), ['user', 'assistant', 'user']);
    assert.equal(turnos[0].content, 'oi\ntem onix?');
    assert.equal(turnos[2].content, '[áudio] sou o carlos\n[foto] meu gol');
});

test('contexto da rodada: hora de Rio do Sul, ficha e o que falta', () => {
    const bloco = contextoDaRodada({
        agora: new Date('2026-11-06T17:00:00Z'), lojaAberta: true, nomePerfilWhatsapp: 'Kadu',
        ficha: { nome: 'Carlos', carro_interesse: 'Onix' },
    });
    assert.match(bloco, /^<contexto_do_crm>/);
    assert.match(bloco, /14:00/);
    assert.match(bloco, /Loja aberta/);
    assert.match(bloco, /nome: Carlos; carro_interesse: Onix/);
    assert.match(bloco, /Falta na ficha: forma de pagamento/);
    // 11/11: a Laura do CRM não manda mais "sujeito a análise de crédito"
    assert.match(LAURA_CRM_PROMPT, /Não use frases de aviso como "sujeito a análise de crédito"/);
    assert.match(LAURA_CRM_PROMPT, /NÃO REPITA/);
    assert.match(LAURA_CRM_PROMPT, /UMA pergunta por mensagem/);
    // ensaio de 06/11: corrigir erro de outro atendente sem comentar o atendimento anterior
    assert.match(LAURA_CRM_PROMPT, /nunca comente o atendimento anterior/i);
});

test('custo do Sonnet 5.5: entrada, saída e cache', () => {
    const u = somarUso({ input_tokens: 1000, output_tokens: 200 }, { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 });
    // 1500*2 + 300*10 + 2000*0,2 = 3000 + 3000 + 400 = 6400 / 1e6
    assert.equal(custoUsd(u), 0.0064);
});

test('valores que o cliente citou podem ser repetidos pela Laura', () => {
    assert.deepEqual(valoresCitados(['tenho 20 mil de entrada', 'até R$ 65.000', 'ano 2018']).sort((a, b) => a - b), [2018, 20000, 65000]);
});

test('ensaio: resposta real é a da loja depois do gatilho e antes da próxima fala do cliente', () => {
    const ms = [
        { id: 'a', autor: 'cliente' as const, criadaEm: '2026-11-06T15:00:00Z' },
        { id: 'b', autor: 'laura' as const, criadaEm: '2026-11-06T15:00:20Z' },
        { id: 'c', autor: 'sistema' as const, criadaEm: '2026-11-06T15:00:30Z' },
        { id: 'd', autor: 'vendedor' as const, criadaEm: '2026-11-06T15:01:00Z' },
        { id: 'e', autor: 'cliente' as const, criadaEm: '2026-11-06T15:02:00Z' },
        { id: 'f', autor: 'laura' as const, criadaEm: '2026-11-06T15:02:30Z' },
    ];
    assert.deepEqual(respostasReais('2026-11-06T15:00:00Z', ms).map(m => m.id), ['b', 'd']);
});

test('resumo do ensaio: rascunhos, barrados, tempo médio e custo por conversa', () => {
    const r = resumirRodadas([
        { conversa_id: 'c1', status: 'ok', violacoes: [], tempo_ms: 6000, custo_usd: '0.0030' },
        { conversa_id: 'c1', status: 'ok', violacoes: ['simulou_parcela'], tempo_ms: 8000, custo_usd: 0.004 },
        { conversa_id: 'c2', status: 'erro', violacoes: null, tempo_ms: 1000, custo_usd: 0.001 },
        { conversa_id: 'c3', status: 'pulada', violacoes: null, tempo_ms: null, custo_usd: null },
    ], '2026-11-06T03:00:00Z');
    assert.equal(r.rodadas, 3);
    assert.equal(r.ok, 2);
    assert.equal(r.erro, 1);
    assert.equal(r.puladas, 1);
    assert.equal(r.barradas, 1);
    assert.deepEqual(r.violacoes, { simulou_parcela: 1 });
    assert.equal(r.tempoMedioMs, 7000);
    assert.equal(r.custoTotalUsd, 0.008);
    assert.equal(r.conversas, 2);
    assert.equal(r.custoPorConversaUsd, 0.004);
});

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

const ESTOQUE: AltimusVehicle[] = [
    { id_externo: '101', marca: 'Chevrolet', modelo: 'Onix', versao: 'LT 1.0', ano: 2020, preco: 62900, km: 58000, cambio: 'Manual', cor: 'Prata', fotos: ['https://ex/1.jpg', 'https://ex/2.jpg', 'https://ex/3.jpg', 'https://ex/4.jpg', 'https://ex/5.jpg'] },
    { id_externo: '102', marca: 'Toyota', modelo: 'Hilux', versao: 'SRV 2.8 4x4', ano: 2019, preco: 189900, km: 90000, cambio: 'Automático', cor: 'Branca', fotos: [] },
    { id_externo: '103', marca: 'Hyundai', modelo: 'HB20', versao: 'Comfort', ano: 2018, preco: 54900, km: 70000, cambio: 'Manual', cor: 'Branca' },
    { marca: 'Fiat', modelo: 'Uno', ano: 2012, preco: null },
];

test('estoque: acha pelo modelo, devolve preço e km escritos e ignora carro sem preço', () => {
    const r = buscarNoEstoque(ESTOQUE, { consulta: 'tem o onix?' });
    assert.equal(r.encontrados.length, 1);
    assert.deepEqual(r.encontrados[0], {
        id: '101', carro: 'Chevrolet Onix LT 1.0', ano: 2020, preco: 'R$ 62.900', km: '58.000 km',
        cambio: 'Manual', cor: 'Prata', fotos: 5, tipo: 'hatch',
    });
    assert.equal(buscarNoEstoque(ESTOQUE, { consulta: 'uno' }).encontrados.length, 0);
});

test('estoque: nada bate → parecidos na faixa de preço (até 10% acima do teto, do mais caro ao mais barato)', () => {
    const r = buscarNoEstoque(ESTOQUE, { consulta: 'corolla', precoMax: 60000 });
    assert.equal(r.encontrados.length, 0);
    assert.deepEqual(r.parecidos.map(c => c.id), ['101', '103']);
    assert.deepEqual(buscarNoEstoque(ESTOQUE, { consulta: 'corolla', precoMax: 55000 }).parecidos.map(c => c.id), ['103']);
    assert.equal(acharCarro(ESTOQUE, '102')?.modelo, 'Hilux');
    assert.equal(acharCarro(ESTOQUE, 'xx'), null);
    assert.equal(idDoCarro(ESTOQUE[3]), 'fiat-uno-2012');
});

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

const HORAS: HorarioConfig = { seg_sex: [8, 18], sab: [8, 12], tz: 'America/Sao_Paulo' };

test('horários de visita: mesma lista com e sem a data exata', () => {
    const agora = new Date('2026-11-06T13:00:00Z'); // sex 10:00 BRT
    const det = horariosDeVisitaDetalhados(HORAS, new Set(), agora, 3);
    assert.deepEqual(det.map(h => h.rotulo), horariosDeVisita(HORAS, new Set(), agora, 3));
    assert.equal(det[0].rotulo, 'hoje às 14h');
    assert.equal(det[0].iso, '2026-11-06T17:00:00.000Z');
});

// ---------------------------------------------------------------------------
// Ferramentas contra um banco fictício
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

function bancoFicticio(tabelas: Record<string, Linha[]>) {
    const updates: { tabela: string; dados: Linha; linhas: number }[] = [];
    const from = (tabela: string) => {
        let op: 'select' | 'update' = 'select';
        let dados: Linha = {};
        const filtros: ((r: Linha) => boolean)[] = [];
        const linhas = () => (tabelas[tabela] || []).filter(r => filtros.every(f => f(r)));
        const b = {
            select: () => b,
            update: (d: Linha) => { op = 'update'; dados = d; return b; },
            eq: (c: string, v: unknown) => { filtros.push(r => String(r[c]) === String(v)); return b; },
            is: (c: string, v: unknown) => { filtros.push(r => (r[c] ?? null) === v); return b; },
            maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
            then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => {
                const ls = linhas();
                if (op === 'update') { ls.forEach(r => Object.assign(r, dados)); updates.push({ tabela, dados, linhas: ls.length }); }
                return Promise.resolve({ data: null, error: null, count: ls.length }).then(ok, falha);
            },
        };
        return b;
    };
    const rpcs: { nome: string; args: Linha }[] = [];
    const rpc = async (nome: string, args: Linha) => { rpcs.push({ nome, args }); return { data: nome === 'atualizar_cidade_lead' ? 1 : { ok: true, aplicados: 1 }, error: null }; };
    return { supabase: { from, rpc } as unknown as ContextoRodada['supabase'], updates, tabelas, rpcs };
}

function contexto(banco: ReturnType<typeof bancoFicticio>, conversa: Partial<ConversaIa>, textosDoCliente: string[]): ContextoRodada {
    const c: ConversaIa = {
        id: 'conv-1', lead_uid: 'leads_distribuicao_crm_26:10', nome_contato: 'Kadu', nome_cliente: null,
        nome_cliente_origem: null, nome_ia_no_lead: null, cidade: null, ficha: {}, assigned_consultant_id: null,
        telefone_key: '47988880001', remote_jid: null, ...conversa,
    };
    return {
        supabase: banco.supabase, modo: 'ensaio', agora: new Date('2026-11-06T13:00:00Z'), conversa: c,
        textosDoCliente, estoque: ESTOQUE, horario: { horas: HORAS, feriados: new Set() },
        ficha: c.ficha, fotos: [], agendamento: null, passagem: null, chamadas: [], gravacoes: [],
    };
}

test('as ferramentas pedidas existem para o Claude (5 do atendimento + encerrar_contato)', () => {
    assert.deepEqual(FERRAMENTAS.map(f => f.name), ['buscar_estoque', 'enviar_fotos', 'salvar_ficha', 'agendar_visita', 'encerrar_contato', 'passar_para_consultor']);
});

test('salvar_ficha (identificação ligada): nome, cidade e carro vão pelas funções do banco, que aplicam a prioridade', async () => {
    process.env.WA_IDENTIFICACAO = 'on';
    try {
        const banco = bancoFicticio({ wa_conversas: [{ id: 'conv-1' }] });
        const ctx = contexto(banco, {}, ['oi', 'sou o carlos, de ibirama']);
        const { saida, erro } = await executarFerramenta('salvar_ficha', { nome: 'carlos', cidade: 'Ibirama', carro_interesse: 'onix 2018' }, ctx);
        assert.equal(erro, false);
        assert.deepEqual(saida.anotado, ['nome', 'cidade', 'carro_interesse']);
        assert.equal(banco.tabelas.wa_conversas[0].ficha.carro_interesse, 'onix 2018');
        const nome = banco.rpcs.find(r => r.nome === 'atualizar_nome_lead')!;
        assert.equal(nome.args.p_nome, 'Carlos');
        assert.equal(nome.args.p_origem, 'cliente_disse');
        assert.equal(nome.args.p_por, 'laura-crm');
        assert.equal(banco.rpcs.find(r => r.nome === 'atualizar_cidade_lead')!.args.p_cidade, 'Ibirama');
        assert.ok(banco.rpcs.some(r => r.nome === 'registrar_interesse_lead' && r.args.p_modelo_chave === 'onix' && r.args.p_origem === 'cliente_citou'));
        // o lead nunca é escrito direto por aqui
        assert.equal(banco.updates.filter(u => u.tabela.startsWith('leads_')).length, 0);
        assert.ok((saida.falta as string[]).includes('prazo de compra'));
    } finally { delete process.env.WA_IDENTIFICACAO; }
});

test('salvar_ficha (identificação desligada, padrão): só a conversa guarda o nome; o lead não é tocado', async () => {
    const banco = bancoFicticio({
        leads_distribuicao_crm_26: [{ id: 10, nome: 'Analisar Perfil', cidade: null }],
        wa_conversas: [{ id: 'conv-1' }],
    });
    const ctx = contexto(banco, {}, ['sou o carlos']);
    await executarFerramenta('salvar_ficha', { nome: 'carlos', cidade: 'Ibirama' }, ctx);
    const conv = banco.tabelas.wa_conversas[0];
    assert.equal(conv.nome_cliente, 'Carlos');
    assert.equal(conv.nome_cliente_origem, 'ia');
    assert.equal(banco.tabelas.leads_distribuicao_crm_26[0].nome, 'Analisar Perfil');
    assert.equal(banco.rpcs.length, 0);
});

test('salvar_ficha: nome que o cliente não disse não é anotado; nome manual da conversa não é trocado', async () => {
    const banco = bancoFicticio({ leads_distribuicao_crm_26: [{ id: 10, nome: null }], wa_conversas: [{ id: 'conv-1' }] });
    const ctx = contexto(banco, {}, ['tem onix?']);
    const r = await executarFerramenta('salvar_ficha', { nome: 'Kadu' }, ctx);
    assert.match(String((r.saida.avisos as string[])[0]), /só anote o nome que o cliente escreveu/);
    assert.equal(banco.tabelas.leads_distribuicao_crm_26[0].nome, null);

    const banco2 = bancoFicticio({ wa_conversas: [{ id: 'conv-1', nome_cliente: 'Dona Maria' }] });
    const ctx2 = contexto(banco2, { lead_uid: null, nome_cliente: 'Dona Maria', nome_cliente_origem: 'manual' }, ['me chamo maria']);
    await executarFerramenta('salvar_ficha', { nome: 'Maria' }, ctx2);
    assert.equal(banco2.tabelas.wa_conversas[0].nome_cliente, 'Dona Maria');
    assert.equal(ctx2.ficha.nome, 'Maria'); // fica na ficha para o consultor
});

test('enviar_fotos no ensaio: só anota as URLs (nada sai)', async () => {
    const banco = bancoFicticio({});
    const ctx = contexto(banco, {}, []);
    const r = await executarFerramenta('enviar_fotos', { veiculo_id: '101', quantidade: 3 }, ctx);
    assert.equal(r.saida.fotos_enviadas, 3);
    assert.deepEqual(ctx.fotos, [{ veiculo_id: '101', carro: 'Chevrolet Onix LT 1.0', urls: ['https://ex/1.jpg', 'https://ex/2.jpg', 'https://ex/3.jpg'] }]);
    assert.equal(banco.updates.length, 0);
    assert.equal((await executarFerramenta('enviar_fotos', { veiculo_id: '102' }, ctx)).erro, true); // anúncio sem foto
});

test('agendar_visita: sem horário lista os livres; com horário valida loja aberta e antecedência', async () => {
    const ctx = contexto(bancoFicticio({}), {}, []);
    const lista = await executarFerramenta('agendar_visita', {}, ctx);
    assert.equal((lista.saida.horarios as unknown[]).length, 3);
    assert.equal((await executarFerramenta('agendar_visita', { horario: '2026-11-06T11:00:00-03:00' }, ctx)).erro, true); // < 2 h
    assert.equal((await executarFerramenta('agendar_visita', { horario: '2026-11-07T15:00:00-03:00' }, ctx)).erro, true); // sábado à tarde
    const ok = await executarFerramenta('agendar_visita', { horario: '2026-11-09T10:00:00-03:00' }, ctx);
    assert.equal(ok.erro, false);
    assert.equal(ctx.agendamento?.iso, '2026-11-09T13:00:00.000Z');
    assert.match(String(ctx.agendamento?.rotulo), /seg.*09\/11 às 10h/);
});

test('passar_para_consultor no ensaio: só anota', async () => {
    const banco = bancoFicticio({});
    const ctx = contexto(banco, {}, []);
    await executarFerramenta('passar_para_consultor', { motivo: 'pediu_pessoa', resumo: 'Carlos quer falar com alguém sobre o Onix' }, ctx);
    assert.deepEqual(ctx.passagem, { motivo: 'pediu_pessoa', resumo: 'Carlos quer falar com alguém sobre o Onix' });
    assert.equal(banco.updates.length, 0);
    assert.equal(ctx.chamadas.length, 1);
});

// ---------------------------------------------------------------------------
// Humanização (11/11): sem frase de crédito, sem repetir
// ---------------------------------------------------------------------------

test('Laura do CRM não recebe "(sujeito a análise de crédito)"; o n8n (padrão) continua recebendo', () => {
    const pergunta = 'Você pretende pagar à vista, financiar ou dar um carro na troca?';
    assert.equal(revisarResposta(pergunta, [], [], { fraseDeCredito: false }).texto_seguro, pergunta);
    assert.match(revisarResposta(pergunta, []).texto_seguro, /sujeito a análise de crédito/);
    // as regras de segurança continuam valendo sem a frase
    assert.equal(revisarResposta('Fica em 48x de R$ 1.200', [], [], { fraseDeCredito: false }).ok, false);
});

test('repetição: mesma pergunta ou mesmo conteúdo das últimas mensagens da loja', () => {
    const antes = [
        'Mandei as fotos da Haval preta. É a GWM Haval H6 34 1.5 AWD híbrida 2025, com 29.000 km, por R$ 219.900. Você pretende pagar à vista, financiar ou dar um carro na troca?',
        'Oi! Só ajustando: o valor certo do Onix 2025 é R$ 88.900.',
    ];
    // mesma pergunta de pagamento, com outras palavras na frente
    assert.equal(repeteMensagemAnterior('Show! E você pretende pagar à vista, financiar ou dar um carro na troca?', antes), true);
    // mesmo carro e preço de novo
    assert.equal(repeteMensagemAnterior('A GWM Haval H6 34 1.5 AWD híbrida 2025 tem 29.000 km e custa R$ 219.900.', antes), true);
    // resposta nova de verdade
    assert.equal(repeteMensagemAnterior('Perfeito! Quer passar na loja amanhã às 10h pra ver ela de perto?', antes), false);
    assert.equal(repeteMensagemAnterior('Tudo certo, qual a sua cidade?', antes), false);
    assert.equal(repeteMensagemAnterior('Oi!', []), false);
    assert.ok(semelhanca('Onix 2018 prata', 'o Onix 2018 prata automático') > 0.9);
});
