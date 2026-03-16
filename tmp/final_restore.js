const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://jkblxdxnbmciicakusnl.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ'
);

const USERS_TO_RESTORE = [
    { 
        oldEmail: 'victor@manoveiculos.com.br', 
        newEmail: 'victorramoncarpes@gmail.com', 
        name: 'Victor Ramon Carpes' 
    },
    { 
        oldEmail: 'felipe@manoveiculos.com.br', 
        newEmail: 'Hgledra@hotmail.com', 
        name: 'Felipe Ledra (Hgledra)' 
    },
    { 
        oldEmail: 'wilson@manoveiculos.com.br', 
        newEmail: 'Dultra49@gmail.com', 
        name: 'Wilson Alcantara Dultra Netto' 
    }
];

async function run() {
    console.log('--- START FINAL RESTORATION ---');
    
    for (const user of USERS_TO_RESTORE) {
        console.log(`\nProcessing: ${user.name}`);
        try {
            // 1. Update existing consultant record to the new email
            console.log(`Updating consultant ${user.oldEmail} to ${user.newEmail}...`);
            const { data: updateData, error: updateError } = await supabase
                .from('consultants_manos_crm')
                .update({ email: user.newEmail })
                .eq('email', user.oldEmail)
                .select();

            if (updateError) {
                console.error(`Error updating consultant: ${updateError.message}`);
                // If update fails because user already has newEmail, that's fine, we continue.
                if (!updateError.message.includes('unique constraint')) {
                     // continue to auth creation even if update failed for other reasons? 
                     // maybe better to see why it failed.
                }
            } else {
                console.log('Consultant email updated successfully.');
            }

            // 2. Create Auth user
            console.log(`Creating Auth user for ${user.newEmail}...`);
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: user.newEmail,
                password: 'Mudar@123',
                email_confirm: true
            });

            if (authError) {
                if (authError.message.includes('already been registered')) {
                    console.log('Auth user already exists.');
                    // If it exists, we still need to link it.
                    const { data: { users } } = await supabase.auth.admin.listUsers();
                    const existingUser = users.find(u => u.email.toLowerCase() === user.newEmail.toLowerCase());
                    if (existingUser) {
                        console.log(`Linking existing Auth ID: ${existingUser.id}`);
                        await supabase
                            .from('consultants_manos_crm')
                            .update({ auth_id: existingUser.id, is_active: true })
                            .eq('email', user.newEmail);
                    }
                } else {
                    console.error(`Error creating Auth user: ${authError.message}`);
                }
            } else {
                console.log(`Auth user created successfully: ${authData.user.id}`);
                
                // 3. Link the new Auth ID back to the consultant record
                console.log(`Linking Auth ID to consultant...`);
                const { error: linkError } = await supabase
                    .from('consultants_manos_crm')
                    .update({ auth_id: authData.user.id, is_active: true })
                    .eq('email', user.newEmail);

                if (linkError) {
                    console.error(`Error linking Auth ID: ${linkError.message}`);
                } else {
                    console.log('Link successful.');
                }
            }

        } catch (e) {
            console.error(`Unexpected error for ${user.newEmail}:`, e);
        }
    }

    console.log('\n--- RESTORATION LOG COMPLETED ---');
    process.exit();
}

run();
