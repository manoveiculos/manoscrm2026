const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://jkblxdxnbmciicakusnl.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ'
);

async function run() {
    try {
        console.log('Fetching Auth users...');
        const { data: { users }, error: authListError } = await supabase.auth.admin.listUsers();
        if (authListError) throw authListError;
        
        const authEmails = new Set(users.map(u => u.email.toLowerCase()));
        
        console.log('Fetching Consultants...');
        const { data: consultants, error: dbError } = await supabase.from('consultants_manos_crm').select('*');
        if (dbError) throw dbError;

        console.log(`Processing ${consultants.length} consultants...`);

        for (const c of consultants) {
            const email = c.email.toLowerCase();
            
            if (!authEmails.has(email)) {
                console.log(`\n--- Restoring: ${email} ---`);
                
                // 1. Rename existing in DB to avoid trigger conflict
                console.log('Renaming DB record temporarily...');
                const { error: renameErr } = await supabase
                    .from('consultants_manos_crm')
                    .update({ email: 'restoring_' + c.email })
                    .eq('id', c.id);
                
                if (renameErr) {
                    console.error(`Error renaming ${email}:`, renameErr.message);
                    continue;
                }

                // 2. Create Auth user
                console.log('Creating Auth user...');
                const { data: auth, error: createError } = await supabase.auth.admin.createUser({
                    email: email,
                    password: 'Mudar@123',
                    email_confirm: true
                });

                if (createError) {
                    console.error(`FAILED to create Auth user ${email}:`, createError.message);
                    // Try to restore email
                    await supabase.from('consultants_manos_crm').update({ email: c.email }).eq('id', c.id);
                    continue;
                }

                console.log(`Auth user created: ${auth.user.id}`);

                // 3. Link back and restore original email
                console.log('Relinking and restoring email...');
                const { error: updateErr } = await supabase
                    .from('consultants_manos_crm')
                    .update({
                        auth_id: auth.user.id,
                        email: c.email,
                        is_active: true
                    })
                    .eq('id', c.id);

                if (updateErr) {
                    console.error(`Error relinking ${email}:`, updateErr.message);
                }

                // 4. Cleanup duplicate if trigger created it
                console.log('Cleaning up duplicates...');
                await supabase
                    .from('consultants_manos_crm')
                    .delete()
                    .eq('auth_id', auth.user.id)
                    .neq('id', c.id);

                console.log(`Success for ${email}`);
            } else {
                console.log(`Already exists: ${email}. Fixing ID and status...`);
                const existingUser = users.find(u => u.email.toLowerCase() === email);
                await supabase
                    .from('consultants_manos_crm')
                    .update({
                        auth_id: existingUser.id,
                        is_active: true
                    })
                    .eq('id', c.id);
            }
        }

        console.log('\nFULL_RESTORE_COMPLETED_SUCCESSFULLY');
    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    } finally {
        process.exit();
    }
}

run();
