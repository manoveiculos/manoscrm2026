import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, anonKey);

async function verifyVisibility() {
    console.log('Testing visibility with ANON KEY...');
    const { data, count, error } = await supabase
        .from('leads_distribuicao')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Final Verification Error:', error);
    } else {
        console.log('Successfully accessed leads_distribuicao!');
        console.log('Count visible:', count);
    }

    const { count: crm26Count, error: crm26Error } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*', { count: 'exact', head: true });

    if (crm26Error) {
        console.error('CRM26 Visibility Error:', crm26Error);
    } else {
        console.log('Successfully accessed leads_distribuicao_crm_26!');
        console.log('Count visible:', crm26Count);
    }
}

verifyVisibility();
