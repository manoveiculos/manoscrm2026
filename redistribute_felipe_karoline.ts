
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function redistribute() {
    console.log("Starting redistribution for Karoline and Felipe...");

    // 1. Get Consultant IDs
    const { data: consultants } = await supabase.from('consultants_manos_crm').select('id, name').eq('is_active', true);
    if (!consultants) return console.error("No consultants found.");

    const felipe = consultants.find(c => c.name.toLowerCase().includes('felipe'));
    const karoline = consultants.find(c => c.name.toLowerCase().includes('karoline'));
    const wilson = consultants.find(c => c.name.toLowerCase().includes('wilson'));
    const sergio = consultants.find(c => c.name.toLowerCase().includes('sergio'));
    const victor = consultants.find(c => c.name.toLowerCase().includes('victor'));

    const sourceIds = [felipe?.id, karoline?.id].filter(Boolean);
    const sourceNames = ['Felipe', 'Karoline']; // For name-based lookups in older tables
    const targetTeam = [wilson, sergio, victor].filter(Boolean);

    if (sourceIds.length === 0) {
        console.log("Karoline or Felipe not found in active consultants. Checking all...");
        const { data: allConsultants } = await supabase.from('consultants_manos_crm').select('id, name');
        const f = allConsultants?.find(c => c.name.toLowerCase().includes('felipe'));
        const k = allConsultants?.find(c => c.name.toLowerCase().includes('karoline'));
        if (f) sourceIds.push(f.id);
        if (k) sourceIds.push(k.id);
    }

    console.log("Source Consultant IDs:", sourceIds);
    if (sourceIds.length === 0) return console.error("Could not find Karoline or Felipe.");

    // 2. Identify Leads in "Reativação" state for these consultants
    // Reativação states: lost, lost_redistributed, Perca Total, Sem Contato, sem_contato
    const reactivationStatuses = ['lost', 'lost_redistributed', 'Perca Total', 'Sem Contato', 'sem_contato'];

    // Table 1: leads_manos_crm
    const { data: mainLeads } = await supabase
        .from('leads_manos_crm')
        .select('id, name, assigned_consultant_id')
        .in('assigned_consultant_id', sourceIds)
        .in('status', reactivationStatuses);

    // Table 2: leads_distribuicao_crm_26 (uses name as 'vendedor')
    const { data: crm26Leads } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('id, nome, vendedor, status')
        .or(`vendedor.ilike.%felipe%,vendedor.ilike.%karoline%`);

    // Filter crm26Leads manually for reactivation status if columns exist
    const crm26Filtered = (crm26Leads || []).filter(l => reactivationStatuses.includes(l.status as string) || (l.status && l.status.toLowerCase().includes('perca')));

    console.log(`Found ${mainLeads?.length || 0} leads in leads_manos_crm`);
    console.log(`Found ${crm26Filtered.length} leads in leads_distribuicao_crm_26`);

    const allToRedistribute = [
        ...(mainLeads || []).map(l => ({ ...l, table: 'leads_manos_crm' })),
        ...crm26Filtered.map(l => ({ id: l.id, name: l.nome, table: 'leads_distribuicao_crm_26', currentVendedor: l.vendedor }))
    ];

    if (allToRedistribute.length === 0) {
        console.log("No leads found for redistribution in reactivation state.");
        return;
    }

    // 3. Redistribute
    let targetIndex = 0;
    for (const lead of allToRedistribute) {
        const nextConsultant = targetTeam[targetIndex % targetTeam.length];
        targetIndex++;

        console.log(`Redistributing lead ${lead.name} (${lead.id}) from ${lead.table} to ${nextConsultant.name}`);

        if (lead.table === 'leads_manos_crm') {
            await supabase.from('leads_manos_crm').update({
                assigned_consultant_id: nextConsultant.id,
                status: 'received', // Move back to wait queue for the new consultant
                updated_at: new Date().toISOString()
            }).eq('id', lead.id);

            // History
            await supabase.from('interactions_manos_crm').insert({
                lead_id: lead.id,
                type: 'system',
                notes: `🔄 Sorteio refeito: Transferido de ${sourceNames.join('/')} para ${nextConsultant.name}.`,
                created_at: new Date().toISOString()
            });
        } else {
            await supabase.from('leads_distribuicao_crm_26').update({
                vendedor: nextConsultant.name,
                status: 'received',
                atualizado_em: new Date().toISOString(),
                enviado: false // Mark as not sent to trigger arrival alerts/logic
            }).eq('id', lead.id);
        }
    }

    console.log("Redistribution complete.");
}

redistribute().catch(console.error);
