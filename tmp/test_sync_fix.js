const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSync() {
    const leadId = 'crm26_497';
    const phone = '5547999200257';
    const name = 'Kagdan Xokleng';
    const messages = [
        { text: 'Olá, tenho interesse no veículo', direction: 'inbound' },
        { text: 'Olá, qual veículo seria?', direction: 'outbound' },
        { text: 'O Up TSI', direction: 'inbound' }
    ];

    console.log('Simulando sync para:', leadId);
    
    // We don't need to call the API via fetch because we can simulate the internal logic or just use curl
    // But let's try to call the actual endpoint IF the server is running.
    // Since npm run dev is running, it should be at http://localhost:3000
    
    try {
        const response = await fetch('http://localhost:3000/api/extension/sync-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId, phone, name, messages })
        });
        const result = await response.json();
        console.log('API Result:', JSON.stringify(result, null, 2));

        // Now verify the DB
        setTimeout(async () => {
            const { data } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('resumo, ai_classification, ai_score')
                .eq('id', 497)
                .single();
            console.log('DB State after sync:', JSON.stringify(data, null, 2));
        }, 2000);
    } catch (e) {
        console.error('Fetch failed (server might be down):', e.message);
        console.log('Attempting direct DB verification of logic...');
        // If server is down, we could manually run the logic, but the user said npm run dev is running.
    }
}

testSync();
