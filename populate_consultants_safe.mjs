
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateConsultants() {
    const consultants = [
        { name: 'Wilson', is_active: true },
        { name: 'Sergio', is_active: true },
        { name: 'Victor', is_active: true },
        { name: 'Camila', is_active: true }
    ];

    // Manual check and insert
    for (const c of consultants) {
        const { data } = await supabase.from('consultants_manos_crm').select('id').eq('name', c.name).limit(1);
        if (!data || data.length === 0) {
            console.log(`Inserting ${c.name}...`);
            await supabase.from('consultants_manos_crm').insert(c);
        } else {
            console.log(`${c.name} already exists.`);
        }
    }
}

populateConsultants();
