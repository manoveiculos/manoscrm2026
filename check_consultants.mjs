import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: consultants } = await supabase.from('consultants_manos_crm').select('id, name');
    console.log('Consultants:', consultants);

    const { data: leads } = await supabase.from('leads_distribuicao_crm_26').select('id, nome, vendedor').limit(10);
    console.log('Some leads:', leads);
}
run();
