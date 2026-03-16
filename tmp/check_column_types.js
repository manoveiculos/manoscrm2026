
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) env[parts[0].trim()] = parts[1].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumnTypes() {
    // There's no direct way to get column types via select(*), but we can try inserting values.
    // However, let's use a workaround: check if we can cast lead_id to UUID or BigInt in a query
    
    console.log("Checking whatsapp_messages lead_id type...");
    const { error: waError } = await supabase.from('whatsapp_messages')
        .select('*')
        .eq('lead_id', 'e02f193b-4f3c-43c1-ab02-bdd3a4e6f59a') // Try UUID
        .limit(1);
    
    if (waError) {
        console.log("whatsapp_messages lead_id does NOT seem to support UUID:", waError.message);
    } else {
        console.log("whatsapp_messages lead_id supports UUID (or at least query didn't crash).");
    }

    console.log("Checking interactions_manos_crm lead_id type...");
    const { error: intError } = await supabase.from('interactions_manos_crm')
        .select('*')
        .eq('lead_id', 'e02f193b-4f3c-43c1-ab02-bdd3a4e6f59a') // Try UUID
        .limit(1);
    
    if (intError) {
        console.log("interactions_manos_crm lead_id does NOT seem to support UUID:", intError.message);
    } else {
        console.log("interactions_manos_crm lead_id supports UUID.");
    }
}

checkColumnTypes();
