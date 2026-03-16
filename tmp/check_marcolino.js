
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) env[parts[0].trim()] = parts[1].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMarcolino() {
    const phone = '4788233330'; // As seen in screenshot
    console.log(`Checking lead with phone: ${phone}`);

    const tables = ['leads_distribuicao_crm_26', 'leads_manos_crm'];
    
    for (const table of tables) {
        const phoneField = table === 'leads_distribuicao_crm_26' ? 'telefone' : 'phone';
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq(phoneField, phone);
        
        if (error) {
            console.error(`Error in table ${table}:`, error);
        } else {
            console.log(`Table ${table}: found ${data.length} matches`);
            if (data.length > 0) {
                console.log(`--- ${table} ---`);
                const lead = data[0];
                console.log(`ID: ${lead.id}`);
                console.log(`Name: ${lead.nome || lead.name}`);
                console.log(`Status: ${lead.status}`);
                console.log(`Ai Summary: ${lead.resumo || lead.ai_summary}`);
                console.log(`Diagnosis: ${lead.resumo_consultor || lead.ai_reason}`);
                console.log(`Next Steps: ${lead.proxima_acao || lead.next_step}`);
                console.log(`Full Fields:`, Object.keys(lead).filter(k => lead[k] !== null).join(', '));
            }
        }
    }
}

checkMarcolino();
