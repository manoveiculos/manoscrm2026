import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { distribuirLead, type LeadTable } from '@/lib/services/slaEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Backfill de distribuição — joga o backlog (leads ativos SEM dono, herança da
 * pesca) na roleta round-robin. Reusa o motor (distribuirLead): respeita horário
 * comercial (fora do horário vira 'standby') e só manda pra quem fez check-in.
 *
 * Idempotente: só pega leads sem assigned_consultant_id. Rodar de novo é seguro.
 * Admin-only. Aceita GET (abrir a URL logado como admin) e POST.
 */
async function run() {
    const cookieStore = await cookies();
    const ssr = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });

    const admin = createClient();
    const { data: cons } = await admin
        .from('consultants_manos_crm')
        .select('role')
        .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
        .maybeSingle();
    const isAdmin = cons?.role === 'admin' || user.email === 'alexandre_gorges@hotmail.com';
    if (!isAdmin) return NextResponse.json({ success: false, error: 'apenas admin' }, { status: 403 });

    // Backlog: leads ativos sem dono e sem atendimento iniciado.
    const { data: leads, error } = await admin
        .from('leads_unified_active')
        .select('table_name, native_id')
        .is('assigned_consultant_id', null)
        .is('atendimento_iniciado_em', null)
        .neq('descarte_financeiro', true)
        .limit(500);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const resumo: Record<string, number> = { distribuido: 0, standby: 0, aguardando: 0, erro: 0 };
    for (const l of leads || []) {
        try {
            const r = await distribuirLead(l.table_name as LeadTable, l.native_id);
            resumo[r.status] = (resumo[r.status] || 0) + 1;
        } catch {
            resumo.erro++;
        }
    }

    return NextResponse.json({ success: true, total: leads?.length || 0, ...resumo });
}

export async function GET() { return run(); }
export async function POST() { return run(); }
