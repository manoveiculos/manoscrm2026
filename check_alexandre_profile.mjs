import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function checkConsultant() {
    const { data: consultant } = await supabase
        .from('consultants_manos_crm')
        .select('*')
        .eq('name', 'Alexandre Gorges')
        .maybeSingle();

    console.log('--- ALEXANDRE CONSULTANT PROFILE ---');
    console.log(consultant);
}

checkConsultant();
