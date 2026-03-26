const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function matchByEmail() {
    console.log('Fetching data...');
    const [consultantsRes, authRes] = await Promise.all([
        supabaseAdmin.from('consultants_manos_crm').select('id, name, email, auth_id'),
        supabaseAdmin.auth.admin.listUsers()
    ]);
    
    const consultants = consultantsRes.data;
    const authUsers = authRes.data.users;
    
    const authEmailMap = new Map(authUsers.map(u => [u.email.toLowerCase(), u.id]));
    const needsUpdate = [];
    const trulyMissing = [];
    
    for (const c of consultants) {
        if (!c.email) continue;
        const email = c.email.toLowerCase();
        const correctAuthId = authEmailMap.get(email);
        
        if (correctAuthId) {
            if (c.auth_id !== correctAuthId) {
                needsUpdate.push({ id: c.id, name: c.name, email, old_auth_id: c.auth_id, new_auth_id: correctAuthId });
            }
        } else {
            trulyMissing.push({ id: c.id, name: c.name, email });
        }
    }
    
    console.log('Consultants that need auth_id update (email exists in Auth):');
    console.table(needsUpdate);

}

matchByEmail();
