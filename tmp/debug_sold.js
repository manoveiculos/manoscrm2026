
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
        console.log('Querying sold leads...');
        const { data: allSold, error } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('nome,status,criado_em,atualizado_em,vendedor')
            .in('status', ['closed', 'comprado'])
            .order('atualizado_em', { ascending: false });

        if (error) throw error;
        
        console.log(`Found ${allSold.length} sold leads total.`);
        
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        console.log('Start of month:', startOfMonth);

        const soldThisMonthCreated = allSold.filter(l => l.criado_em >= startOfMonth);
        const soldThisMonthUpdated = allSold.filter(l => l.atualizado_em >= startOfMonth);

        console.log('Sold (Created This Month):', soldThisMonthCreated.length);
        console.log('Sold (Updated This Month):', soldThisMonthUpdated.length);
        
        if (allSold.length > 0) {
            console.log('Latest Sold Lead Example:', JSON.stringify(allSold[0], null, 2));
        }

        fs.writeFileSync('tmp/debug_sold_dates.json', JSON.stringify({
            summary: {
                total: allSold.length,
                thisMonthCreated: soldThisMonthCreated.length,
                thisMonthUpdated: soldThisMonthUpdated.length,
                startOfMonth
            },
            data: allSold
        }, null, 2));
        
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
