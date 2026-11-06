// src/lib/fila/servidor.ts — identidade e leads do consultor (SÓ SERVIDOR)
//
// As rotas /api/fila/* confirmam a sessão pelo cookie e só então usam o
// cliente com chave de serviço — que nunca vai para o navegador.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { perfilDoConsultor, type Perfil } from '@/lib/perfil';

export interface ConsultorLogado {
    authId: string;
    email: string;
    /** id em consultants_manos_crm; null = admin sem linha de consultor. */
    consultorId: string | null;
    nome: string | null;
    perfil: Perfil;
}

export type Contexto =
    | { ok: true; admin: SupabaseClient; eu: ConsultorLogado }
    | { ok: false; res: NextResponse };

const erro = (status: number, error: string) =>
    NextResponse.json({ success: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function consultorLogado(): Promise<Contexto> {
    const auth = await createAuthClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false, res: erro(401, 'não autenticado') };

    const admin = createAdminClient();
    const { data: c } = await admin
        .from('consultants_manos_crm')
        .select('id, name, role, is_active, status')
        .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
        .maybeSingle();

    const email = (user.email || '').toLowerCase();
    const perfil = perfilDoConsultor(c?.role, email);
    if (!c && perfil !== 'admin') return { ok: false, res: erro(403, 'consultor não encontrado') };
    if (c && (c.is_active === false || (c.status && c.status !== 'active'))) return { ok: false, res: erro(403, 'consultor inativo') };

    return {
        ok: true,
        admin,
        eu: { authId: user.id, email, consultorId: c?.id || null, nome: c?.name || null, perfil },
    };
}

// ── Tabelas de lead que a fila conhece ───────────────────────────────────

export type TabelaFila = 'leads_distribuicao_crm_26' | 'leadsfacebook' | 'leads_manos_crm';

export const COLUNAS_LEAD: Record<TabelaFila, { nome: string; telefone: string; atualizado: string; idInteiro: boolean }> = {
    leads_distribuicao_crm_26: { nome: 'nome', telefone: 'telefone', atualizado: 'atualizado_em', idInteiro: true },
    leadsfacebook: { nome: 'nome', telefone: 'phone', atualizado: 'updated_at', idInteiro: false },
    leads_manos_crm: { nome: 'name', telefone: 'phone', atualizado: 'updated_at', idInteiro: false },
};

export function separarUid(uid: unknown): { table: TabelaFila; id: string | number } | null {
    const s = String(uid || '');
    const i = s.indexOf(':');
    if (i <= 0) return null;
    const table = s.slice(0, i) as TabelaFila;
    if (!(table in COLUNAS_LEAD)) return null;
    const bruto = s.slice(i + 1);
    if (COLUNAS_LEAD[table].idInteiro) {
        const n = Number(bruto);
        return Number.isInteger(n) && n > 0 ? { table, id: n } : null;
    }
    return /^[0-9a-f-]{36}$/i.test(bruto) ? { table, id: bruto } : null;
}

/**
 * Lê o lead e confere se é do consultor logado (admin e gestor podem mexer
 * em qualquer um). Devolve o erro pronto para a rota responder.
 */
export async function leadDoConsultor(
    admin: SupabaseClient,
    eu: ConsultorLogado,
    uid: unknown,
    colunas: string,
): Promise<{ ok: true; table: TabelaFila; id: string | number; lead: any } | { ok: false; res: NextResponse }> {
    const ref = separarUid(uid);
    if (!ref) return { ok: false, res: erro(400, 'lead inválido') };
    const { data: lead, error } = await admin
        .from(ref.table)
        .select(`id, assigned_consultant_id, ${colunas}`)
        .eq('id', ref.id)
        .maybeSingle();
    if (error) return { ok: false, res: erro(500, error.message) };
    if (!lead) return { ok: false, res: erro(404, 'lead não encontrado') };
    const gestao = eu.perfil === 'admin' || eu.perfil === 'gestor';
    if (!gestao && (lead as any).assigned_consultant_id !== eu.consultorId) {
        return { ok: false, res: erro(403, 'Este lead pertence a outro vendedor.') };
    }
    return { ok: true, table: ref.table, id: ref.id, lead };
}
