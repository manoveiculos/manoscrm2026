import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function listTables() {
    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    });

    if (error) {
        // If rpc('exec_sql') fails, try common names
        console.error('RPC Error:', error);
        return;
    }

    console.log('Tables in public schema:');
    console.log(data);
}

listTables();
