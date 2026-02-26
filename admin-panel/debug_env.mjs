
import { loadEnvFile } from 'node:process';
loadEnvFile('.env.local');

console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("Key Prefix:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 15));

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testFetch() {
    const { data, error } = await supabase.from('campaigns_manoscrm26').select('*');
    if (error) console.error("Error:", error.message);
    else console.log("Fetched Rows:", data.length);
}
testFetch();
