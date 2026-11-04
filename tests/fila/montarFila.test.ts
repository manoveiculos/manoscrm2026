// Teste da regra da Minha Fila com os dados fictícios da prévia.
// Rodar: npm run test:fila
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFila, cadenciaVencida, carroCompativel, type LeadFila } from '@/lib/fila/montarFila';
import { AGORA_EXEMPLO, entradaExemplo } from '@/app/dev/fila/exemplo';
import { secoesDoMenu, itensBarraInferior } from '@/components/v2/menuConfig';
import { perfilDoConsultor } from '@/lib/perfil';

const nomesDa = (fila: ReturnType<typeof montarFila>, secao: string) =>
    fila.secoes.find(s => s.id === secao)!.cards.map(c => c.nome);

test('cada lead cai na seção certa, na ordem da spec', () => {
    const fila = montarFila(entradaExemplo());
    assert.deepEqual(fila.secoes.map(s => s.id), [
        'quente_sem_resposta', 'visitas', 'cliente_voltou', 'followup_vencido', 'em_conversa', 'recuperavel', 'em_aberto',
    ]);
    assert.deepEqual(nomesDa(fila, 'quente_sem_resposta'), ['Marcos Fictício']);
    assert.deepEqual(nomesDa(fila, 'visitas'), ['Juliana Fictícia']);
    assert.deepEqual(nomesDa(fila, 'cliente_voltou'), ['Pedro Fictício']);
    // Mais atrasado primeiro: retorno de ontem 17h, D3 de hoje cedo, D0 de 40 min.
    assert.deepEqual(nomesDa(fila, 'followup_vencido'), ['Ricardo Fictício', 'Fernanda Fictícia', 'Lucas Fictício']);
    assert.deepEqual(nomesDa(fila, 'em_conversa'), ['Beatriz Fictícia']);
    assert.deepEqual(nomesDa(fila, 'recuperavel'), ['Sandra Fictícia']);
    assert.deepEqual(nomesDa(fila, 'em_aberto'), ['Rafael Fictício']);
});

test('lead com retorno marcado para depois sai da fila e é contado', () => {
    const fila = montarFila(entradaExemplo());
    const todos = fila.secoes.flatMap(s => s.cards.map(c => c.nome));
    assert.ok(!todos.includes('Tiago Fictício'));
    assert.equal(fila.agendadosDepois, 1);
});

test('nenhum lead aparece duas vezes', () => {
    const fila = montarFila(entradaExemplo());
    const uids = fila.secoes.flatMap(s => s.cards.map(c => c.uid));
    assert.equal(new Set(uids).size, uids.length);
});

test('lead vendido ou perdido não entra na fila (exceto recuperável)', () => {
    const e = entradaExemplo();
    e.leads[0].status = 'vendido';
    e.leads[1].status = 'perdido';
    const fila = montarFila(e);
    const todos = fila.secoes.flatMap(s => s.cards.map(c => c.nome));
    assert.ok(!todos.includes('Marcos Fictício'));
    // Juliana tem visita, mas perdida não volta para a fila.
    assert.ok(!todos.includes('Juliana Fictícia'));
});

test('quente sem resposta passa na frente do retorno marcado', () => {
    const e = entradaExemplo();
    e.retornos.push({ id: 'x', leadUid: e.leads[0].uid, quando: new Date(AGORA_EXEMPLO + 86_400_000).toISOString(), nota: null });
    const fila = montarFila(e);
    assert.deepEqual(nomesDa(fila, 'quente_sem_resposta'), ['Marcos Fictício']);
});

test('próximo passo usa o 1º card e a orientação gravada pela IA', () => {
    const fila = montarFila(entradaExemplo());
    assert.ok(fila.proximoPasso);
    assert.match(fila.proximoPasso!.texto, /^Responda Marcos agora: lead quente esperando há 32 min\./);
    assert.match(fila.proximoPasso!.texto, /IA: Ofereça visita no sábado/);
});

