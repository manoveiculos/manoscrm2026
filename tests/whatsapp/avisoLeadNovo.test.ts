// Aviso de lead novo ao consultor para leads do CRM (id numérico). Rodar: npm run test:aviso-lead
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadDoCrm26ParaAviso } from '@/lib/services/vendorNotifyService';

test('lead do CRM (leads_distribuicao_crm_26) vira o formato do aviso, com os campos que o consultor lê', () => {
    const l = leadDoCrm26ParaAviso({
        id: 4182, nome: 'Cliente Teste', telefone: '5547999990001', vehicle_interest: null, interesse: 'Compass 2019', origem: 'WhatsApp',
        ai_score: 50, ai_classification: 'warm', proxima_acao: null, assigned_consultant_id: 'c1', valor_investimento: '20 mil',
    });
    assert.equal(l.id, 4182);
    assert.equal(l.name, 'Cliente Teste');
    assert.equal(l.phone, '5547999990001');
    assert.equal(l.vehicle_interest, 'Compass 2019');      // cai no "interesse" quando vehicle_interest está vazio
    assert.equal(l.source, 'WhatsApp');
    assert.equal(l.assigned_consultant_id, 'c1');
    assert.equal(l.valor, '20 mil');
    assert.equal(l.isCompra, false);
});

test('campos ausentes viram null (nunca undefined) para o aviso não quebrar', () => {
    const l = leadDoCrm26ParaAviso({ id: 1 });
    assert.deepEqual([l.name, l.phone, l.vehicle_interest, l.source, l.ai_score, l.valor], [null, null, null, null, null, null]);
});
