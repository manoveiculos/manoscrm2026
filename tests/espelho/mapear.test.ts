// Espelho do WhatsApp (Gestão → WhatsApp, só leitura). Rodar: npm run test:espelho
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configEspelho, eventosDosRegistros, separarEventos } from '@/lib/espelho/mapear';

const FIX = join(process.cwd(), 'src/lib/whatsapp/__fixtures__/evolution');
// O registro do /chat/findMessages tem o mesmo formato do `data` do webhook.
const registro = (nome: string): unknown => (JSON.parse(readFileSync(join(FIX, nome), 'utf8')) as { data: unknown }).data;

test('config: exige instância e token; URL cai para EVOLUTION_BASE_URL', () => {
    assert.deepEqual(configEspelho({}), { faltando: ['WA_ESPELHO_EVOLUTION_URL', 'WA_ESPELHO_INSTANCIA', 'WA_ESPELHO_TOKEN'] });
    assert.deepEqual(
        configEspelho({ EVOLUTION_BASE_URL: '"https://evo.exemplo/"', WA_ESPELHO_INSTANCIA: '"Camila"', WA_ESPELHO_TOKEN: 'abc' }),
        { baseUrl: 'https://evo.exemplo', instancia: 'Camila', token: 'abc' },
    );
});

test('registros → linhas: texto recebido, mídia e enviada pelo número', () => {
    const s = separarEventos(eventosDosRegistros(
        [registro('01-texto.json'), registro('02-imagem-legenda.json'), registro('03-audio-ptt.json'), registro('15-laura-fromme.json')],
        'Camila',
    ));
    assert.equal(s.linhas.length, 4);
    const [texto, imagem, audio, enviada] = s.linhas;
    assert.equal(texto.tipo, 'texto');
    assert.equal(texto.direcao, 'in');
    assert.match(texto.telefone_key, /^\d{10,11}$/);
    assert.ok(texto.texto);
    assert.equal(imagem.tipo, 'imagem');
    assert.ok(imagem.midia_mime?.startsWith('image/'));
    assert.ok(imagem.legenda);
    assert.equal(audio.tipo, 'audio');
    assert.equal(audio.extra?.ptt, true);
    assert.equal(enviada.direcao, 'out');
    assert.equal(enviada.nome, null, 'nome de quem enviou não vira nome do contato');
});

test('grupo é descartado; edição e apagada viram atualização', () => {
    const s = separarEventos(eventosDosRegistros(
        [registro('18-grupo.json'), registro('11-editada.json'), registro('12-apagada.json')],
        'Camila',
    ));
    assert.equal(s.linhas.length, 0);
    assert.equal(s.edicoes.length, 1);
    assert.equal(s.apagadas.length, 1);
    assert.equal(s.ignorados, 1);
});

test('@lid usa o telefone alternativo', () => {
    const s = separarEventos(eventosDosRegistros([registro('17-lid.json')], 'Camila'));
    assert.equal(s.linhas.length, 1);
    assert.match(s.linhas[0].telefone_key, /^\d{10,11}$/);
});

test('faixa de horário da página: segundos ou milissegundos, ignora lixo', async () => {
    const { faixaDeHorario } = await import('@/lib/espelho/sincronizar');
    assert.deepEqual(faixaDeHorario([{ messageTimestamp: 1795700000 }, { messageTimestamp: '1795600000' }, { messageTimestamp: 1795650000000 }, {}]),
        { min: 1795600000, max: 1795700000 });
    assert.equal(faixaDeHorario([]), null);
    assert.equal(faixaDeHorario([{ messageTimestamp: 'x' }]), null);
});
