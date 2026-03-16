
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    console.log("Checking leads_manos_crm...");
    const { data: main, error: mainErr } = await supabase
        .from('leads_manos_crm')
        .select('*')
        .limit(1);
    
    if (mainErr) console.error("Main Error:", mainErr);
    else if (main && main.length > 0) console.log("Main Columns:", Object.keys(main[0]));
    else console.log("Main table empty or not accessible");

    console.log("\nChecking leads_distribuicao_crm_26...");
    const { data: crm26, error: crm26Err } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*')
        .limit(1);
    
    if (crm26Err) console.error("CRM26 Error:", crm26Err);
    else if (crm26 && crm26.length > 0) console.log("CRM26 Columns:", Object.keys(crm26[0]));
    else console.log("CRM26 table empty or not accessible");
}

check();