test('cadência: D0 só vence depois de 15 min; contato depois do marco zera', () => {
    const agora = AGORA_EXEMPLO;
    const base: LeadFila = {
        uid: 'leads_distribuicao_crm_26:1', table: 'leads_distribuicao_crm_26', nativeId: '1', nome: 'X', telefone: null, carro: null,
        status: 'received', criadoEm: new Date(agora - 10 * 60_000).toISOString(), atendimentoIniciadoEm: null,
        ultimaInteracaoHumana: null, primeiroContatoEm: null, primeiroContatoCanal: null, qualificacao: {}, orientacaoIA: null,
    };
    assert.equal(cadenciaVencida(base, agora), null);
    assert.equal(cadenciaVencida({ ...base, criadoEm: new Date(agora - 20 * 60_000).toISOString() }, agora)?.marco, 0);
    const d7 = { ...base, criadoEm: new Date(agora - 8 * 86_400_000).toISOString() };
    assert.equal(cadenciaVencida(d7, agora)?.marco, 7);
    assert.equal(cadenciaVencida({ ...d7, ultimaInteracaoHumana: new Date(agora - 12 * 3_600_000).toISOString() }, agora), null);
});

test('carro compatível pelo modelo', () => {
    const estoque = [{ marca: 'CHEVROLET', modelo: 'ONIX PLUS LTZ', ano: '2021', preco: 'R$ 79.900' }];
    assert.equal(carroCompativel('Onix 2019 até 60 mil', estoque), 'CHEVROLET ONIX PLUS LTZ 2021 · R$ 79.900');
    assert.equal(carroCompativel('HB20', estoque), null);
});

test('menu: vendedor vê só os 5 itens; gestor +4; admin em 5 grupos', () => {
    const vendedor = secoesDoMenu({ perfil: 'vendedor', email: 'x@exemplo.test' });
    assert.deepEqual(vendedor.flatMap(s => s.itens.map(i => i.label)), ['Minha Fila', 'Conversas', 'Agenda', 'Meus Leads', 'Perfil']);
    assert.equal(itensBarraInferior({ perfil: 'vendedor', email: 'x@exemplo.test' }).length, 5);

    const gestor = secoesDoMenu({ perfil: 'gestor', email: 'g@exemplo.test' }).flatMap(s => s.itens.map(i => i.label));
    assert.deepEqual(gestor, ['Minha Fila', 'Conversas', 'Agenda', 'Meus Leads', 'Perfil', 'Inbox geral', 'Painel 48h', 'Perdidos', 'Conversão']);

    const admin = secoesDoMenu({ perfil: 'admin', email: 'alexandre_gorges@hotmail.com' });
    assert.deepEqual(admin.map(s => s.label), ['Vendas', 'Compras', 'Financeiro', 'Gestão', 'Marketing']);
    // Os 27 itens de antes + Minha Fila + Conversas.
    assert.equal(admin.reduce((n, s) => n + s.itens.length, 0), 29);
});

test('menu: regras por pessoa continuam (Camila, Paulo, Wilson)', () => {
    assert.deepEqual(secoesDoMenu({ perfil: 'vendedor', email: 'camilarenatta@hotmail.com' }).flatMap(s => s.itens.map(i => i.href)), ['/admin/cobranca']);
    assert.deepEqual(secoesDoMenu({ perfil: 'vendedor', email: 'paulo@manoscrm.com' }).flatMap(s => s.itens.map(i => i.href)), ['/compras', '/repasse']);
    const wilson = secoesDoMenu({ perfil: 'vendedor', email: 'dultra49@gmail.com' }).flatMap(s => s.itens.map(i => i.href));
    assert.ok(wilson.includes('/negociacao-terceiros') && wilson.includes('/fila'));
    // Admin que não é o Alexandre não vê o Milhão.
    const outroAdmin = secoesDoMenu({ perfil: 'admin', email: 'outro@exemplo.test' }).flatMap(s => s.itens.map(i => i.href));
    assert.ok(!outroAdmin.includes('/admin/milhao'));
});

test('perfil: role e e-mail do Alexandre', () => {
    assert.equal(perfilDoConsultor('vendedor', 'x@exemplo.test'), 'vendedor');
    assert.equal(perfilDoConsultor('', 'x@exemplo.test'), 'vendedor');
    assert.equal(perfilDoConsultor('manager', 'x@exemplo.test'), 'gestor');
    assert.equal(perfilDoConsultor('admin', 'x@exemplo.test'), 'admin');
    assert.equal(perfilDoConsultor(null, 'Alexandre_Gorges@hotmail.com'), 'admin');
});
