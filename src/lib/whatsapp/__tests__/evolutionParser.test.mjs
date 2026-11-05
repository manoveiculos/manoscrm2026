// Testes do parser da Evolution e das regras de mídia.
// Roda com: npm run test:whatsapp  (node --test; o Node 22 remove os tipos do .ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    parseEvolutionWebhook, telefoneKey, mapearStatus, statusAvanca, payloadSeguro, textoResumo, numero,
} from '../evolutionParser.ts';
import { caminhoMidia, extensaoMidia, excedeLimite, corteRetencao, mimeBase } from '../midia.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'evolution');
const fx = nome => JSON.parse(readFileSync(join(DIR, `${nome}.json`), 'utf8'));
const um = nome => {
    const r = parseEvolutionWebhook(fx(nome));
    assert.equal(r.length, 1, `${nome}: esperava 1 evento, veio ${r.length}`);
    return r[0];
};

const CLIENTE_KEY = '47988880001';

test('todas as fixtures são parseadas sem lançar erro', () => {
    const arquivos = readdirSync(DIR).filter(f => f.endsWith('.json'));
    assert.ok(arquivos.length >= 19);
    for (const a of arquivos) {
        const r = parseEvolutionWebhook(JSON.parse(readFileSync(join(DIR, a), 'utf8')));
        assert.ok(Array.isArray(r) && r.length > 0, a);
    }
});

test('texto', () => {
    const e = um('01-texto');
    assert.equal(e.kind, 'mensagem');
    assert.equal(e.tipo, 'texto');
    assert.equal(e.texto, 'Oi, o Onix 2020 ainda está disponível?');
    assert.equal(e.providerMessageId, '3EB0A1B2C3D4E5F6A7B801');
    assert.equal(e.telefone, '5547988880001');
    assert.equal(e.telefoneKey, CLIENTE_KEY);
    assert.equal(e.fromMe, false);
    assert.equal(e.nomeContato, 'Cliente Exemplo');
    assert.equal(e.instancia, 'loja-exemplo');
    assert.equal(e.enviadaEm, new Date(1793800000 * 1000).toISOString());
    assert.equal(e.midia, null);
    assert.equal(e.citadaMessageId, null);
});

test('imagem com legenda', () => {
    const e = um('02-imagem-legenda');
    assert.equal(e.tipo, 'imagem');
    assert.equal(e.legenda, 'Esse é o meu carro para a troca');
    assert.equal(e.texto, null);
    assert.equal(e.midia.mime, 'image/jpeg');
    assert.equal(e.midia.bytes, 245760);
    assert.equal(e.enviadaEm, new Date(1793800060 * 1000).toISOString());
});

test('áudio de voz (ptt) com Long do protobuf', () => {
    const e = um('03-audio-ptt');
    assert.equal(e.tipo, 'audio');
    assert.equal(e.midia.ptt, true);
    assert.equal(e.midia.duracaoS, 7);
    assert.equal(e.midia.bytes, 18432);
    assert.equal(e.midia.mime, 'audio/ogg; codecs=opus');
    assert.equal(e.enviadaEm, new Date(1793800120 * 1000).toISOString());
    assert.equal(e.dispositivo, 'ios');
});

test('vídeo, com JID sem o 9º dígito', () => {
    const e = um('04-video');
    assert.equal(e.tipo, 'video');
    assert.equal(e.legenda, 'Barulho no motor');
    assert.equal(e.midia.duracaoS, 21);
    assert.equal(e.midia.bytes, 5242880);
    assert.equal(e.telefone, '554788880002');
    assert.equal(e.telefoneKey, '47988880002');
});

test('documento dentro de documentWithCaptionMessage', () => {
    const e = um('05-documento');
    assert.equal(e.tipo, 'documento');
    assert.equal(e.legenda, 'Segue o comprovante');
    assert.equal(e.midia.nomeArquivo, 'comprovante-renda.pdf');
    assert.equal(e.midia.mime, 'application/pdf');
    assert.equal(e.midia.bytes, 88123);
});

test('figurinha', () => {
    const e = um('06-figurinha');
    assert.equal(e.tipo, 'figurinha');
    assert.equal(e.midia.mime, 'image/webp');
});

test('localização', () => {
    const e = um('07-localizacao');
    assert.equal(e.tipo, 'localizacao');
    assert.deepEqual(e.localizacao, { lat: -27.2142, lng: -49.6431, nome: 'Ponto de referência', endereco: 'Centro, Rio do Sul - SC' });
    assert.equal(e.texto, 'Ponto de referência — Centro, Rio do Sul - SC');
    assert.equal(e.midia, null);
});

