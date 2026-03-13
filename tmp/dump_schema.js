
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').filter(l => l.includes('=')).forEach(l => {
        const [k, ...v] = l.split('=');
        env[k.trim()] = v.join('=').trim();
    });
    return env;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    try {
        const { data: r26, error: e26 } = await supabase.from('leads_distribuicao_crm_26').select('*').limit(1);
        const { data: rMain, error: eMain } = await supabase.from('leads_manos_crm').select('*').limit(1);
        
        const res = {
            crm26: r26 && r26.length > 0 ? Object.keys(r26[0]) : [],
            main: rMain && rMain.length > 0 ? Object.keys(rMain[0]) : [],
            errors: { e26, eMain }
        };
        
        console.log(JSON.stringify(res, null, 2));
        fs.writeFileSync('tmp/schema_dump.json', JSON.stringify(res, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
