const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://jkblxdxnbmciicakusnl.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ'
);

async function run() {
    console.log('--- START ---');
    try {
        console.log('Fetching users...');
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        if (error) {
            console.error('Error fetching users:', error.message);
        } else {
            console.log('Users found:', users.length);
            users.forEach(u => console.log(`- ${u.email}`));
        }

        console.log('\nFetching consultants...');
        const { data: consultants, error: dbError } = await supabase
            .from('consultants_manos_crm')
            .select('email, name');
        
        if (dbError) {
            console.error('Error fetching db:', dbError.message);
        } else {
            console.log('Consultants found:', consultants.length);
            consultants.forEach(c => console.log(`- ${c.email} (${c.name})`));
        }

    } catch (e) {
        console.error('Unexpected error:', e);
    } finally {
        console.log('--- DONE ---');
        process.exit();
    }
}

run();