test('contato (vCard)', () => {
    const e = um('08-contato');
    assert.equal(e.tipo, 'contato');
    assert.deepEqual(e.contatos, [{ nome: 'Contato Exemplo', telefones: ['5547977770003'] }]);
    assert.equal(e.texto, 'Contato Exemplo');
});

test('reação aponta para a mensagem alvo', () => {
    const e = um('09-reacao');
    assert.equal(e.tipo, 'reacao');
    assert.equal(e.texto, '\u{1F44D}');
    assert.equal(e.reacaoAlvoId, '3EB0LAURA00000000000001');
    assert.equal(e.citadaMessageId, '3EB0LAURA00000000000001');
    assert.equal(textoResumo(e), '[reação \u{1F44D}]');
});

test('resposta citada', () => {
    const e = um('10-resposta-citada');
    assert.equal(e.tipo, 'texto');
    assert.equal(e.texto, 'Pode ser sábado de manhã');
    assert.equal(e.citadaMessageId, '3EB0LAURA00000000000001');
});

test('editada vira evento de edição da mensagem original', () => {
    const e = um('11-editada');
    assert.equal(e.kind, 'edicao');
    assert.equal(e.providerMessageId, '3EB0A1B2C3D4E5F6A7B801');
    assert.equal(e.novoTexto, 'Oi, o Onix 2021 ainda está disponível?');
    assert.equal(e.telefoneKey, CLIENTE_KEY);
});

test('apagada (REVOKE) aponta para a mensagem original', () => {
    const e = um('12-apagada');
    assert.equal(e.kind, 'apagada');
    assert.equal(e.providerMessageId, '3EB0A1B2C3D4E5F6A7B806');
});

test('apagada pelo evento messages.delete', () => {
    const e = um('19-apagada-evento-delete');
    assert.equal(e.kind, 'apagada');
    assert.equal(e.providerMessageId, '3EB0A1B2C3D4E5F6A7B802');
    assert.equal(e.telefoneKey, CLIENTE_KEY);
});

test('status entregue (v2)', () => {
    const e = um('13-status-entregue');
    assert.equal(e.kind, 'status');
    assert.equal(e.status, 'entregue');
    assert.equal(e.providerMessageId, '3EB0LAURA00000000000001');
});

test('status lido (v1, lista)', () => {
    const e = um('14-status-lido');
    assert.equal(e.kind, 'status');
    assert.equal(e.status, 'lida');
    assert.equal(e.providerMessageId, '3EB0LAURA00000000000001');
});

test('status de mensagem recebida (a loja leu) não vira status de entrega', () => {
    const v2 = fx('13-status-entregue');
    v2.data.fromMe = false;
    v2.data.status = 'READ';
    assert.equal(parseEvolutionWebhook(v2)[0].motivo, 'status_de_mensagem_recebida');
    const v1 = fx('14-status-lido');
    v1.data[0].key.fromMe = false;
    assert.equal(parseEvolutionWebhook(v1)[0].motivo, 'status_de_mensagem_recebida');
});

test('mensagem da Laura (fromMe) não leva nome do contato', () => {
    const e = um('15-laura-fromme');
    assert.equal(e.kind, 'mensagem');
    assert.equal(e.fromMe, true);
    assert.equal(e.nomeContato, null);
    assert.equal(e.texto, 'Qual o melhor dia para a visita?');
    assert.equal(e.telefoneKey, CLIENTE_KEY);
});

test('corpo embrulhado pelo n8n é desembrulhado', () => {
    const e = um('16-n8n-embrulhado');
    assert.equal(e.kind, 'mensagem');
    assert.equal(e.texto, 'Vocês fazem financiamento?');
    assert.equal(e.instancia, 'loja-exemplo');
});

test('JID @lid usa o telefone de remoteJidAlt', () => {
    const e = um('17-lid');
    assert.equal(e.kind, 'mensagem');
    assert.equal(e.telefone, '5547988880004');
    assert.equal(e.remoteJid, '123456789012345@lid');
});

test('grupo é ignorado', () => {
    const e = um('18-grupo');
    assert.equal(e.kind, 'ignorado');
    assert.equal(e.motivo, 'grupo');
});

