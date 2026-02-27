
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
    console.log('--- Finding duplicates in leads_manos_crm ---');
    const { data: leads, error } = await supabase
        .from('leads_manos_crm')
        .select('id, name, phone, vehicle_interest, created_at');

    if (error) {
        console.error('Error fetching leads:', error);
        return;
    }

    const seen = new Map();
    const duplicates = [];

    leads.forEach(lead => {
        // We define duplicate as same phone AND same name (or just phone?)
        // The user screenshot showed same phone/name/interest.
        const key = `${lead.phone}`; // Using phone as unique identifier
        if (seen.has(key)) {
            duplicates.push({ original: seen.get(key), duplicate: lead });
        } else {
            seen.set(key, lead);
        }
    });

    console.log(`Found ${duplicates.length} duplicates.`);
    duplicates.forEach(d => {
        console.log(`Duplicate found: ${d.duplicate.name} (${d.duplicate.phone}) - Original ID: ${d.original.id}, Duplicate ID: ${d.duplicate.id}`);
    });

    // Cleanup part (optional for now, let's see them first)
    /*
    for (const d of duplicates) {
        await supabase.from('leads_manos_crm').delete().eq('id', d.duplicate.id);
        console.log(`Deleted duplicate ${d.duplicate.id}`);
    }
    */
}

checkDuplicates();
