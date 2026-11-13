// Contato que não é cliente de carro não vai a consultor nem gera cobrança. Rodar: npm run test:nao-cliente
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERRAMENTAS } from '@/lib/whatsapp/ia/ferramentas';
import { LAURA_CRM_PROMPT } from '@/lib/whatsapp/ia/prompt';
import { descartarNaoCliente } from '@/lib/whatsapp/ia/triagemRodada';
import type { SupabaseClient } from '@supabase/supabase-js';

test('a Laura tem a ferramenta encerrar_contato e o prompt manda usá-la em vez de passar ao consultor', () => {
    const f = FERRAMENTAS.find(x => x.name === 'encerrar_contato');
    assert.ok(f);
    const props = (f!.input_schema as { properties: Record<string, { enum?: string[] }>; required: string[] });
    assert.ok(props.properties.tipo.enum?.includes('oferta_de_servico'));
    assert.ok(props.properties.tipo.enum?.includes('assunto_juridico_ou_cobranca'));
    assert.deepEqual(props.required, ['tipo', 'resumo']);
    assert.ok(FERRAMENTAS.some(x => x.name === 'passar_para_consultor'));            // continua existindo
    assert.match(LAURA_CRM_PROMPT, /NÃO é cliente de carro/);
    assert.match(LAURA_CRM_PROMPT, /chame encerrar_contato/);
    assert.match(LAURA_CRM_PROMPT, /NÃO passe para o consultor/);
});

/** Banco de mentira: guarda cada update (tabela, dados, filtros) e devolve linhas para o select final. */
function banco() {
    const updates: { tabela: string; d: Record<string, unknown>; filtros: [string, unknown][] }[] = [];
    const from = (tabela: string) => ({
        update: (d: Record<string, unknown>) => {
            const filtros: [string, unknown][] = [];
            const b: Record<string, unknown> = {
                eq: (c: string, v: unknown) => { filtros.push([c, v]); return b; },
                is: (c: string, v: unknown) => { filtros.push([c + ' is', v]); return b; },
                in: (c: string, v: unknown) => { filtros.push([c + ' in', v]); return b; },
                select: () => b,
                then: (ok: (v: unknown) => unknown) => { updates.push({ tabela, d, filtros }); return Promise.resolve({ data: tabela === 'lead_distribuicao' ? [{ lead_uid: 'x' }] : [], error: null }).then(ok); },
            };
            return b;
        },
    });
    return { admin: { from } as unknown as SupabaseClient, updates };
}

test('descartar: arquiva o lead, encerra a conversa e tira da fila — sem avisar consultor', async () => {
    const b = banco();
    const agora = new Date('2026-11-13T15:00:00Z');
    const r = await descartarNaoCliente(b.admin, 'leads_distribuicao_crm_26:4186', 'conv-1', { tipo: 'oferta_de_servico', resumo: 'Empresa oferecendo painéis de LED.', agora });
    assert.equal(r, true);
    const lead = b.updates.find(u => u.tabela === 'leads_distribuicao_crm_26')!;
    assert.equal(lead.d.archived_at, agora.toISOString());
    assert.equal(lead.d.archived_reason, 'nao_e_cliente: oferta_de_servico');
    assert.deepEqual(lead.filtros, [['id', 4186], ['archived_at is', null]]);              // só arquiva quem ainda não está arquivado
    const dist = b.updates.find(u => u.tabela === 'lead_distribuicao')!;
    assert.equal(dist.d.status, 'atendido');                                              // sai de triagem, fila e rodízio
    assert.deepEqual(dist.filtros.find(f => f[0] === 'status in')![1], ['triagem_laura', 'fila_espera', 'aguardando', 'standby']);
    const tri = b.updates.find(u => u.tabela === 'wa_triagem')!;
    assert.equal(tri.d.motivo, 'nao_e_cliente');
    const conv = b.updates.find(u => u.tabela === 'wa_conversas')!;
    assert.equal(conv.d.status, 'encerrada');                                             // a Laura não responde mais; se ele escrever de novo, a conversa reabre
    // nada de aviso, cobrança ou mudança de dono
    assert.equal(b.updates.some(u => u.tabela === 'avisos_enviados' || 'assigned_consultant_id' in u.d), false);
});

test('descartar sem conversa e com id de outra tabela não quebra', async () => {
    const b = banco();
    await descartarNaoCliente(b.admin, 'leadsfacebook:abc', null, { tipo: 'spam' });
    assert.equal(b.updates.some(u => u.tabela === 'leads_distribuicao_crm_26'), false);   // só mexe no lead do CRM
    assert.equal(b.updates.some(u => u.tabela === 'wa_conversas'), false);
});
