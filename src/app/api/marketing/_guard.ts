import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

export type GuardAdmin =
    | { ok: true; email: string }
    | { ok: false; res: NextResponse };

const ALEXANDRE_EMAIL = 'alexandre_gorges@hotmail.com';

/**
 * Guard REAL (sessão do cookie no servidor) pro painel /admin/marketing.
 * Usado só nas rotas que MUDAM estado (aprovar/rejeitar) — a leitura do feed
 * segue o mesmo padrão já usado em /api/admin/live-feed (sem guard extra,
 * protegido pela navegação restrita a admin no client).
 */
export async function requireAdmin(): Promise<GuardAdmin> {
    try {
        const auth = await createAuthClient();
        const { data: { user } } = await auth.auth.getUser();
        const email = (user?.email || '').toLowerCase();
        if (!email) {
            return { ok: false, res: NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 }) };
        }

        if (email === ALEXANDRE_EMAIL) {
            return { ok: true, email };
        }

        const { data } = await createAdminClient()
            .from('consultants_manos_crm')
            .select('role')
            .or(`user_id.eq.${user!.id},auth_id.eq.${user!.id}`)
            .maybeSingle();

        if (data?.role !== 'admin') {
            return { ok: false, res: NextResponse.json({ success: false, error: 'acesso restrito a admins' }, { status: 403 }) };
        }

        return { ok: true, email };
    } catch (e: any) {
        return { ok: false, res: NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 }) };
    }
}

/**
 * Guard do endpoint de INGESTÃO (POST /api/marketing/runs) — chamado pelos
 * próprios agentes/skills (Claude Code/Cowork rodando fora do CRM), não por
 * um usuário logado. Autenticação por secret de header, mesmo padrão do
 * X-Meta-Capi-Secret em /api/meta-capi/vehicle.
 */
export function requireSquadSecret(req: Request): { ok: true } | { ok: false; res: NextResponse } {
    const configured = process.env.MARKETING_SQUAD_API_SECRET;
    if (!configured) {
        // Sem secret configurado, endpoint fica aberto — igual ao comportamento
        // do meta-capi. Evite isso em produção: defina MARKETING_SQUAD_API_SECRET.
        return { ok: true };
    }
    const header = req.headers.get('x-marketing-squad-secret');
    if (header !== configured) {
        return { ok: false, res: NextResponse.json({ success: false, error: 'secret inválido' }, { status: 401 }) };
    }
    return { ok: true };
}
