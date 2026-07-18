import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

// Acesso ao app RG Scooters: só o Renato e o admin (Alexandre).
export const OWNER = 'renato@manos.com.br';
const ALLOWED = new Set([OWNER, 'alexandre_gorges@hotmail.com']);

export const supabaseAdmin = createAdminClient();

export type Guard =
    | { ok: true; email: string; isAdmin: boolean }
    | { ok: false; res: NextResponse };

/**
 * Guard REAL (lê a sessão do cookie no servidor — não dá pra forjar no cliente).
 * Libera apenas Renato, Alexandre, ou qualquer consultor com role='admin'.
 */
export async function requireScooterAccess(): Promise<Guard> {
    try {
        const auth = await createAuthClient();
        const { data: { user } } = await auth.auth.getUser();
        const email = (user?.email || '').toLowerCase();
        if (!email) return { ok: false, res: NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 }) };

        if (ALLOWED.has(email)) return { ok: true, email, isAdmin: email !== OWNER };

        // Qualquer admin do CRM também controla o app do Renato
        const { data: c } = await supabaseAdmin
            .from('consultants_manos_crm')
            .select('role')
            .eq('auth_id', user!.id)
            .maybeSingle();
        if (c?.role === 'admin') return { ok: true, email, isAdmin: true };

        return { ok: false, res: NextResponse.json({ success: false, error: 'acesso negado' }, { status: 403 }) };
    } catch (e: any) {
        return { ok: false, res: NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 }) };
    }
}
