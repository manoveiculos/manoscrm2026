
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConsultantColumns() {
    const { data, error } = await supabase
        .from('consultants_manos_crm')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
    } else if (data && data.length > 0) {
        console.log('Consultant Columns:', Object.keys(data[0]));
    }
}

checkConsultantColumns();
