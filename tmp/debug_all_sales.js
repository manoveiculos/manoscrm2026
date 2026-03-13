
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value.length > 0) {
            env[key.trim()] = value.join('=').trim();
        }
    });
    return env;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    try {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        console.log('Filtering from:', startOfMonth);

        const [res26, resMain] = await Promise.all([
            supabase.from('leads_distribuicao_crm_26').select('nome,status,atualizado_em').in('status', ['closed', 'comprado']).gte('atualizado_em', startOfMonth),
            supabase.from('leads_manos_crm').select('name,status,updated_at').in('status', ['closed', 'comprado']).gte('updated_at', startOfMonth)
        ]);

        console.log('CRM26 Sold This Month:', JSON.stringify(res26.data, null, 2));
        console.log('Main CRM Sold This Month:', JSON.stringify(resMain.data, null, 2));
        
        const total = (res26.data?.length || 0) + (resMain.data?.length || 0);
        console.log('Total Sales This Month:', total);

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
