
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) env[parts[0].trim()] = parts[1].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumns() {
    const { data, error } = await supabase.from('leads_distribuicao_crm_26').select('*').limit(1);
    if (data && data.length > 0) {
        console.log('Columns in leads_distribuicao_crm_26:', Object.keys(data[0]).sort());
    } else {
        console.log('No data found in leads_distribuicao_crm_26');
    }
}

checkColumns();
