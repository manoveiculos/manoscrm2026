import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminEmail = 'alexandre_gorges@hotmail.com';

        if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key') {
            return NextResponse.json({ error: 'Chave SERVICE_ROLE não configurada corretamente no .env.local' }, { status: 500 });
        }

        // Cliente com poderes de administração (ignora RLS e confirma e-mail)
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        console.log(`[AUTH API] Iniciando destravamento para: ${adminEmail}`);

        // 1. Buscar o usuário
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const user = users.find(u => u.email === adminEmail);

        if (!user) {
            console.log(`[AUTH API] Usuário não encontrado, tentando criar...`);
            const { error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: adminEmail,
                password: 'Manos374@',
                email_confirm: true,
                user_metadata: { full_name: 'Alexandre Gorges' }
            });
            if (createError) throw createError;
        } else {
            // 2. Forçar confirmação se já existir
            console.log(`[AUTH API] Usuário encontrado. Confirmando e-mail...`);
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
                email_confirm: true
            });
            if (updateError) throw updateError;
        }

        // 3. Garantir registro na tabela de consultores como Admin Ativo
        console.log(`[AUTH API] Garantindo permissões de Admin no CRM...`);
        const { error: dbError } = await supabaseAdmin
            .from('consultants_manos_crm')
            .upsert({
                email: adminEmail,
                name: 'Alexandre Gorges',
                role: 'admin',
                status: 'active'
            }, { onConflict: 'email' });

        if (dbError) {
            console.error(`[AUTH API] Erro ao atualizar banco:`, dbError.message);
            // Seguimos mesmo assim, o importante é o Auth estar liberado
        }

        return NextResponse.json({ message: 'Usuário Alexandre destravado com sucesso!' });
    } catch (err: unknown) {
        const error = err as Error;
        console.error('[AUTH API] Erro crítico:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
