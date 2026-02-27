
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
    console.log('--- Cleaning up duplicates ---');

    // Wilson duplicate
    await supabase.from('leads_manos_crm').delete().eq('id', 'b7dc50f6-ac15-472a-b40a-ab5f0167e005');
    console.log('Deleted duplicate Wilson');

    // Alexandre duplicate
    await supabase.from('leads_manos_crm').delete().eq('id', 'ca3baa08-c0ea-4fec-8823-32cc30d5113e');
    console.log('Deleted duplicate Alexandre');
}

cleanup();
