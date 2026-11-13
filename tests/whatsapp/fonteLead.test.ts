// Lead do Facebook na triagem da Laura. Rodar: npm run test:fonte-lead
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { arquivarLeadDaTriagem, fonteDoUid, gravarResumoNoLead, interesseDoFacebook, lerLeadDaTriagem } from '@/lib/whatsapp/ia/fonteLead';

const UUID = '753ce318-d0e1-48f6-8209-c2cf5c7cc639';

test('uid do CRM e do Facebook são reconhecidos; o resto não', () => {
    assert.deepEqual(fonteDoUid('leads_distribuicao_crm_26:4182'), { tabela: 'leads_distribuicao_crm_26', id: 4182 });
    assert.deepEqual(fonteDoUid(`leadsfacebook:${UUID}`), { tabela: 'leadsfacebook', id: UUID });
    for (const ruim of ['', null, undefined, 'leads_master:' + UUID, 'leadsfacebook:123', 'leadsfacebook:', 'leads_distribuicao_crm_26:abc', 'semdoispontos']) {
        assert.equal(fonteDoUid(ruim as string), null, String(ruim));
    }
});

test('Facebook: nome da campanha no campo de interesse não é carro', () => {
    assert.equal(interesseDoFacebook('Campanha Novembro SUV', 'Campanha Novembro SUV'), null);
    assert.equal(interesseDoFacebook('  campanha x ', 'Campanha X'), null);
    assert.equal(interesseDoFacebook('Honda Civic', 'Campanha X'), 'Honda Civic');
    assert.equal(interesseDoFacebook('', 'Campanha X'), null);
    assert.equal(interesseDoFacebook(null, null), null);
});

/** Banco de mentira: uma linha por tabela, registra os updates. */
function banco(linhas: Record<string, Record<string, unknown> | null>) {
    const updates: { tabela: string; dados: Record<string, unknown> }[] = [];
    const from = (tabela: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linhas[tabela] ?? null, error: null }) }) }),
        update: (dados: Record<string, unknown>) => {
            const fim = async () => { updates.push({ tabela, dados }); return { error: null }; };
            // .eq(...) devolve algo que também aceita .is(...) e pode ser aguardado
            return { eq: () => Object.assign(fim(), { is: fim }) };
        },
    });
    return { admin: { from } as unknown as SupabaseClient, updates };
}

test('lê o lead do Facebook com os nomes de coluna dele', async () => {
    const { admin } = banco({ leadsfacebook: { nome: 'Carlos Souza', phone: '5547999990001', vehicle_interest: 'Campanha X', cidade: 'Rio do Sul', source: 'Campanha X' } });
    const l = await lerLeadDaTriagem(admin, `leadsfacebook:${UUID}`);
    assert.equal(l?.nome, 'Carlos Souza');
    assert.equal(l?.telefone, '5547999990001');
    assert.equal(l?.interesse, null);          // era só o nome da campanha
    assert.equal(l?.origem, 'facebook');
});

test('lê o lead do CRM como antes (origem em minúsculas, interesse do veículo antes do texto livre)', async () => {
    const { admin } = banco({ leads_distribuicao_crm_26: { nome: 'Ana', telefone: '47999990002', interesse: 'qualquer', vehicle_interest: 'Fox 2013', cidade: null, origem: 'Google' } });
    const l = await lerLeadDaTriagem(admin, 'leads_distribuicao_crm_26:9');
    assert.equal(l?.origem, 'google');
    assert.equal(l?.interesse, 'Fox 2013');
});

test('lead que não existe ou uid estranho: null', async () => {
    assert.equal(await lerLeadDaTriagem(banco({}).admin, `leadsfacebook:${UUID}`), null);
    assert.equal(await lerLeadDaTriagem(banco({}).admin, 'leads_master:x'), null);
});

test('resumo da passagem: CRM em handoff_summary, Facebook em observações (no topo)', async () => {
    const crm = banco({ leads_distribuicao_crm_26: { handoff_summary: 'antigo' } });
    await gravarResumoNoLead(crm.admin, 'leads_distribuicao_crm_26:1', 'NOVO', new Date('2026-11-13T12:00:00Z'));
    assert.equal(crm.updates[0].tabela, 'leads_distribuicao_crm_26');
    assert.equal(crm.updates[0].dados.handoff_summary, 'NOVO\n\nantigo');

    const fb = banco({ leadsfacebook: { observacoes: '📘 Lead do Facebook Ads' } });
    await gravarResumoNoLead(fb.admin, `leadsfacebook:${UUID}`, 'NOVO', new Date());
    assert.equal(fb.updates[0].tabela, 'leadsfacebook');
    assert.equal(fb.updates[0].dados.observacoes, 'NOVO\n\n📘 Lead do Facebook Ads');
    assert.equal('handoff_summary' in fb.updates[0].dados, false);   // essa coluna não existe lá
});

test('arquivar vai para a tabela certa', async () => {
    const fb = banco({});
    await arquivarLeadDaTriagem(fb.admin, `leadsfacebook:${UUID}`, 'nao_e_cliente: spam', new Date('2026-11-13T12:00:00Z'));
    assert.equal(fb.updates[0].tabela, 'leadsfacebook');
    assert.equal(fb.updates[0].dados.archived_reason, 'nao_e_cliente: spam');
    const x = banco({});
    await arquivarLeadDaTriagem(x.admin, 'leads_master:abc', 'x', new Date());
    assert.equal(x.updates.length, 0);
});

test('primeiro contato: Facebook diz Facebook/Instagram, o resto continua dizendo Google', async () => {
    const { instrucaoPrimeiroContato } = await import('@/lib/whatsapp/ia/triagem');
    const fb = instrucaoPrimeiroContato({ nome: 'Carlos', interesse: null, cidade: null, origem: 'facebook' });
    assert.match(fb, /Facebook\/Instagram/);
    assert.doesNotMatch(fb, /no Google/);
    const g = instrucaoPrimeiroContato({ nome: 'Carlos', interesse: null, cidade: null });
    assert.match(g, /no Google/);
});
