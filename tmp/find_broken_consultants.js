const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function findBrokenConsultants() {
    console.log('Fetching consultants and Auth users...');
    
    const [consultantsRes, authRes] = await Promise.all([
        supabaseAdmin.from('consultants_manos_crm').select('id, name, email, auth_id, is_active'),
        supabaseAdmin.auth.admin.listUsers()
    ]);
    
    if (consultantsRes.error) {
        console.error('Error fetching consultants:', consultantsRes.error);
        return;
    }
    
    if (authRes.error) {
        console.error('Error fetching Auth users:', authRes.error);
        return;
    }
    
    const consultants = consultantsRes.data;
    const authUsers = authRes.data.users;
    
    const authUserMap = new Map(authUsers.map(u => [u.id, u]));
    const broken = [];
    
    for (const c of consultants) {
        if (!c.auth_id) {
            broken.push({ ...c, issue: 'Missing auth_id' });
        } else if (!authUserMap.has(c.auth_id)) {
            broken.push({ ...c, issue: 'Invalid auth_id (not in Auth)' });
        }
    }
    
    console.log(`Found ${broken.length} broken consultants:`);
    console.table(broken);
}

findBrokenConsultants();
