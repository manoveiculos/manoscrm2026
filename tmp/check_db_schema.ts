
import { createClient } from '@supabase/supabase-js';

async function checkSchema() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing Supabase credentials");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Checking leads_distribuicao_crm_26 columns...");
    const { data, error } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching from leads_distribuicao_crm_26:", error);
    } else if (data && data.length > 0) {
        console.log("Columns found:", Object.keys(data[0]));
    } else {
        console.log("No data found, but table seems accessible.");
        // Try to get column information differently
        const { data: cols, error: colErr } = await supabase.rpc('get_table_columns', { table_name: 'leads_distribuicao_crm_26' });
        if (colErr) console.log("RPC get_table_columns failed (expected if not defined)");
        else console.log("Columns:", cols);
    }

    console.log("\nChecking campaigns_manos_crm columns...");
    const { data: campData, error: campErr } = await supabase
        .from('campaigns_manos_crm')
        .select('*')
        .limit(1);

    if (campErr) {
        console.error("Error fetching from campaigns_manos_crm:", campErr);
    } else if (campData && campData.length > 0) {
        console.log("Columns found:", Object.keys(campData[0]));
    }
}

checkSchema();
