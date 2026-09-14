import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import type { NomeSocio } from '@/lib/services/societarioAcerto';

export type GuardSocio =
    | { ok: true; email: string; nome: NomeSocio | null }
    | { ok: false; res: NextResponse };

/**
 * Guard REAL (sessão do cookie no servidor). Divisão de lucro é só dos sócios
 * ativos em usuarios_socios — as rotas usam service role, então sem isso qualquer
 * um com a URL lia os números e gravava contrato.
 */
export async function requireSocio(): Promise<GuardSocio> {
    try {
        const auth = await createAuthClient();
        const { data: { user } } = await auth.auth.getUser();
        const email = (user?.email || '').toLowerCase();
        if (!email) return { ok: false, res: NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 }) };

        const { data } = await createAdminClient()
            .from('usuarios_socios')
            .select('ativo, nome')
            .eq('email', email)
            .maybeSingle();
        if (!data?.ativo) return { ok: false, res: NextResponse.json({ success: false, error: 'acesso restrito aos sócios' }, { status: 403 }) };

        const nome = (data.nome || '').trim().toLowerCase();
        return { ok: true, email, nome: nome.startsWith('ivo') ? 'Ivo' : nome.startsWith('alex') ? 'Alexandre' : null };
    } catch (e: any) {
        return { ok: false, res: NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 }) };
    }
}
