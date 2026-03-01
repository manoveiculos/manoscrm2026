import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://jkblxdxnbmciicakusnl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ');

async function test() {
    const { data: consultants } = await supabase.from('consultants_manos_crm').select('id, name');
    console.log('Consultants:', consultants);

    const { data: leads } = await supabase.from('leads_distribuicao_crm_26').select('id, nome, vendedor').not('vendedor', 'is', null).limit(20);
    console.log('Some leads with vendedor:', leads);
}
test();
