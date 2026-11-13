// Envio pelo CRM e "humano assumiu". Rodar: npm run test:envio (provider e banco fictícios)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarPeloCrm, marcarHumanoSeNecessario, mudarAtendimento, reabrirArquivadas, validarConteudo } from '@/lib/whatsapp/envio';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

function banco(msgs: Linha[], conversas: Linha[]) {
    const rpcs: Linha[] = [];
    const from = (tabela: string) => {
        let dados: Linha | null = null; let op = 'select';
        const f: ((r: Linha) => boolean)[] = [];
        const base = () => (tabela === 'wa_mensagens' ? msgs : conversas);
        const rows = () => base().filter(r => f.every(x => x(r)));
        const b: Record<string, unknown> = {
            select: () => b,
            update: (d: Linha) => { op = 'update'; dados = d; return b; },
            eq: (c: string, v: unknown) => { f.push(r => r[c] === v); return b; },
            neq: (c: string, v: unknown) => { f.push(r => r[c] !== v); return b; },
            in: (c: string, v: unknown[]) => { f.push(r => v.includes(r[c])); return b; },
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            then: (ok: (v: unknown) => unknown) => {
                const saida = rows();
                if (op === 'update') { saida.forEach(r => Object.assign(r, dados)); }
                return Promise.resolve({ data: saida, error: null }).then(ok);
            },
        };
        return b;
    };
    const rpc = async (nome: string, args: Linha) => {
        rpcs.push({ nome, args });
        if (nome === 'wa_registrar_mensagem') {
            msgs.push({ id: 'm' + msgs.length, provider_message_id: args.p.provider_message_id, autor: args.p.autor, consultant_id: args.p.consultant_id, origem: args.p.origem, conversa_id: 'c1' });
        }
        return { data: null, error: null };
    };
    return { admin: { from, rpc } as unknown as SupabaseClient, rpcs };
}

const provider = (ok = true): WhatsAppProvider & { enviados: unknown[] } => {
    const enviados: unknown[] = [];
    const r = async (x: unknown) => { enviados.push(x); return ok ? { ok: true, providerMessageId: 'ID' + enviados.length } : { ok: false, providerMessageId: null, erro: 'sem_conexao' }; };
    return {
        nome: 'fake', instancia: 'teste', enviados,
        enviarTexto: async (p: string, t: string) => r({ p, t }), enviarMidia: async (p: string, m: unknown) => r({ p, m }), enviarAudio: async (p: string, a: unknown) => r({ p, a }),
        baixarMidia: async () => { throw new Error('nao usado'); }, marcarLida: async () => true,
    } as never;
};

const CONV = { id: 'c1', telefone_key: '47988880001', remote_jid: '5547988880001@s.whatsapp.net' };

test('vendedor envia texto: manda pelo número da loja, registra quem enviou e assume a conversa', async () => {
    const conversas = [{ id: 'c1', status: 'ia' }];
    const b = banco([], conversas);
    const p = provider();
    const r = await enviarPeloCrm(b.admin, p, CONV, { tipo: 'texto', texto: '  Oi, aqui é o João!  ' }, { autor: 'vendedor', consultantId: 'cons-1' });
    assert.equal(r.ok, true);
    assert.deepEqual(p.enviados[0], { p: '5547988880001@s.whatsapp.net', t: 'Oi, aqui é o João!' });
    const reg = b.rpcs.find(x => x.nome === 'wa_registrar_mensagem')!.args.p;
    assert.equal(reg.autor, 'vendedor');
    assert.equal(reg.consultant_id, 'cons-1');
    assert.equal(reg.origem, 'crm');
    assert.equal(conversas[0].status, 'humano');
});

test('se o eco do webhook chegou antes, o envio corrige o autor e quem enviou', async () => {
    const msgs = [{ id: 'm0', provider_message_id: 'ID1', autor: 'vendedor', consultant_id: null, origem: 'evolution', conversa_id: 'c1' }];
    const b = banco(msgs, [{ id: 'c1', status: 'ia' }]);
    await enviarPeloCrm(b.admin, provider(), CONV, { tipo: 'texto', texto: 'oi' }, { autor: 'laura' });
    assert.equal(msgs[0].autor, 'laura');
    assert.equal(msgs[0].origem, 'crm');
});

test('Laura enviando não coloca a conversa em humano', async () => {
    const conversas = [{ id: 'c1', status: 'ia' }];
    const b = banco([], conversas);
    await enviarPeloCrm(b.admin, provider(), CONV, { tipo: 'texto', texto: 'Tem sim!' }, { autor: 'laura' });
    assert.equal(conversas[0].status, 'ia');
});

test('falha da Evolution: nada é registrado e a conversa não muda', async () => {
    const conversas = [{ id: 'c1', status: 'ia' }];
    const b = banco([], conversas);
    const r = await enviarPeloCrm(b.admin, provider(false), CONV, { tipo: 'texto', texto: 'oi' }, { autor: 'vendedor', consultantId: 'c' });
    assert.equal(r.ok, false);
    assert.equal(r.erro, 'sem_conexao');
    assert.equal(b.rpcs.length, 0);
    assert.equal(conversas[0].status, 'ia');
});

