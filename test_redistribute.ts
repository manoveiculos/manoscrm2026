import { dataService } from './src/lib/dataService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
dataService.setClient(supabase);

async function verify() {
    console.log("--- Starting Redistribution Verification (RLS Bypass) ---");

    // 1. Create a mock lead for testing
    const testPhone = '99999999999';
    console.log("Cleanup existing test lead...");
    await supabase.from('leads_manos_crm').delete().eq('phone', testPhone);

    // Get a consultant to assign initially
    const { data: consultants } = await supabase.from('consultants_manos_crm').select('*').eq('is_active', true).limit(2);
    if (!consultants || consultants.length < 2) {
        console.error("Needs at least 2 active consultants for this test. Run setup_test_consultants.ts first.");
        return;
    }
    const c1 = consultants[0];
    const c2 = consultants[1];

    console.log(`Initial Consultant: ${c1.name} (ID: ${c1.id})`);
    console.log(`Potential Secondary candidate: ${c2.name} (ID: ${c2.id})`);

    // Create lead in lost state with past eligibility
    const now = new Date();
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h ago

    const { data: lead, error } = await supabase
        .from('leads_manos_crm')
        .insert({
            name: 'TEST REDISTRIBUTION',
            phone: testPhone,
            status: 'lost_redistributed',
            assigned_consultant_id: c1.id,
            dados_brutos: {
                previous_consultant_id: c1.id,
                lost_at: past.toISOString(),
                redistribution_eligible_at: past.toISOString(), // Already eligible
                motivo_perda: 'Teste de Redistribuição'
            }
        })
        .select()
        .single();

    if (error) {
        console.error("Error creating test lead:", error);
        return;
    }

    console.log(`Lead created: ${lead.id}. Eligible since: ${lead.dados_brutos.redistribution_eligible_at}`);

    // 2. Run autoRedistributeLeads
    console.log("Running autoRedistributeLeads...");
    await dataService.autoRedistributeLeads();

    // 3. Verify result
    const { data: updatedLead } = await supabase.from('leads_manos_crm').select('*').eq('id', lead.id).single();

    console.log(`New Status: ${updatedLead.status}`);
    console.log(`New Consultant ID: ${updatedLead.assigned_consultant_id}`);

    if (updatedLead.status === 'received' && updatedLead.assigned_consultant_id !== c1.id) {
        console.log("✅ SUCCESS: Lead was redistributed to a new consultant.");
    } else {
        console.log("❌ FAILURE: Lead was not redistributed correctly.");
        if (updatedLead.assigned_consultant_id === c1.id) {
            console.log("Reason: Lead was reassigned to the SAME consultant (Exclusion failed or no other candidates).");
        }
    }

    // Cleanup
    await supabase.from('leads_manos_crm').delete().eq('id', lead.id);
}

verify().catch(console.error);
