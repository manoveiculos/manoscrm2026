
import { createClient } from '@supabase/supabase-js';
import { loadEnvFile } from 'node:process';
loadEnvFile('.env.local');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkLeadsDistribuicao() {
    console.log("📊 Checking leads_distribuicao...");
    const { data, error } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Error:", error.message);
    } else if (data && data.length > 0) {
        console.log("📝 Columns:", Object.keys(data[0]));
        console.log("📝 Sample Data:", JSON.stringify(data[0], null, 2));
    } else {
        console.log("✅ Table is empty.");
    }
}

checkLeadsDistribuicao();
