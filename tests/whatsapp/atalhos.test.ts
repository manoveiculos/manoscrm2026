// Atalhos "@" e dados da loja. Rodar: npm run test:atalhos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarAtalho, atalhoEmDigitacao, filtrarFixos, textoDoCarro } from '@/lib/whatsapp/atalhos';
import { LOJA, textoApresentacao, textoEndereco, blocoLojaParaPrompt } from '@/lib/loja';
import { enviarFotosPorUrl } from '@/lib/whatsapp/envio';
import { contextoDaRodada, LAURA_CRM_PROMPT } from '@/lib/whatsapp/ia/prompt';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';

test('"@" só abre no começo de uma palavra e acha a busca até o cursor', () => {
    assert.deepEqual(atalhoEmDigitacao('@palio', 6), { inicio: 0, busca: 'palio' });
    assert.deepEqual(atalhoEmDigitacao('olha esse @onix', 15), { inicio: 10, busca: 'onix' });
    assert.deepEqual(atalhoEmDigitacao('@compass 2019', 13), { inicio: 0, busca: 'compass 2019' });
    assert.equal(atalhoEmDigitacao('email@dominio', 13), null);
    assert.equal(atalhoEmDigitacao('sem atalho', 10), null);
    assert.deepEqual(atalhoEmDigitacao('@', 1), { inicio: 0, busca: '' });
});

test('aplicar o atalho troca só o "@busca" pelo texto', () => {
    const r = aplicarAtalho('veja isso @pal ok', 10, 14, 'Palio 2019');
    assert.equal(r.texto, 'veja isso Palio 2019 ok');
    assert.equal(r.cursor, 20);
});

test('atalhos fixos filtram por chave e por palavra do rótulo', () => {
    assert.deepEqual(filtrarFixos('end').map(a => a.chave), ['endereco']);
    assert.deepEqual(filtrarFixos('hor').map(a => a.chave), ['horario']);
    assert.ok(filtrarFixos('').length >= 4);
    assert.deepEqual(filtrarFixos('zzz'), []);
});

test('texto do carro usa só dados do estoque, sem inventar', () => {
    const t = textoDoCarro({ descricao: 'Fiat Palio Attractive 2019', cor: 'Branco', km: 54000, cambio: null, combustivel: 'Flex', preco: 39900, link: null });
    assert.match(t, /^Fiat Palio Attractive 2019\n/);
    assert.match(t, /Branco · 54\.000 km · Flex/);
    assert.match(t, /R\$ 39\.900/);
    assert.doesNotMatch(t, /null|undefined/);
    // o link do anúncio nunca vai ao cliente
    const comLink = textoDoCarro({ descricao: 'GWM Haval H6 2025', cor: 'Preto', km: 29000, cambio: null, combustivel: 'Gasolina e Híbrido', preco: 219900, link: 'https://exemplo.com.br/veiculo/1' });
    assert.doesNotMatch(comLink, /https?:|exemplo\.com/);
    assert.match(comLink, /R\$ 219\.900/);
    assert.equal(textoDoCarro({ descricao: 'X', cor: null, km: null, cambio: null, combustivel: null, preco: null, link: null }), 'X');
});

test('apresentação do consultor e endereço da loja', () => {
    assert.equal(textoApresentacao('Sergio Silva', 'Alexandre Gorges'), 'Oi, Alexandre! Aqui é o Sergio, consultor da Manos Veículos. Vou continuar o seu atendimento por aqui 🙂');
    assert.match(textoApresentacao(null, null), /^Oi! Aqui é da equipe/);
    assert.match(textoEndereco(), /Rua Dom Pedro II, nº 374, Rio do Sul/);
});

test('Laura sabe o endereço e o horário, mas não passa Pix', () => {
    assert.match(LAURA_CRM_PROMPT, /Rua Dom Pedro II, nº 374/);
    assert.match(LAURA_CRM_PROMPT, /Sábado, 08h às 12h/);
    assert.doesNotMatch(LAURA_CRM_PROMPT, new RegExp(LOJA.pixCnpj.replace(/[.\/]/g, '\\$&')));
    assert.doesNotMatch(blocoLojaParaPrompt(), /28\.918/);
    const c = contextoDaRodada({ agora: new Date('2026-11-11T15:00:00Z'), lojaAberta: true, nomePerfilWhatsapp: null, ficha: {}, consultor: 'Sergio Silva' });
    assert.match(c, /Consultor do cliente: Sergio\./);
    assert.match(contextoDaRodada({ agora: new Date(), lojaAberta: false, nomePerfilWhatsapp: null, ficha: {} }), /ainda não definido/);
});

test('fotos do estoque: manda cada URL, registra como do vendedor e segue se uma falhar', async () => {
    const enviadas: string[] = [];
    const rpcs: { p: Record<string, unknown> }[] = [];
    const updates: { tabela: string; d: Record<string, unknown>; filtros: unknown[] }[] = [];
    const provider = {
        enviarMidia: async (_p: string, m: { url?: string }) => {
            enviadas.push(String(m.url));
            return m.url === 'https://x/2.jpg' ? { ok: false, providerMessageId: null } : { ok: true, providerMessageId: 'ID' + enviadas.length };
        },
    } as unknown as WhatsAppProvider;
    const admin = {
        rpc: async (_n: string, a: { p: Record<string, unknown> }) => { rpcs.push(a); return { error: null }; },
        from: (tabela: string) => ({
            update: (d: Record<string, unknown>) => {
                const filtros: unknown[] = [];
                const b: Record<string, unknown> = {
                    eq: (c: string, v: unknown) => { filtros.push([c, v]); return b; },
                    then: (ok: (v: unknown) => unknown) => { updates.push({ tabela, d, filtros }); return Promise.resolve({}).then(ok); },
                };
                return b;
            },
        }),
    } as unknown as SupabaseClient;
    const n = await enviarFotosPorUrl(admin, provider, { id: 'c1', telefone_key: '4799', remote_jid: null }, ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'], { autor: 'vendedor', consultantId: 'k' }, 0);
    assert.equal(n, 2);
    assert.equal(enviadas.length, 3);
    assert.equal(rpcs.length, 2);
    assert.equal(rpcs[0].p.autor, 'vendedor');
    assert.equal(rpcs[0].p.consultant_id, 'k');
    assert.equal(rpcs[0].p.origem, 'crm');
    // vendedor mandando fotos assume a conversa (a Laura para)
    assert.ok(updates.some(u => u.tabela === 'wa_conversas' && u.d.status === 'humano'));
});
