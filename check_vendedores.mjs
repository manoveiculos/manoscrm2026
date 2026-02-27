
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVendedores() {
    const { data, error } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('vendedor');

    if (error) {
        console.error('Error:', error);
    } else {
        const unique = [...new Set(data.map(i => i.vendedor).filter(Boolean))];
        console.log('Unique Vendedores in CRM26:', unique);
    }
}

checkVendedores();
