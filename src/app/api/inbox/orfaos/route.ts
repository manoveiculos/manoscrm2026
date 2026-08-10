import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Rede de segurança do /inbox: leads ATIVOS sem dono há mais de ORFAO_MINUTOS.
 *
 * Em regime normal isso volta vazio — o motor (slaEngine) distribui em ≤1min.
 * Se voltar cheio, alguma coisa quebrou no caminho da distribuição e o vendedor
 * PRECISA ver o lead mesmo assim: é exatamente o buraco que deixou 11 leads
 * parados até 3 dias, visíveis só pro admin.
 *
 * Server-side com service_role de propósito: as policies de RLS só liberam lead
 * com `assigned_consultant_id = <meu id>`, então lead sem dono é invisível pro
 * vendedor no nível do banco. Não dá pra resolver isso no client.
 */
const ORFAO_MINUTOS = 15;

export async function GET() {
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
        .select('id, is_active')
        .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
        .maybeSingle();
    if (!cons?.id || cons.is_active === false) {
        return NextResponse.json({ success: true, leads: [] });
    }

    const cutoff = new Date(Date.now() - ORFAO_MINUTOS * 60 * 1000).toISOString();
    const { data, error } = await admin
        .from('leads_unified_active')
        .select('uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, updated_at, created_at, proxima_acao, first_contact_channel, assigned_consultant_id, atendimento_iniciado_em, atendimento_iniciado_por, flagged_reversao, ultima_interacao_humana, descarte_financeiro, diagnostico_atendimento')
        .is('assigned_consultant_id', null)
        .is('atendimento_iniciado_em', null)
        .neq('descarte_financeiro', true)
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(50);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, leads: data || [] });
}