test('imagem e áudio vão pelos métodos certos; conteúdo inválido é recusado antes de enviar', async () => {
    const b = banco([], [{ id: 'c1', status: 'ia' }]);
    const p = provider();
    const base64 = 'A'.repeat(100);
    assert.equal((await enviarPeloCrm(b.admin, p, CONV, { tipo: 'imagem', base64, mime: 'image/jpeg', legenda: 'Onix' }, { autor: 'vendedor' })).ok, true);
    assert.equal((await enviarPeloCrm(b.admin, p, CONV, { tipo: 'audio', base64 }, { autor: 'vendedor' })).ok, true);
    assert.equal(p.enviados.length, 2);
    assert.equal(validarConteudo({ tipo: 'texto', texto: '   ' }), 'mensagem vazia');
    assert.match(String(validarConteudo({ tipo: 'texto', texto: 'x'.repeat(4001) })), /longa/);
    assert.match(String(validarConteudo({ tipo: 'imagem', base64, mime: 'application/pdf' })), /JPG/);
    assert.equal((await enviarPeloCrm(b.admin, p, CONV, { tipo: 'texto', texto: '' }, { autor: 'vendedor' })).ok, false);
    assert.equal(p.enviados.length, 2);
});

test('humano assumiu: mensagem do celular da loja põe em humano; envio do CRM e conversa já humana não', async () => {
    const msgs = [
        { id: 'm1', autor: 'vendedor', consultant_id: null, origem: 'evolution' }, // digitada no celular
        { id: 'm2', autor: 'vendedor', consultant_id: 'cons-1', origem: 'crm' },  // enviada pelo CRM
        { id: 'm3', autor: 'laura', consultant_id: null, origem: 'crm' },          // Laura do CRM
    ];
    const conversas = [{ id: 'cA', status: 'ia' }, { id: 'cB', status: 'ia' }, { id: 'cC', status: 'ia' }];
    const b = banco(msgs, conversas);
    const n = await marcarHumanoSeNecessario(b.admin, [
        { conversaId: 'cA', mensagemId: 'm1' }, { conversaId: 'cB', mensagemId: 'm2' }, { conversaId: 'cC', mensagemId: 'm3' },
    ], 0);
    assert.equal(n, 1);
    assert.deepEqual(conversas.map(c => c.status), ['humano', 'ia', 'ia']);
});

test('assumir e devolver para a IA', async () => {
    const conversas: Linha[] = [{ id: 'c1', status: 'ia', ia_silenciada_ate: '2026-12-01' }, { id: 'c2', status: 'encerrada' }];
    const b = banco([], conversas);
    assert.equal(await mudarAtendimento(b.admin, 'c1', 'assumir'), true);
    assert.equal(conversas[0].status, 'humano');
    assert.equal(conversas[0].ia_silenciada_ate, null);
    await mudarAtendimento(b.admin, 'c1', 'devolver');
    assert.equal(conversas[0].status, 'ia');
    await mudarAtendimento(b.admin, 'c2', 'devolver');
    assert.equal(conversas[1].status, 'encerrada'); // conversa encerrada não reabre
});

test('arquivar tira a conversa da lista (encerrada); desarquivar volta; assumir/devolver não reabrem arquivada', async () => {
    const conversas: Linha[] = [{ id: 'c1', status: 'humano', ia_silenciada_ate: null }, { id: 'c2', status: 'ia' }];
    const b = banco([], conversas);
    assert.equal(await mudarAtendimento(b.admin, 'c1', 'arquivar'), true);
    assert.equal(conversas[0].status, 'encerrada');
    await mudarAtendimento(b.admin, 'c1', 'devolver');
    assert.equal(conversas[0].status, 'encerrada');
    await mudarAtendimento(b.admin, 'c1', 'assumir');
    assert.equal(conversas[0].status, 'encerrada');
    await mudarAtendimento(b.admin, 'c1', 'desarquivar');
    assert.equal(conversas[0].status, 'ia');
    await mudarAtendimento(b.admin, 'c2', 'desarquivar'); // só desarquiva quem está arquivada
    assert.equal(conversas[1].status, 'ia');
});

test('cliente escreveu numa conversa arquivada: ela volta; as outras não mudam', async () => {
    const conversas: Linha[] = [{ id: 'a', status: 'encerrada' }, { id: 'b', status: 'humano' }, { id: 'c', status: 'encerrada' }];
    const b = banco([], conversas);
    assert.equal(await reabrirArquivadas(b.admin, ['a', 'b']), 1);
    assert.deepEqual(conversas.map(c => c.status), ['ia', 'humano', 'encerrada']);
    assert.equal(await reabrirArquivadas(b.admin, []), 0);
});
