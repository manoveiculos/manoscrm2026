
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing credentials");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("--- leads_distribuicao_crm_26 ---");
    const { data: d26, error: e26 } = await supabase.from('leads_distribuicao_crm_26').select('*').limit(1);
    if (e26) console.error("Error d26:", e26);
    else if (d26 && d26[0]) console.log("Keys:", Object.keys(d26[0]));

    console.log("\n--- campaigns_manos_crm ---");
    const { data: camp, error: ecamp } = await supabase.from('campaigns_manos_crm').select('*').limit(1);
    if (ecamp) console.error("Error camp:", ecamp);
    else if (camp && camp[0]) console.log("Keys:", Object.keys(camp[0]));

    console.log("\n--- leads_manos_crm (verify source column) ---");
    const { data: lmanos, error: elmanos } = await supabase.from('leads_manos_crm').select('*').limit(1);
    if (elmanos) console.error("Error lead_manos:", elmanos);
    else if (lmanos && lmanos[0]) console.log("Keys:", Object.keys(lmanos[0]));
}

check();
