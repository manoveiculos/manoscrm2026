const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://jkblxdxnbmciicakusnl.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ'
);

async function run() {
    try {
        console.log('RESTAURACAO_INICIAL');
        
        const { data: { users }, error: authListError } = await supabase.auth.admin.listUsers();
        if (authListError) throw authListError;
        const authEmails = new Set(users.map(u => u.email.toLowerCase()));
        console.log(`AUTH_TOTAL: ${users.length}`);

        const { data: consultants, error: dbError } = await supabase.from('consultants_manos_crm').select('*');
        if (dbError) throw dbError;
        console.log(`DB_TOTAL: ${consultants.length}`);

        for (const c of consultants) {
            const originalEmail = c.email.toLowerCase();
            console.log(`\nVERIFICANDO: ${originalEmail}`);
            
            if (!authEmails.has(originalEmail)) {
                console.log(`  ACAO: Restaurar`);
                
                // Rename atomic
                const tempEmail = `restore_${Math.floor(Math.random()*1000)}_${originalEmail}`;
                console.log(`  TEMP: ${tempEmail}`);
                await supabase.from('consultants_manos_crm').update({ email: tempEmail }).eq('id', c.id);

                // Create Auth
                console.log(`  AUTH: Criando...`);
                const { data: auth, error: createError } = await supabase.auth.admin.createUser({
                    email: originalEmail,
                    password: 'Mudar@123',
                    email_confirm: true
                });

                if (createError) {
                    console.error(`  ERRO_AUTH: ${createError.message}`);
                    await supabase.from('consultants_manos_crm').update({ email: originalEmail }).eq('id', c.id);
                    continue;
                }

                console.log(`  ID: ${auth.user.id}`);

                // Relink
                await supabase.from('consultants_manos_crm').update({
                    auth_id: auth.user.id,
                    email: originalEmail,
                    is_active: true,
                    status: 'active'
                }).eq('id', c.id);

                // Cleanup duplicates
                await supabase.from('consultants_manos_crm').delete().eq('auth_id', auth.user.id).neq('id', c.id);
                console.log(`  SUCESSO`);
            } else {
                console.log(`  ACAO: Atualizar Status`);
                const existing = users.find(u => u.email.toLowerCase() === originalEmail);
                await supabase.from('consultants_manos_crm').update({
                    auth_id: existing.id,
                    is_active: true,
                    status: 'active'
                }).eq('id', c.id);
                console.log(`  OK`);
            }
        }

        console.log('\nRESTAURACAO_FINALIZADA');
    } catch (e) {
        console.error('ERRO_FATAL:', e.message);
    } finally {
        setTimeout(() => process.exit(), 1000);
    }
}

run();
