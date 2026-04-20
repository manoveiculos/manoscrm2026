import { createClient } from '@/lib/supabase/admin';
import { assignNextConsultant } from '@/lib/services/autoAssignService';
import { notifyLeadArrival } from '@/lib/services/vendorNotifyService';
import { runEliteCloser } from '@/lib/services/ai-closer-service';

async function testLoop() {
    const admin = createClient();
    const testLeadId = 'test_' + Date.now();

    console.log('--- Iniciando Teste de Loop ---');

    // 1. Simular Inserção
    const { data: lead, error: insErr } = await admin.from('leads_compra').insert({
        nome: 'Teste Antigravity ' + testLeadId,
        telefone: '47999999999',
        origem: 'Teste Interno',
        veiculo_original: 'Fusca Turbinado',
        status: 'novo'
    }).select().single();

    if (insErr) {
        console.error('Falha no insert:', insErr);
        return;
    }
    console.log('Lead inserido:', lead.id);

    // 2. Simular Atribuição
    console.log('Atribuindo consultor...');
    const consultantId = await assignNextConsultant(lead.id, 'leads_compra');
    console.log('Consultor atribuído:', consultantId);

    // 3. Simular Elite Closer (IA)
    const fullId = 'compra_' + lead.id;
    console.log('Rodando Elite Closer (IA)...');
    try {
        const analysis = await runEliteCloser(fullId, [], 'SISTEMA');
        console.log('Análise IA concluída. Score:', analysis?.urgencyScore);
    } catch (e: any) {
        console.warn('Elite Closer falhou (esperado se sem chave/limite):', e?.message);
        // Fallback manual no teste para ver se o resto segue
        await admin.from('leads_compra').update({ ai_pending: true }).eq('id', lead.id);
    }

    // 4. Notificar Vendedor
    console.log('Enviando notificação...');
    try {
        await notifyLeadArrival(lead.id);
        console.log('Resumo: Notificação enviada (verificar logs do n8n se possível).');
    } catch (e: any) {
        console.error('Falha na notificação:', e?.message);
    }

    // 5. Verificar Resultado Final no Banco
    const { data: finalLead } = await admin.from('leads_compra').select('*').eq('id', lead.id).single();
    console.log('Estado final do lead:', {
        id: finalLead.id,
        assigned_consultant_id: finalLead.assigned_consultant_id,
        ai_pending: finalLead.ai_pending
    });
}

testLoop().catch(console.error);
