
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConsultants() {
    const { data, error } = await supabase
        .from('consultants_manos_crm')
        .select('name, is_active')
        .eq('is_active', true);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Consultants:', data.map(c => c.name));
    }
}

checkConsultants();
