import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseAnonKey = 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debug() {
    console.log('Testing Supabase connection...');

    // Test if we can even reach the API
    const { data: testData, error: testError } = await supabase.from('estoque').select('count', { count: 'exact', head: true });
    if (testError) {
        console.error('Connection test failed:', testError);
        return;
    }
    console.log('Connection test success! Count:', testData);

    const { data, error } = await supabase
        .from('estoque')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching from "estoque":', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Success! Columns in "estoque":', Object.keys(data[0]));
        console.log('First row sample:', JSON.stringify(data[0], null, 2));
    } else {
        console.log('Connected, but table "estoque" is empty or returned no data.');
    }
}

debug();
