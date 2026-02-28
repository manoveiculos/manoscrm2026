import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const { data: cons } = await supabase.from('consultants_manos_crm').select('name');
    console.log('Consultores cadastrados:', cons?.map(c => c.name));

    const { data: leads } = await supabase.from('leads_distribuicao_crm_26').select('vendedor').limit(20);
    console.log('Exemplos de Vendedores na tabela de LEADS:', leads);
}

checkData();
