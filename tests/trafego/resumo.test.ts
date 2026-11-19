import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirTrafego, temperaturaDoVisitante, type EventoTrafego } from '@/lib/trafego/resumo';

const ev = (o: Partial<EventoTrafego>): EventoTrafego => ({
    id: Math.random().toString(36), created_at: '2026-11-19T10:00:00Z', visitor_id: 'a', origem_macro: 'facebook_ads', sub_origem: null,
    campanha_id: '1202', utm_campaign: null, acao: 'view_vehicle', veiculo_id: 'v1', veiculo_nome: 'Compass', valor_veiculo: 104900,
    dispositivo_detalhe: 'iPhone (iOS)', cidade: 'Blumenau', uf: 'SC', tempo_segundos: 5, fotos_vistas: 0, abriu_galeria: false, ...o,
});

test('temperatura: só passar é frio; muito tempo no carro é quente; clicar no WhatsApp é muito quente', () => {
    assert.equal(temperaturaDoVisitante([ev({ tempo_segundos: 1 })]), 'frio');
    assert.equal(temperaturaDoVisitante([ev({ tempo_segundos: 30 })]), 'morno');
    assert.equal(temperaturaDoVisitante([ev({ tempo_segundos: 130 })]), 'quente');
    assert.equal(temperaturaDoVisitante([ev({}), ev({ acao: 'click_whatsapp' })]), 'muito_quente');
});

test('resumo: agrupa por campanha, conta visitante único e usa o nome real da campanha', () => {
    const r = resumirTrafego(
        [ev({ visitor_id: 'a', tempo_segundos: 150 }), ev({ visitor_id: 'a', tempo_segundos: 10 }), ev({ visitor_id: 'b', tempo_segundos: 2 }), ev({ visitor_id: 'c', campanha_id: null, origem_macro: 'organico' })],
        [{ visitor_id: 'a', nome: 'João', telefone: '5547999990000', crm_lead_id: 'x', crm_status: 'new' }],
        { '1202': 'Reel Compass' },
    );
    assert.equal(r.totais.visitantes, 3);
    assert.equal(r.totais.quentes, 1);
    assert.equal(r.totais.identificados, 1);
    assert.equal(r.totais.noCrm, 1);
    const c = r.campanhas.find(x => x.chave === '1202')!;
    assert.equal(c.nome, 'Reel Compass');
    assert.equal(c.visitantes, 2);
    assert.equal(r.campanhas.find(x => x.chave === 'sem-campanha')!.origem, 'organico');
    assert.equal(r.visitantesQuentes[0].nome, 'João');
    assert.equal(r.visitantesQuentes[0].carro, 'Compass');
});

test('resumo vazio não quebra', () => {
    const r = resumirTrafego([], []);
    assert.equal(r.totais.visitantes, 0);
    assert.deepEqual(r.campanhas, []);
});
