
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function count() {
    const { count: total, error } = await supabase
        .from('leads_manos_crm')
        .select('*', { count: 'exact', head: true });

    console.log('Total leads in leads_manos_crm:', total);

    const { data: leads } = await supabase.from('leads_manos_crm').select('id, name, phone, status');
    console.log('Leads list:');
    leads.forEach(l => console.log(`- ${l.name} (${l.phone}) [${l.status}]`));
}

count();
