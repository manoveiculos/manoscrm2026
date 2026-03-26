const { createClient } = require('@supabase/supabase-js');
// require('dotenv').config({ path: '.env.local' });


const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';



const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkConsultants() {
    const { data, error } = await supabase
        .from('consultants_manos_crm')
        .select('id, name, email, auth_id, is_active')
        .ilike('name', '%Karoline%');

    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log('Consultants:');
    console.table(data);
}

checkConsultants();
