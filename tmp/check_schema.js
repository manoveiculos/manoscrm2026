
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) env[parts[0].trim()] = parts[1].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
    const { data: wa_msg, error: err1 } = await supabase.from('whatsapp_messages').select('*').limit(1);
    console.log('--- whatsapp_messages first row ---');
    console.log(wa_msg?.[0] ? Object.keys(wa_msg[0]) : 'Empty table');

    const { data: interactions, error: err2 } = await supabase.from('interactions_manos_crm').select('*').limit(1);
    console.log('--- interactions_manos_crm first row ---');
    console.log(interactions?.[0] ? Object.keys(interactions[0]) : 'Empty table');
    
    // Check for column types if possible via RPC or just metadata
    // We'll try to insert a dummy to see if uuid works for lead_id in whatsapp_messages
}

checkSchema();
