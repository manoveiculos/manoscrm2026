import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atualizacaoDaTransferencia } from '@/lib/leads/transferencia';

const dest = { id: 'c-1', name: 'Maria' };
const agora = '2026-11-21T11:44:00.000Z';

test('leads_master (espelho): só dono e status — sem coluna de atendimento nem vendedor', () => {
    assert.deepEqual(atualizacaoDaTransferencia('leads_master', dest, agora), { assigned_consultant_id: 'c-1', status: 'new' });
});

test('leads_distribuicao_crm_26: reseta o atendimento e grava o nome do vendedor', () => {
    assert.deepEqual(atualizacaoDaTransferencia('leads_distribuicao_crm_26', dest, agora), {
        assigned_consultant_id: 'c-1', status: 'new', atendimento_iniciado_em: null, atendimento_iniciado_por: null,
        ultima_interacao_humana: agora, vendedor: 'Maria',
    });
});

test('demais tabelas com atendimento: reseta o atendimento, sem a coluna vendedor', () => {
    for (const t of ['leads_manos_crm', 'leads_compra', 'leadsfacebook']) {
        const u = atualizacaoDaTransferencia(t, dest, agora);
        assert.equal(u.atendimento_iniciado_em, null, t);
        assert.equal('vendedor' in u, false, t);
    }
});
