import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarMeta, resultadosMeta, mapaAnuncioCampanha, statusMeta } from '@/lib/campanhas/meta';
import { normalizarGoogle, GAQL } from '@/lib/campanhas/google';
import { somarTotais } from '@/lib/campanhas/tipos';
import { anuncioDoLead, custoPorLeadReal, foraDaPracaPorGrupo, funilPorGrupo, grupoDoLeadCrm, leadsPorCampanhaMeta } from '@/lib/campanhas/crm';

test('Meta: leads de formulário não são somados com as partes deles; conversas no WhatsApp entram à parte', () => {
    assert.deepEqual(resultadosMeta([{ action_type: 'lead', value: '5' }, { action_type: 'onsite_conversion.lead_grouped', value: '5' }]), { leads: 5, conversas: 0 });
    assert.deepEqual(resultadosMeta([{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' }]), { leads: 0, conversas: 12 });
    assert.deepEqual(resultadosMeta(undefined), { leads: 0, conversas: 0 });
});

test('Meta: normaliza campanha com insights + status/orçamento; campanha parada sem gasto some', () => {
    const { linhas, moeda } = normalizarMeta(
        [{ campaign_id: '1', campaign_name: 'Site Tráfego', spend: '120.50', impressions: '10000', clicks: '200', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '8' }], account_currency: 'BRL' }],
        [{ id: '1', name: 'Site Tráfego', effective_status: 'ACTIVE', daily_budget: '5000' }, { id: '2', name: 'Antiga', effective_status: 'PAUSED' }, { id: '3', name: 'Nova ativa', effective_status: 'ACTIVE' }],
    );
    assert.equal(moeda, 'BRL');
    assert.deepEqual(linhas.map(l => l.id), ['1', '3']);
    const a = linhas[0];
    assert.equal(a.status, 'ativa'); assert.equal(a.orcamentoDiario, 50);     // centavos → reais
    assert.equal(a.ctr, 2); assert.equal(a.cpc, 0.6); assert.equal(a.cpm, 12.05);
    assert.equal(a.resultados, 8); assert.equal(a.custoPorResultado, 15.06);
    assert.equal(linhas[1].gasto, 0);
});

test('status das plataformas', () => {
    assert.equal(statusMeta('CAMPAIGN_PAUSED', 'ACTIVE'), 'pausada');
    assert.equal(statusMeta(undefined, 'ARCHIVED'), 'encerrada');
    assert.equal(statusMeta('WITH_ISSUES', undefined), 'outro');
});

test('Google: micros viram reais, CTR vira %, campanha parada sem movimento some', () => {
    const l = normalizarGoogle([
        { campaign: { id: '10', name: 'Pesquisa Seminovos', status: 'ENABLED' }, campaignBudget: { amountMicros: '30000000' },
          metrics: { costMicros: '45500000', impressions: '8000', clicks: '160', ctr: 0.02, averageCpc: 284375, averageCpm: 5687500, conversions: 6.5 } },
        { campaign: { id: '11', name: 'Velha', status: 'PAUSED' }, metrics: { costMicros: '0', impressions: '0', clicks: '0' } },
        { campaign: { id: '12', name: 'Pausada com gasto', status: 'PAUSED' }, metrics: { costMicros: '1000000', impressions: '50', clicks: '2', conversions: 0 } },
    ]);
    assert.deepEqual(l.map(x => x.id), ['10', '12']);
    assert.equal(l[0].gasto, 45.5); assert.equal(l[0].ctr, 2); assert.equal(l[0].cpc, 0.28); assert.equal(l[0].cpm, 5.69);
    assert.equal(l[0].orcamentoDiario, 30); assert.equal(l[0].resultados, 6.5); assert.equal(l[0].custoPorResultado, 7);
    assert.match(GAQL('2026-11-01', '2026-11-19'), /BETWEEN '2026-11-01' AND '2026-11-19'/);
});

test('totais recalculam as razões, não somam CTR/CPC', () => {
    const t = somarTotais([
        { plataforma: 'meta', id: 'a', nome: 'a', status: 'ativa', statusBruto: '', orcamentoDiario: null, gasto: 100, impressoes: 10000, cliques: 100, ctr: 1, cpc: 1, cpm: 10, resultados: 4, conversas: 4, custoPorResultado: 25 },
        { plataforma: 'meta', id: 'b', nome: 'b', status: 'ativa', statusBruto: '', orcamentoDiario: null, gasto: 50, impressoes: 40000, cliques: 400, ctr: 1, cpc: 0.125, cpm: 1.25, resultados: 1, conversas: 1, custoPorResultado: 50 },
    ]);
    assert.deepEqual([t.gasto, t.ctr, t.cpc, t.cpm, t.resultados, t.custoPorResultado], [150, 1, 0.3, 3, 5, 30]);
    assert.equal(somarTotais([]).custoPorResultado, null);
});

test('CRM: o clique no WhatsApp de um anúncio conta como Meta; origem google como Google; o resto fica à parte', () => {
    assert.equal(grupoDoLeadCrm({ origem: 'whatsapp', utm_params: { platform: 'meta', channel: 'ctwa', source_id: '120' } }), 'meta');
    assert.equal(grupoDoLeadCrm({ origem: 'google' }), 'google');
    assert.equal(grupoDoLeadCrm({ origem: 'whatsapp', utm_params: { gclid: 'x' } }), 'google');
    assert.equal(grupoDoLeadCrm({ origem: 'Facebook Ads' }), 'meta');
    assert.equal(grupoDoLeadCrm({ deFormularioFacebook: true }), 'meta');
    assert.equal(grupoDoLeadCrm({ origem: 'whatsapp' }), 'outros');
    assert.equal(anuncioDoLead({ utm_params: { source_id: '120' } }), '120');
    assert.equal(anuncioDoLead({ utm_params: {} }), null);
});

test('CRM: funil por grupo e leads por campanha (anúncio → campanha)', () => {
    const leads = [
        { origem: 'whatsapp', utm_params: { platform: 'meta', source_id: 'ad1' }, status: 'received', atendimento_iniciado_em: '2026-11-18T10:00:00Z' },
        { origem: 'whatsapp', utm_params: { platform: 'meta', source_id: 'ad2' }, status: 'closed' },
        { origem: 'google', status: 'lost' },
        { origem: 'google', status: 'received' },
        { origem: 'whatsapp', status: 'received' },
    ];
    const f = funilPorGrupo(leads);
    assert.deepEqual(f.meta, { leads: 2, atendidos: 1, vendas: 1, perdidos: 0 });
    assert.deepEqual(f.google, { leads: 2, atendidos: 0, vendas: 0, perdidos: 1 });
    assert.equal(f.outros.leads, 1);
    const m = leadsPorCampanhaMeta(leads, mapaAnuncioCampanha([{ id: 'ad1', campaign_id: 'C1' }, { id: 'ad2', campaign_id: 'C1' }]));
    assert.equal(m.get('C1'), 2);
    assert.equal(custoPorLeadReal(100, 4), 25);
    assert.equal(custoPorLeadReal(100, 0), null);
});

test('fora da praça: % de visitantes fora de SC por grupo, estado desconhecido não conta', () => {
    const r = foraDaPracaPorGrupo([
        { visitor_id: 'a', origem_macro: 'INSTAGRAM / FACEBOOK ADS', uf: 'SC', cidade: 'Rio do Sul' },
        { visitor_id: 'a', origem_macro: 'INSTAGRAM / FACEBOOK ADS', uf: 'SC', cidade: 'Rio do Sul' },   // mesmo visitante: conta uma vez
        { visitor_id: 'b', origem_macro: 'INSTAGRAM / FACEBOOK ADS', uf: 'SP', cidade: 'São Paulo' },
        { visitor_id: 'c', origem_macro: 'INSTAGRAM / FACEBOOK ADS', uf: 'SP', cidade: 'São Paulo' },
        { visitor_id: 'd', origem_macro: 'INSTAGRAM / FACEBOOK ADS', uf: null, cidade: null },
        { visitor_id: 'e', origem_macro: 'GOOGLE ADS', uf: 'SC', cidade: 'Taió' },
        { visitor_id: 'f', origem_macro: 'ORGÂNICO / DIRETO', uf: 'RS', cidade: 'Porto Alegre' },
    ]);
    assert.deepEqual([r.meta.visitantes, r.meta.foraDeSc, r.meta.percentual], [3, 2, 66.7]);
    assert.deepEqual(r.meta.topCidades, [{ cidade: 'São Paulo', uf: 'SP', visitantes: 2 }]);
    assert.deepEqual([r.google.visitantes, r.google.foraDeSc, r.google.percentual], [1, 0, 0]);
});
