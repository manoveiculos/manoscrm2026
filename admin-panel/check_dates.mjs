import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseAnonKey = 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debug() {
    console.log('Checking for timestamp columns...');

    // Try to describe the table or just pick a few potential names
    const { data, error } = await supabase
        .from('estoque')
        .select('created_at, inserted_at, data_entrada')
        .limit(1);

    if (error) {
        console.log('Timestamp columns not found via direct select.');
    } else {
        console.log('Found timestamps:', data[0]);
    }

    // Check table info via RPC or just common sense
    const { data: allData } = await supabase.from('estoque').select('*').limit(1);
    console.log('Available columns:', Object.keys(allData?.[0] || {}));
}

debug();
