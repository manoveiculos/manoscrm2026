import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function checkRelationType() {
    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT table_name, table_type FROM information_schema.tables WHERE table_name = 'estoque_manos_crm'"
    });

    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    console.log('Relation details:');
    console.log(data);
}

checkRelationType();
