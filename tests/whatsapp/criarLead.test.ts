// O CRM cria o lead na 1ª mensagem. Rodar: npm run test:criar-lead (banco fictício, sem rede)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificarContato, garantirLead } from '@/lib/whatsapp/criarLead';
import type { SupabaseClient } from '@supabase/supabase-js';

test('classifica: fornecedor, vaga, quer vender o carro; o resto é cliente', () => {
    const t = (s: string) => classificarContato([s]).tipo;
    assert.equal(t('Estou entrando em contato para apresentar meu trabalho na área automotiva, chapeação e pintura'), 'fornecedor');
    assert.equal(t('Boa tarde, vocês têm vaga de emprego? Posso mandar currículo'), 'emprego');
    assert.equal(t('Quero vender meu carro, vocês compram?'), 'vender_carro');
    assert.equal(t('Vocês compram carro usado?'), 'vender_carro');
    assert.equal(t('Oi, tem o Onix 2018 ainda?'), 'cliente');
    assert.equal(t('Quero trocar meu carro por um mais novo, tem Compass?'), 'cliente');
    assert.equal(t('Gostaria de financiar um carro'), 'cliente');
    assert.equal(t(''), 'cliente'); // na dúvida não perde venda
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

function banco(init: { conversas: Linha[]; leads?: Linha[]; msgs?: Linha[]; falhaInsertUnico?: boolean }) {
    const leads = init.leads || [];
    const log = { inserts: 0, erros: [] as Linha[], vincular: 0, updates: [] as Linha[] };
    const from = (tabela: string) => {
        let op = 'select'; let dados: Linha = {};
        const f: ((r: Linha) => boolean)[] = [];
        const rows = () => (tabela === 'wa_conversas' ? init.conversas : tabela === 'leads_distribuicao_crm_26' ? leads : tabela === 'wa_mensagens' ? (init.msgs || []) : []).filter(r => f.every(x => x(r)));
        const b: Record<string, unknown> = {
            select: () => b, order: () => b, limit: () => b,
            insert: (d: Linha) => { op = 'insert'; dados = d; return b; },
            update: (d: Linha) => { op = 'update'; dados = d; return b; },
            eq: (c: string, v: unknown) => { f.push(r => r[c] === v); return b; },
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            single: async () => {
                if (op === 'insert' && tabela === 'leads_distribuicao_crm_26') {
                    log.inserts++;
                    if (init.falhaInsertUnico || leads.some(l => l.telefone === dados.telefone)) return { data: null, error: { message: 'duplicate key leads_crm_26_telefone_unique' } };
                    const novo = { id: 100 + leads.length, ...dados }; leads.push(novo); return { data: novo, error: null };
                }
                return { data: rows()[0] ?? null, error: null };
            },
            then: (ok: (v: unknown) => unknown) => {
                if (op === 'insert' && tabela === 'webhook_errors') { log.erros.push(dados); }
                if (op === 'update') { rows().forEach(r => Object.assign(r, dados)); log.updates.push({ tabela, dados }); }
                return Promise.resolve({ data: op === 'select' ? rows() : null, error: null }).then(ok);
            },
        };
        return b;
    };
    const rpc = (nome: string, args: Linha) => {
        const ret = (data: unknown) => ({ data, error: null, maybeSingle: async () => ({ data, error: null }) });
        if (nome === 'find_lead_by_phone') {
            const l = leads.find(x => String(x.telefone).slice(-8) === String(args.p_phone).slice(-8));
            return ret(l ? { table_name: 'leads_distribuicao_crm_26', native_id: String(l.id) } : null);
        }
        if (nome === 'wa_vincular_lead') {
            log.vincular++;
            const c = init.conversas.find(x => x.id === args.p_conversa)!;
            const l = leads.find(x => String(x.telefone).slice(-8) === String(c.telefone_key).slice(-8));
            if (l) c.lead_uid = `leads_distribuicao_crm_26:${l.id}`;
            return ret(null);
        }
        return ret(null);
    };
    return { admin: { from, rpc } as unknown as SupabaseClient, leads, log };
}

const distribuiu: string[] = [];
const deps = { distribuir: async (_t: 'leads_distribuicao_crm_26', id: string) => { distribuiu.push(id); return { status: 'distribuido' }; } };

test('número novo: cria 1 lead sem dono, liga a conversa e chama a roleta', async () => {
    const b = banco({
        conversas: [{ id: 'c1', telefone_key: '47988880001', nome_contato: 'Carlos', lead_uid: null }],
        msgs: [{ conversa_id: 'c1', autor: 'cliente', texto: 'oi, tem onix?' }],
    });
    distribuiu.length = 0;
    const r = await garantirLead(b.admin, 'c1', deps);
    assert.equal(r.acao, 'criado');
    assert.equal(b.leads.length, 1);
    assert.equal(b.leads[0].assigned_consultant_id, null);
    assert.equal(b.leads[0].origem, 'WhatsApp');
    assert.equal(b.leads[0].nome, 'Carlos');
    assert.equal(b.leads[0].telefone, '47988880001');
    assert.deepEqual(distribuiu, [String(b.leads[0].id)]);
    assert.equal(b.log.vincular, 1);
});

test('sem duplicar: lead já existe (outro formato de telefone) só liga a conversa', async () => {
    const b = banco({
        conversas: [{ id: 'c1', telefone_key: '47988880001', nome_contato: 'Carlos', lead_uid: null }],
        leads: [{ id: 7, telefone: '5547988880001', status: 'attempt' }],
        msgs: [{ conversa_id: 'c1', autor: 'cliente', texto: 'oi' }],
    });
    distribuiu.length = 0;
    const r = await garantirLead(b.admin, 'c1', deps);
    assert.equal(r.acao, 'vinculado');
    assert.equal(b.leads.length, 1);
    assert.equal(b.log.inserts, 0);
    assert.equal(distribuiu.length, 0);
});

test('duas mensagens seguidas não criam 2 leads', async () => {
    const b = banco({
        conversas: [{ id: 'c1', telefone_key: '47988880001', nome_contato: null, lead_uid: null }],
        msgs: [{ conversa_id: 'c1', autor: 'cliente', texto: 'oi' }],
    });
    await garantirLead(b.admin, 'c1', deps);
    await garantirLead(b.admin, 'c1', deps);
    assert.equal(b.leads.length, 1);
    assert.equal(b.leads[0].nome, 'Lead WhatsApp'); // sem nome no perfil: genérico (a correção vem depois)
});

test('criação simultânea (índice único falha): usa o lead que o outro criou', async () => {
    const b = banco({
        conversas: [{ id: 'c1', telefone_key: '47988880001', nome_contato: 'Ana', lead_uid: null }],
        msgs: [{ conversa_id: 'c1', autor: 'cliente', texto: 'oi' }],
    });
    // o outro "aparece" entre a busca e o insert
    let achou = 0;
    const rpcOriginal = (b.admin as unknown as { rpc: (n: string, a: Linha) => unknown }).rpc;
    (b.admin as unknown as { rpc: unknown }).rpc = (n: string, a: Linha) => {
        const r = rpcOriginal(n, a);
        // o outro cria o lead logo DEPOIS da nossa busca e ANTES do nosso insert
        if (n === 'find_lead_by_phone' && achou++ === 0) b.leads.push({ id: 9, telefone: '47988880001', status: 'received' });
        return r;
    };
    const r = await garantirLead(b.admin, 'c1', deps);
    assert.equal(r.acao, 'vinculado');
    assert.equal(b.leads.length, 1);
});

test('fornecedor / vaga / quer vender: não vira lead de venda e fica registrado', async () => {
    for (const [texto, tipo] of [['Quero apresentar meu trabalho de pintura automotiva', 'fornecedor'], ['tem vaga de emprego?', 'emprego'], ['quero vender meu carro', 'vender_carro']] as const) {
        const b = banco({
            conversas: [{ id: 'c1', telefone_key: '47988880002', nome_contato: 'X', lead_uid: null }],
            msgs: [{ conversa_id: 'c1', autor: 'cliente', texto }],
        });
        const r = await garantirLead(b.admin, 'c1', deps);
        assert.deepEqual(r, { acao: 'outra_fila', tipo });
        assert.equal(b.leads.length, 0);
        assert.equal(b.log.erros[0]?.source, 'wa_triagem');
    }
});

test('cliente que volta: sobe o lead parado; lead vendido ou arquivado não é tocado', async () => {
    const b = banco({
        conversas: [{ id: 'c1', telefone_key: '47988880001', nome_contato: 'A', lead_uid: 'leads_distribuicao_crm_26:7' }],
        leads: [{ id: 7, telefone: '47988880001', status: 'attempt', archived_at: null, atualizado_em: '2026-10-01' }],
    });
    const r = await garantirLead(b.admin, 'c1', deps);
    assert.deepEqual(r, { acao: 'ja_tinha', leadUid: 'leads_distribuicao_crm_26:7', subiu: true });
    assert.notEqual(b.leads[0].atualizado_em, '2026-10-01');

    for (const extra of [{ status: 'vendido' }, { archived_at: '2026-10-02' }]) {
        const c = banco({
            conversas: [{ id: 'c1', telefone_key: '47988880001', nome_contato: 'A', lead_uid: 'leads_distribuicao_crm_26:7' }],
            leads: [{ id: 7, telefone: '47988880001', status: 'attempt', archived_at: null, atualizado_em: '2026-10-01', ...extra }],
        });
        const rr = await garantirLead(c.admin, 'c1', deps);
        assert.equal(rr.acao === 'ja_tinha' && rr.subiu, false);
        assert.equal(c.leads[0].atualizado_em, '2026-10-01');
    }
});

test('telefone inválido e conversa inexistente são ignorados', async () => {
    const b = banco({ conversas: [{ id: 'c1', telefone_key: '123', nome_contato: null, lead_uid: null }] });
    assert.equal((await garantirLead(b.admin, 'c1', deps)).acao, 'ignorado');
    assert.equal((await garantirLead(b.admin, 'zzz', deps)).acao, 'ignorado');
});
