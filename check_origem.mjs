import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrign() {
    const { data, error } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('origem')
        .limit(10);

    if (error) {
        console.error('Error fetching leads:', error);
        return;
    }

    console.log('Sample origem values:', data.map(l => l.origem));

    const { count, error: countError } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*', { count: 'exact', head: true })
        .eq('origem', 'NÃO IDENTIFICADO');

    if (countError) {
        console.error('Error counting leads:', countError);
        return;
    }

    console.log('Count of leads with origem "NÃO IDENTIFICADO":', count);
}

checkOrign();
