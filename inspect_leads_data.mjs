import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function inspectLeads() {
    const { data: mainLeads } = await supabase.from('leads_manos_crm').select('*');
    const { data: crm26Leads } = await supabase.from('leads_distribuicao_crm_26').select('*');
    const { data: distLeads } = await supabase.from('leads_distribuicao').select('*').limit(5);

    console.log('--- MAIN LEADS ---');
    console.log(mainLeads);
    console.log('--- CRM 26 LEADS ---');
    console.log(crm26Leads);
    console.log('--- DIST LEADS (sample 5) ---');
    console.log(distLeads);
}

inspectLeads();
