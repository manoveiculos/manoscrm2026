
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPolicies() {
    const { data, error } = await supabase.rpc('get_policies', { table_name: 'sales_manos_crm' });
    if (error) {
        console.log("RPC get_policies failed, listing via query...");
        const { data: qData, error: qError } = await supabase.from('pg_policies').select('*').eq('tablename', 'sales_manos_crm');
        if (qError) console.error("Query failed:", qError);
        else console.log("Policies:", qData);
    } else {
        console.log("Policies:", data);
    }
}

checkPolicies();
