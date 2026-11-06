// Regras da tela Conversas (Fase 3, leitura) com os dados fictícios da prévia.
// Rodar: npm run test:conversas
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    acaoDeAcesso, agruparPorDia, contarFiltros, filtrarConversas, formatarBytes, formatarDuracao, ladoDoBalao,
    mesclarMensagens, quandoNaLista, resumoMensagem, rotuloAutor, rotuloDia, separarReacoes, telefoneExibicao,
    telefoneKeyDe, telefoneLink,
} from '@/lib/whatsapp/conversasView';
import { AGORA_EXEMPLO, CONVERSAS_EXEMPLO, mensagensExemplo } from '@/app/dev/conversas/exemplo';

const agora = new Date(AGORA_EXEMPLO);

test('telefone completo para o vendedor (sem máscara)', () => {
    assert.equal(telefoneExibicao('47988880001'), '(47) 98888-0001');
    assert.equal(telefoneExibicao('4733001352'), '(47) 3300-1352');
    assert.equal(telefoneExibicao('14155550100123'), '+14155550100123');
    assert.equal(telefoneLink('47988880001'), '5547988880001');
    assert.equal(telefoneKeyDe('5547977770003'), '47977770003');
});

test('formatos de duração, tamanho e data no fuso de Rio do Sul', () => {
    assert.equal(formatarDuracao(9), '0:09');
    assert.equal(formatarDuracao(75), '1:15');
    assert.equal(formatarDuracao(null), '');
    assert.equal(formatarBytes(88_123), '86 KB');
    assert.equal(formatarBytes(5_242_880), '5,0 MB');
    // 06/11 14:00 BRT: 06/11 00:30 BRT é "Hoje", 05/11 23:30 BRT é "Ontem"
    assert.equal(rotuloDia('2026-11-06T03:30:00Z', agora), 'Hoje');
    assert.equal(rotuloDia('2026-11-06T02:30:00Z', agora), 'Ontem');
    assert.equal(rotuloDia('2026-11-02T15:00:00Z', agora), '02/11/2026');
    assert.equal(quandoNaLista('2026-11-06T16:56:00Z', agora), '13:56');
    assert.equal(quandoNaLista('2026-11-02T15:00:00Z', agora), '02/11');
});

test('rótulo de autor: Laura identificada como IA', () => {
    assert.equal(rotuloAutor('laura'), 'Laura (IA)');
    assert.equal(rotuloAutor('cliente', 'Mariana Teste'), 'Mariana Teste');
    assert.equal(rotuloAutor('cliente', null), 'Cliente');
    assert.equal(rotuloAutor('sistema'), 'Aviso do CRM');
});

test('resumo da última mensagem por tipo', () => {
    const base = { texto: null, legenda: null, duracaoS: null, midiaNome: null, apagadaEm: null, transcricao: null };
    assert.equal(resumoMensagem({ ...base, tipo: 'imagem' }), '📷 Foto');
    assert.equal(resumoMensagem({ ...base, tipo: 'audio', duracaoS: 7 }), '🎤 Áudio 0:07');
    assert.equal(resumoMensagem({ ...base, tipo: 'audio', transcricao: 'quero ver o carro' }), '🎤 quero ver o carro');
    assert.equal(resumoMensagem({ ...base, tipo: 'documento', midiaNome: 'cnh.pdf' }), '📄 cnh.pdf');
    assert.equal(resumoMensagem({ ...base, tipo: 'texto', texto: 'oi', apagadaEm: '2026-11-06T00:00:00Z' }), '🚫 Mensagem apagada');
    assert.equal(resumoMensagem({ ...base, tipo: 'reacao', texto: '👍' }), 'Reagiu 👍');
    assert.equal(resumoMensagem({ ...base, tipo: 'texto', texto: 'x'.repeat(100) }, 10).length, 10);
});

test('filtros da lista: não lidas, aguardando eu, IA atendendo, quentes e busca', () => {
    const l = CONVERSAS_EXEMPLO;
    assert.equal(filtrarConversas(l, 'todas').length, 6);
    assert.deepEqual(filtrarConversas(l, 'nao_lidas').map(c => c.nome), ['Mariana Teste', 'Ana Fictícia']);
    assert.deepEqual(filtrarConversas(l, 'aguardando').map(c => c.nome), ['Mariana Teste', 'Ana Fictícia', null]);
    assert.equal(filtrarConversas(l, 'ia').length, 4);
    assert.deepEqual(filtrarConversas(l, 'quentes').map(c => c.nome), ['Mariana Teste', 'Paulo Modelo']);
    assert.deepEqual(filtrarConversas(l, 'todas', 'hilux').map(c => c.nome), ['Roberto Exemplo']);
    assert.deepEqual(filtrarConversas(l, 'todas', '98888-0004').map(c => c.telefoneKey), ['47988880004']);
    assert.equal(filtrarConversas(l, 'todas', '98').length, 0); // menos de 3 dígitos não busca telefone
    assert.deepEqual(contarFiltros(l), { todas: 6, nao_lidas: 2, aguardando: 3, ia: 4, quentes: 2 });
});

test('reação vira emoji na mensagem alvo, não balão', () => {
    const msgs = mensagensExemplo();
    const { visiveis, reacoes } = separarReacoes(msgs);
    assert.equal(visiveis.length, msgs.length - 1);
    assert.ok(!visiveis.some(m => m.tipo === 'reacao'));
    const alvo = msgs.find(m => m.texto?.startsWith('Ótimo! Qual seria'))!;
    assert.deepEqual(reacoes[alvo.providerId], ['👍']);
});

test('reação: vale a última de cada autor; tirar a reação some com o emoji', () => {
    const msgs = mensagensExemplo();
    const alvo = msgs.find(m => m.texto?.startsWith('Ótimo! Qual seria'))!;
    const tirou = { ...msgs.find(m => m.tipo === 'reacao')!, id: 'r2', texto: '', criadaEm: '2026-11-06T17:00:00Z' };
    const { reacoes } = separarReacoes([...msgs, tirou]);
    assert.equal(reacoes[alvo.providerId], undefined);
});

test('reação a mensagem que não está carregada vira balão pequeno', () => {
    const [r] = mensagensExemplo().filter(m => m.tipo === 'reacao');
    const { visiveis } = separarReacoes([{ ...r, citadaId: 'NAO-CARREGADA' }]);
    assert.equal(visiveis.length, 1);
});

test('agrupa por dia em ordem e mescla sem duplicar', () => {
    const msgs = mensagensExemplo();
    const grupos = agruparPorDia([...msgs].reverse(), agora);
    assert.deepEqual(grupos.map(g => g.dia), ['Ontem', 'Hoje']);
    assert.equal(grupos[0].mensagens.length + grupos[1].mensagens.length, msgs.length);
    const mescladas = mesclarMensagens(msgs.slice(0, 5), msgs.slice(3));
    assert.equal(mescladas.length, msgs.length);
    assert.deepEqual(mescladas.map(m => m.id), msgs.map(m => m.id));
});

test('lado do balão e ação do log LGPD', () => {
    assert.equal(ladoDoBalao({ direcao: 'in' }), 'esquerda');
    assert.equal(ladoDoBalao({ direcao: 'out' }), 'direita');
    assert.equal(acaoDeAcesso('audio', false), 'ouviu_audio');
    assert.equal(acaoDeAcesso('documento', false), 'baixou_documento');
    assert.equal(acaoDeAcesso('imagem', true), 'baixou_documento');
    assert.equal(acaoDeAcesso('imagem', false), 'abriu_midia');
});