test('@lid sem telefone é ignorado com motivo próprio', () => {
    const p = fx('17-lid');
    delete p.data.key.remoteJidAlt;
    const [e] = parseEvolutionWebhook(p);
    assert.equal(e.kind, 'ignorado');
    assert.equal(e.motivo, 'lid_sem_telefone');
});

test('eventos que não são mensagem são ignorados', () => {
    const [e] = parseEvolutionWebhook({ event: 'connection.update', instance: 'x', data: { state: 'open' } });
    assert.equal(e.kind, 'ignorado');
    assert.equal(e.motivo, 'evento_connection.update');
    assert.equal(parseEvolutionWebhook(null)[0].motivo, 'payload_invalido');
});

test('telefoneKey: DDI, 9º dígito, fixo e estrangeiro', () => {
    assert.equal(telefoneKey('5547988880001'), '47988880001');
    assert.equal(telefoneKey('554788880002'), '47988880002'); // celular sem o 9
    assert.equal(telefoneKey('(47) 98888-0001'), '47988880001');
    assert.equal(telefoneKey('554733001352'), '4733001352'); // fixo da loja: 10 dígitos
    assert.equal(telefoneKey('4733001352'), '4733001352');
    assert.equal(telefoneKey('14155550100123'), '14155550100123'); // estrangeiro fica inteiro
    assert.equal(telefoneKey('123'), null);
    assert.equal(telefoneKey(null), null);
});

test('numero lê Long, string e número', () => {
    assert.equal(numero({ low: 10, high: 0 }), 10);
    assert.equal(numero({ low: 0, high: 1 }), 2 ** 32);
    assert.equal(numero('42'), 42);
    assert.equal(numero('x'), null);
});

test('status só avança', () => {
    assert.equal(mapearStatus('SERVER_ACK'), 'enviada');
    assert.equal(mapearStatus(3), 'entregue');
    assert.equal(mapearStatus('PLAYED'), 'lida');
    assert.equal(mapearStatus('ERROR'), 'falhou');
    assert.equal(mapearStatus('PENDING'), null);
    assert.equal(statusAvanca(null, 'enviada'), true);
    assert.equal(statusAvanca('entregue', 'lida'), true);
    assert.equal(statusAvanca('lida', 'entregue'), false);
    assert.equal(statusAvanca('lida', 'falhou'), false);
    assert.equal(statusAvanca('enviada', 'falhou'), true);
});

test('payloadSeguro tira apikey, headers e base64', () => {
    const p = fx('16-n8n-embrulhado');
    p.body.data.message.base64 = 'A'.repeat(5000);
    const s = payloadSeguro(p);
    const txt = JSON.stringify(s);
    assert.ok(!txt.includes('CHAVE-FALSA-NAO-USAR'));
    assert.ok(!txt.includes('AAAAAAAAAA'));
    assert.equal(s.headers, '[removido]');
    assert.equal(s.body.apikey, '[removido]');
});

test('base64 do webhook vai para a mídia', () => {
    const p = fx('03-audio-ptt');
    p.data.message.base64 = 'T2dnUw==';
    const [e] = parseEvolutionWebhook(p);
    assert.equal(e.midia.base64, 'T2dnUw==');
});

test('regras de mídia: limite, extensão, caminho e corte de 30 dias', () => {
    assert.equal(excedeLimite('audio', 16 * 1024 * 1024), false);
    assert.equal(excedeLimite('audio', 16 * 1024 * 1024 + 1), true);
    assert.equal(excedeLimite('video', 99 * 1024 * 1024), false);
    assert.equal(excedeLimite('documento', 101 * 1024 * 1024), true);
    assert.equal(excedeLimite('texto', 999999999), false);
    assert.equal(mimeBase('audio/ogg; codecs=opus'), 'audio/ogg');
    assert.equal(extensaoMidia('audio', 'audio/ogg; codecs=opus'), 'ogg');
    assert.equal(extensaoMidia('documento', 'application/octet-stream', 'tabela.XLSX'), 'xlsx');
    assert.equal(extensaoMidia('imagem', null), 'jpg');
    assert.equal(caminhoMidia('c0nv-1', 'm5g/..', 'jpg', '2026-11-04T10:00:00Z'), '2026/11/c0nv-1/m5g.jpg');
    const corte = corteRetencao(new Date('2026-12-04T00:00:00Z'));
    assert.equal(corte.toISOString(), '2026-11-04T00:00:00.000Z');
});
