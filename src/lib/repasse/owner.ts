import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Repasse multi-tenant por usuário.
 *
 * O "dono" de cada linha do repasse é o EMAIL do usuário logado (coluna
 * owner_email). Cada usuário só enxerga/edita as próprias linhas — antes o
 * módulo era chumbado no paulo@manoscrm.com.
 *
 * Resolve o email da sessão pelo cookie (Supabase Auth). Retorna null se não
 * autenticado — a rota deve responder 401 nesse caso.
 */
export async function getRepasseOwner(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const sb = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll: () => cookieStore.getAll(),
                    setAll: () => {},
                },
            }
        );
        const { data: { user } } = await sb.auth.getUser();
        return user?.email?.toLowerCase() || null;
    } catch {
        return null;
    }
}
