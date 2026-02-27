
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLegacyColumns() {
    const { data, error } = await supabase
        .from('leads_distribuicao')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
    } else if (data && data.length > 0) {
        console.log('Legacy Columns:', Object.keys(data[0]));
    } else {
        console.log('No data in leads_distribuicao');
    }
}

checkLegacyColumns();
