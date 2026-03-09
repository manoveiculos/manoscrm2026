
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Basic .env parser since we might not have dotenv in simple node call
function loadEnv(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
        }
    });
}

loadEnv(path.resolve(__dirname, '.env.local'));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function redistribute() {
    console.log("Starting redistribution for Karoline and Felipe...");

    // 1. Get Consultants
    const { data: consultants, error: cErr } = await supabase.from('consultants_manos_crm').select('id, name').eq('is_active', true);
    if (cErr || !consultants) return console.error("Error fetching consultants:", cErr);

    const felipe = consultants.find(c => c.name.toLowerCase().includes('felipe'));
    const karoline = consultants.find(c => c.name.toLowerCase().includes('karoline'));
    const wilson = consultants.find(c => c.name.toLowerCase().includes('wilson'));
    const sergio = consultants.find(c => c.name.toLowerCase().includes('sergio'));
    const victor = consultants.find(c => c.name.toLowerCase().includes('victor'));

    const sourceIds = [felipe?.id, karoline?.id].filter(Boolean);
    const sourceNames = [];
    if (felipe) sourceNames.push('Felipe');
    if (karoline) sourceNames.push('Karoline');

    const targetTeam = [wilson, sergio, victor].filter(Boolean);

    if (targetTeam.length === 0) {
        return console.error("No target consultants (Wilson, Sergio, Victor) found/active.");
    }

    console.log("Source Consultant IDs:", sourceIds);
    console.log("Target Team:", targetTeam.map(t => t.name));

    const reactivationStatuses = ['lost', 'lost_redistributed', 'Perca Total', 'Sem Contato', 'sem_contato'];

    // 2. Main Table Leads
    let mainLeads = [];
    if (sourceIds.length > 0) {
        const { data } = await supabase
            .from('leads_manos_crm')
            .select('id, name, assigned_consultant_id')
            .in('assigned_consultant_id', sourceIds)
            .in('status', reactivationStatuses);
        mainLeads = data || [];
    }

    // 3. CRM26 Table Leads
    const { data: crm26Leads } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('id, nome, vendedor, status')
        .or(`vendedor.ilike.%felipe%,vendedor.ilike.%karoline%`);

    const crm26Filtered = (crm26Leads || []).filter(l => reactivationStatuses.includes(l.status) || (l.status && l.status.toLowerCase().includes('perca')));

    console.log(`Main Leads to move: ${mainLeads.length}`);
    console.log(`CRM26 Leads to move: ${crm26Filtered.length}`);

    const allToRedistribute = [
        ...mainLeads.map(l => ({ ...l, table: 'leads_manos_crm' })),
        ...crm26Filtered.map(l => ({ id: l.id, name: l.nome, table: 'leads_distribuicao_crm_26' }))
    ];

    // 4. Execute
    let targetIndex = 0;
    for (const lead of allToRedistribute) {
        const nextConsultant = targetTeam[targetIndex % targetTeam.length];
        targetIndex++;

        console.log(`-> ${lead.table}: ${lead.name} (${lead.id}) -> ${nextConsultant.name}`);

        if (lead.table === 'leads_manos_crm') {
            await supabase.from('leads_manos_crm').update({
                assigned_consultant_id: nextConsultant.id,
                status: 'received',
                updated_at: new Date().toISOString()
            }).eq('id', lead.id);

            await supabase.from('interactions_manos_crm').insert({
                lead_id: lead.id,
                type: 'system',
                notes: `🔄 Sorteio refeito: Transferido para ${nextConsultant.name}. Motivo: Limpeza de carteira Karoline/Felipe.`,
                created_at: new Date().toISOString()
            });
        } else {
            await supabase.from('leads_distribuicao_crm_26').update({
                vendedor: nextConsultant.name,
                status: 'received',
                atualizado_em: new Date().toISOString(),
                enviado: false
            }).eq('id', lead.id);
        }
    }

    console.log("Done!");
}

redistribute();
