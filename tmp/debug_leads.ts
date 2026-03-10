
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLeads() {
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    console.log("Checking leads since:", startDate);

    // Main Table
    const { data: mainOrigens, error: error1 } = await supabase
        .from('leads_manos_crm')
        .select('source, utm_campaign, id_meta, campaign_id')
        .gte('created_at', startDate);

    if (error1) console.error("Error main:", error1);
    else {
        console.log("Total leads in leads_manos_crm (30d):", mainOrigens.length);
        const withCamp = mainOrigens.filter(l => l.utm_campaign || l.campaign_id || l.id_meta || (l.source && (l.source.toLowerCase().includes('ads') || l.source.toLowerCase().includes('campanha'))));
        console.log("Campaign leads in main (30d):", withCamp.length);

        // Count by source/utm_campaign
        const counts = withCamp.reduce((acc: any, l: any) => {
            const key = l.utm_campaign || l.source || 'undefined';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        console.log("Top campaign sources in main:", Object.entries(counts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5));
    }

    // CRM 26 Table
    const { data: crm26Origens, error: error2 } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('origem, id_meta, interesse')
        .gte('criado_em', startDate);

    if (error2) console.error("Error crm26:", error2);
    else {
        console.log("Total leads in leads_distribuicao_crm_26 (30d):", crm26Origens.length);
        const withCamp = crm26Origens.filter(l => l.id_meta || (l.origem && (l.origem.toLowerCase().includes('ads') || l.origem.toLowerCase().includes('campanha'))) || (l.interesse && l.interesse.toLowerCase().includes('ads')));
        console.log("Campaign leads in crm26 (30d):", withCamp.length);
    }
}

checkLeads();
