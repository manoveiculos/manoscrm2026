import { createClient } from '@/lib/supabase/admin';

/**
 * Serviço de Atribuição Automática de Leads (Round-Robin)
 * Objetivo: Distribuir leads de forma justa entre consultores ativos.
 * Critério: Atribui ao consultor com menor número de leads ativos nas últimas 24h.
 */
export async function assignNextConsultant(
    leadId: string, 
    table: 'leads_compra' | 'leads_manos_crm'
): Promise<string | null> {
    const admin = createClient();
    
    // 1. Buscar consultores ativos que não sejam admin
    const { data: consultants, error: consErr } = await admin
        .from('consultants_manos_crm')
        .select('id, name, last_lead_assigned_at')
        .eq('is_active', true)
        .neq('role', 'admin');

    if (consErr || !consultants || consultants.length === 0) {
        console.error('[autoAssign] Nenhum consultor disponível:', consErr);
        await logAssignmentFailure(leadId, table, 'Nenhum consultor ativo disponível');
        return null;
    }

    // 2. Definir janela de 24h para equilíbrio de carga
    const dayAgo = new Date();
    dayAgo.setHours(dayAgo.getHours() - 24);
    const dayAgoIso = dayAgo.toISOString();

    // 3. Contar leads ativos para cada consultor
    // Consideramos "ativo" qualquer lead que não esteja finalizado (vendido, perdido, comprado)
    const stats = await Promise.all(consultants.map(async (c) => {
        // Contagem em ambas as tabelas para visão real da carga
        const [resMain, resCompra] = await Promise.all([
            admin.from('leads_manos_crm')
                .select('id', { count: 'exact', head: true })
                .eq('assigned_consultant_id', c.id)
                .gte('created_at', dayAgoIso)
                .not('status', 'in', '("vendido","perdido","comprado","lost")'),
            admin.from('leads_compra')
                .select('id', { count: 'exact', head: true })
                .eq('assigned_consultant_id', c.id)
                .gte('criado_em', dayAgoIso)
                .not('status', 'in', '("vendido","perdido","comprado","finalizado")')
        ]);

        return {
            id: c.id,
            name: c.name,
            last_assigned: c.last_lead_assigned_at,
            load: (resMain.count || 0) + (resCompra.count || 0)
        };
    }));

    // 4. Ordenar por carga (menor primeiro), depois por data da última atribuição (mais antiga primeiro)
    stats.sort((a, b) => {
        if (a.load !== b.load) return a.load - b.load;
        if (!a.last_assigned) return -1;
        if (!b.last_assigned) return 1;
        return new Date(a.last_assigned).getTime() - new Date(b.last_assigned).getTime();
    });

    const chosen = stats[0];

    // 5. Atualizar o lead com o consultor escolhido
    const updatePayload = { 
        assigned_consultant_id: chosen.id,
        updated_at: new Date().toISOString()
    };

    const leadIdCol = table === 'leads_compra' ? 'id' : 'id'; // Ambos usam 'id' no Supabase
    
    const { error: updateErr } = await admin
        .from(table)
        .update(updatePayload)
        .eq('id', leadId);

    if (updateErr) {
        console.error(`[autoAssign] Erro ao atualizar lead ${leadId} em ${table}:`, updateErr);
        await logAssignmentFailure(leadId, table, `Erro no update: ${updateErr.message}`);
        return null;
    }

    // 6. Atualizar timestamp no consultor para o próximo round-robin
    await admin
        .from('consultants_manos_crm')
        .update({ last_lead_assigned_at: new Date().toISOString() })
        .eq('id', chosen.id);

    console.log(`[autoAssign] Lead ${leadId} atribuído a ${chosen.name} (${chosen.load} leads ativos)`);
    return chosen.id;
}

async function logAssignmentFailure(leadId: string, channel: string, msg: string) {
    const admin = createClient();
    try {
        await admin.from('notification_failures').insert({
            lead_id: leadId,
            channel: `auto_assign_${channel}`,
            error_message: msg,
            resolved: false,
            payload: { timestamp: new Date().toISOString() }
        });
    } catch (e) {
        console.error('[autoAssign] Crítico: Falha ao registrar log de erro:', e);
    }
}
