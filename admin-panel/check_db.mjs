
import { createClient } from '@supabase/supabase-js';
import { loadEnvFile } from 'node:process';
loadEnvFile('.env.local');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDB() {
    console.log("📊 Checking campaigns_manoscrm26...");
    const { data, error, count } = await supabase
        .from('campaigns_manoscrm26')
        .select('*', { count: 'exact' });

    if (error) {
        console.error("❌ Error:", error.message);
    } else {
        console.log(`✅ Table has ${count} rows.`);
        if (data.length > 0) {
            console.log("📝 Sample Data:", JSON.stringify(data[0], null, 2));
        }
    }
}

checkDB();
