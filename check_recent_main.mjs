import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function checkRecentMain() {
    const { data } = await supabase.from('leads_manos_crm').select('*').order('created_at', { ascending: false }).limit(20);
    console.log('--- RECENT MAIN LEADS ---');
    console.log(data);
}

checkRecentMain();
