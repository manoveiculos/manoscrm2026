import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

export const supabaseAdmin = createAdminClient();

export type VendedorCtx =
    | { ok: true; authId: string; email: string; isAdmin: boolean }
    | { ok: false; res: NextResponse };

// Identidade REAL do vendedor logado (lê a sessão do cookie no servidor).
export async function requireVendedor(): Promise<VendedorCtx> {
    try {
        const auth = await createAuthClient();
        const { data: { user } } = await auth.auth.getUser();
        if (!user) return { ok: false, res: NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 }) };
        const email = (user.email || '').toLowerCase();
        let isAdmin = email === 'alexandre_gorges@hotmail.com';
        if (!isAdmin) {
            const { data: c } = await supabaseAdmin.from('consultants_manos_crm').select('role').eq('auth_id', user.id).maybeSingle();
            isAdmin = c?.role === 'admin';
        }
        return { ok: true, authId: user.id, email, isAdmin };
    } catch (e: any) {
        return { ok: false, res: NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 }) };
    }
}

// Início do dia em horário de Brasília (UTC-3), expresso em UTC ISO.
export function startOfTodayBRT(): string {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 3600_000);
    return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0)).toISOString();
}
