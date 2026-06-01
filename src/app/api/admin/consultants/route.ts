import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * /api/admin/consultants
 *
 * GET  → lista consultores + sinaliza configuração faltando
 *        (sem personal_whatsapp, sem user_id, sem phone)
 * POST → upsert dos campos editáveis: name, phone, personal_whatsapp,
 *        is_active, role, user_id, email
 *
 * Auth: header `x-admin-secret` === CRON_SECRET. Simples e suficiente
 * pra uma tela administrativa interna.
 */

const EDITABLE = ['name', 'phone', 'personal_whatsapp', 'is_active', 'role', 'user_id', 'email', 'status', 'auth_id'] as const;

function ensureAuth(req: NextRequest): NextResponse | null {
    const secret = req.headers.get('x-admin-secret');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return null;
}

export async function GET(req: NextRequest) {
    const fail = ensureAuth(req);
    if (fail) return fail;

    const admin = createClient();
    
    // 1. Buscar os consultores na tabela do CRM
    const { data: dbConsultants, error: dbError } = await admin
        .from('consultants_manos_crm')
        .select('id, name, email, phone, personal_whatsapp, user_id, auth_id, is_active, role, status, last_lead_assigned_at')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true });

    if (dbError) {
        return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 2. Buscar todas as contas de autenticação do Supabase Auth
    let authUsers: any[] = [];
    try {
        const { data: authData, error: authError } = await admin.auth.admin.listUsers();
        if (!authError && authData?.users) {
            authUsers = authData.users;
        }
    } catch (e) {
        console.error('Falha ao listar usuários do auth:', e);
    }

    const consultants = (dbConsultants || []).map((c: any) => ({
        ...c,
        missing: {
            personal_whatsapp: !c.personal_whatsapp,
            user_id: !c.user_id,
            phone: !c.phone,
        },
        is_unlinked: false,
    }));

    // 3. Cruzar dados: Identificar logins no auth que não têm registro no CRM (como Ivo)
    const dbAuthIds = new Set(consultants.map(c => c.auth_id || c.user_id).filter(Boolean));
    const dbEmails = new Set(consultants.map(c => c.email?.toLowerCase()).filter(Boolean));

    authUsers.forEach((user: any) => {
        const hasAuthId = dbAuthIds.has(user.id);
        const hasEmail = user.email && dbEmails.has(user.email.toLowerCase());

        if (!hasAuthId && !hasEmail) {
            // Conta de autenticação que está no Supabase mas não está no CRM
            consultants.push({
                id: `unlinked-${user.id}`,
                name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário Sem Nome',
                email: user.email || null,
                phone: user.phone || null,
                personal_whatsapp: null,
                user_id: user.id,
                auth_id: user.id,
                is_active: false,
                role: null,
                status: 'pending', // Exibe como pendente para aprovação
                last_lead_assigned_at: null,
                is_unlinked: true,
                missing: {
                    personal_whatsapp: true,
                    user_id: false,
                    phone: true,
                },
            });
        }
    });

    return NextResponse.json({ ok: true, consultants });
}

export async function POST(req: NextRequest) {
    const fail = ensureAuth(req);
    if (fail) return fail;

    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    for (const k of EDITABLE) {
        if (k in body) updates[k] = body[k];
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
    }

    const admin = createClient();

    if (id.startsWith('unlinked-')) {
        // Usuário do auth que não tem registro no CRM. Vamos criá-lo!
        const realAuthId = id.replace('unlinked-', '');
        
        let authEmail = updates.email || body.email;
        let authName = updates.name || body.name;
        let authPhone = updates.phone || body.phone;

        // Se faltar email ou nome, busca os dados da conta no Auth do Supabase
        if (!authEmail || !authName) {
            try {
                const { data, error: authUserError } = await admin.auth.admin.getUserById(realAuthId);
                const authUser = data?.user;
                if (!authUserError && authUser) {
                    if (!authEmail) authEmail = authUser.email;
                    if (!authName) authName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Novo Consultor';
                    if (!authPhone) authPhone = authUser.phone || null;
                }
            } catch (err) {
                console.error('Erro ao buscar dados do usuário no Auth:', err);
            }
        }

        if (!authEmail) {
            return NextResponse.json({ error: 'O usuário não possui um e-mail cadastrado na autenticação do Supabase.' }, { status: 400 });
        }
        
        const insertData = {
            auth_id: realAuthId,
            user_id: realAuthId,
            name: authName,
            email: authEmail,
            phone: authPhone,
            personal_whatsapp: updates.personal_whatsapp || body.personal_whatsapp || null,
            role: updates.role || body.role || 'vendedor',
            status: updates.status || body.status || 'active',
            is_active: updates.is_active !== undefined ? updates.is_active : true
        };

        const { error: insertError } = await admin
            .from('consultants_manos_crm')
            .insert([insertData]);

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
    } else {
        // Atualização de registro existente
        const { error } = await admin
            .from('consultants_manos_crm')
            .update(updates)
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
}

export async function DELETE(req: NextRequest) {
    const fail = ensureAuth(req);
    if (fail) return fail;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    }

    const admin = createClient();

    if (id.startsWith('unlinked-')) {
        // Usuário apenas do Auth (não cadastrado no CRM). Deleta direto do Supabase Auth.
        const realAuthId = id.replace('unlinked-', '');
        const { error: authError } = await admin.auth.admin.deleteUser(realAuthId);
        if (authError) {
            return NextResponse.json({ error: `Erro ao deletar do Supabase Auth: ${authError.message}` }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }

    // 1. Buscar o consultor para obter o auth_id correspondente
    const { data: consultant, error: fetchError } = await admin
        .from('consultants_manos_crm')
        .select('auth_id')
        .eq('id', id)
        .maybeSingle();

    if (fetchError) {
        return NextResponse.json({ error: `Erro ao buscar consultor: ${fetchError.message}` }, { status: 500 });
    }

    if (!consultant) {
        return NextResponse.json({ error: 'Consultor não encontrado' }, { status: 404 });
    }

    // 2. Excluir o consultor da tabela do CRM
    const { error: dbError } = await admin
        .from('consultants_manos_crm')
        .delete()
        .eq('id', id);

    if (dbError) {
        return NextResponse.json({ error: `Erro ao deletar do banco: ${dbError.message}` }, { status: 500 });
    }

    // 3. Excluir a conta correspondente no Supabase Auth se o auth_id existir
    if (consultant.auth_id) {
        const { error: authError } = await admin.auth.admin.deleteUser(consultant.auth_id);
        if (authError) {
            console.error(`Erro ao deletar usuário do auth: ${authError.message}`);
            return NextResponse.json({ 
                ok: true, 
                warning: `Registro no CRM foi deletado com sucesso, mas a conta no Supabase Auth não pôde ser excluída: ${authError.message}` 
            });
        }
    }

    return NextResponse.json({ ok: true });
}
