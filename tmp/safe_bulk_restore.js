const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://jkblxdxnbmciicakusnl.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ'
);

async function run() {
    try {
        console.log('--- INICIANDO RESTAURAÇÃO ATÔMICA ---');
        
        const { data: { users }, error: authListError } = await supabase.auth.admin.listUsers();
        if (authListError) throw authListError;
        const authEmails = new Set(users.map(u => u.email.toLowerCase()));

        const { data: consultants, error: dbError } = await supabase.from('consultants_manos_crm').select('*');
        if (dbError) throw dbError;

        console.log(`Analisando ${consultants.length} perfis...`);

        for (const c of consultants) {
            const originalEmail = c.email.toLowerCase();
            
            if (!authEmails.has(originalEmail)) {
                console.log(`\nProcessando: ${originalEmail}`);
                
                // 1. Renomeação Atômica (Previne erro de gatilho de duplicidade)
                const tempEmail = `restaurando_${originalEmail}`;
                await supabase.from('consultants_manos_crm').update({ email: tempEmail }).eq('id', c.id);

                // 2. Criação do Usuário no Auth
                const { data: auth, error: createError } = await supabase.auth.admin.createUser({
                    email: originalEmail,
                    password: 'Mudar@123',
                    email_confirm: true
                });

                if (createError) {
                    console.error(`ERRO ao criar ${originalEmail}: ${createError.message}`);
                    // Reverter e-mail mesmo em erro
                    await supabase.from('consultants_manos_crm').update({ email: originalEmail }).eq('id', c.id);
                    continue;
                }

                console.log(`Conta Auth criada com sucesso.`);

                // 3. Vínculo e Restauração de E-mail
                await supabase.from('consultants_manos_crm').update({
                    auth_id: auth.user.id,
                    email: originalEmail,
                    is_active: true,
                    status: 'active'
                }).eq('id', c.id);

                // 4. Limpeza de duplicata (Gatilho pode ter criado um novo registro ao detectar novo Auth user)
                await supabase.from('consultants_manos_crm').delete().eq('auth_id', auth.user.id).neq('id', c.id);

                console.log(`Restauração concluída para: ${originalEmail}`);
            } else {
                console.log(`Usuário já existe no Auth: ${originalEmail} - Garantido acesso.`);
                const existing = users.find(u => u.email.toLowerCase() === originalEmail);
                await supabase.from('consultants_manos_crm').update({
                    auth_id: existing.id,
                    is_active: true,
                    status: 'active'
                }).eq('id', c.id);
            }
        }

        console.log('\n--- PROCESSO CONCLUÍDO COM SUCESSO ---');
    } catch (e) {
        console.error('\nERRO CRÍTICO NO PROCESSO:', e.message);
    } finally {
        process.exit();
    }
}

run();
