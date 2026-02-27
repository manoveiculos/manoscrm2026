
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findRodrigo() {
    const { data: t1 } = await supabase.from('leads_distribuicao_crm_26').select('*').ilike('nome', '%Rodrigo%');
    const { data: t2 } = await supabase.from('leads_distribuicao').select('*').ilike('nome', '%Rodrigo%');

    console.log('CRM26:', t1);
    console.log('Legacy:', t2);
}

findRodrigo();
