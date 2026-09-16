import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/consultants/reset-password
 *
 * Permite que um administrador altere/redefina a senha de qualquer consultor
 * utilizando a Service Role Key do Supabase.
 *
 * Auth: Header `x-admin-secret` === CRON_SECRET.
 */

function ensureAuth(req: NextRequest): NextResponse | null {
    const secret = req.headers.get('x-admin-secret');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Nível de acesso não autorizado (Chave admin incorreta).' }, { status: 401 });
    }
    return null;
}

export async function POST(req: NextRequest) {
    const fail = ensureAuth(req);
    if (fail) return fail;

    try {
        const body = await req.json().catch(() => ({}));
        const { auth_id, id, new_password } = body;

        if (!new_password || typeof new_password !== 'string' || new_password.trim().length < 6) {
            return NextResponse.json({ error: 'A nova senha deve possuir no mínimo 6 caracteres.' }, { status: 400 });
        }

        const admin = createClient();
        let targetAuthId = auth_id;

        // Se auth_id não for informado diretamente, tenta buscar pelo ID do consultor no banco
        if (!targetAuthId && id) {
            if (typeof id === 'string' && id.startsWith('unlinked-')) {
                targetAuthId = id.replace('unlinked-', '');
            } else {
                const { data: consultant, error: fetchErr } = await admin
                    .from('consultants_manos_crm')
                    .select('auth_id, user_id')
                    .eq('id', id)
                    .maybeSingle();

                if (fetchErr) {
                    return NextResponse.json({ error: `Erro ao buscar consultor: ${fetchErr.message}` }, { status: 500 });
                }

                targetAuthId = consultant?.auth_id || consultant?.user_id;
            }
        }

        if (!targetAuthId) {
            return NextResponse.json({ error: 'Usuário sem ID de autenticação do Supabase (auth_id) vinculado.' }, { status: 400 });
        }

        // Atualiza a senha no Supabase Auth usando as credenciais administrativas
        const { data: updateData, error: updateError } = await admin.auth.admin.updateUserById(
            targetAuthId,
            { password: new_password }
        );

        if (updateError) {
            return NextResponse.json({ error: `Erro no Supabase Auth ao alterar senha: ${updateError.message}` }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            message: 'Senha alterada com sucesso no Supabase Auth!',
            user_id: updateData.user.id,
            email: updateData.user.email
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Erro interno ao redefinir senha.' }, { status: 500 });
    }
}
