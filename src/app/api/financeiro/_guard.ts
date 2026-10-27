import { NextResponse, NextRequest } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { isFinanceiroAutorizado, FINANCEIRO_EMAILS } from '@/lib/financeiro/types';

export interface GuardFinanceiro {
    ok: true;
    userEmail: string;
    effectiveOwner: string; // o dono da conta/dados sendo operados
    isAlexandre: boolean;
    adminClient: ReturnType<typeof createAdminClient>;
}

export type GuardFinanceiroResult =
    | GuardFinanceiro
    | { ok: false; res: NextResponse };

export async function requireFinanceiro(req?: NextRequest): Promise<GuardFinanceiroResult> {
    try {
        const auth = await createAuthClient();
        const { data: { user } } = await auth.auth.getUser();
        const email = (user?.email || '').trim().toLowerCase();

        if (!email) {
            return {
                ok: false,
                res: NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 }),
            };
        }

        if (!isFinanceiroAutorizado(email)) {
            return {
                ok: false,
                res: NextResponse.json({ success: false, error: 'Acesso restrito ao Financeiro' }, { status: 403 }),
            };
        }

        const isAlexandre = email === 'alexandre_gorges@hotmail.com';
        let effectiveOwner = email;

        // Se Alexandre quiser ver/organizar a caixa do Ledra (ou a sua própria)
        if (isAlexandre && req) {
            const url = new URL(req.url);
            const target = url.searchParams.get('owner') || req.headers.get('x-financeiro-owner');
            if (target && FINANCEIRO_EMAILS.includes(target.toLowerCase())) {
                effectiveOwner = target.toLowerCase();
            }
        }

        const adminClient = createAdminClient();

        return {
            ok: true,
            userEmail: email,
            effectiveOwner,
            isAlexandre,
            adminClient,
        };
    } catch (err: any) {
        return {
            ok: false,
            res: NextResponse.json({ success: false, error: err?.message || 'Erro de autenticação' }, { status: 500 }),
        };
    }
}
