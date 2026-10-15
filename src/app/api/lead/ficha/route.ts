import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createClient as createAuthClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Tabelas que têm handoff_summary/handoff_at.
const TABELAS = new Set(['leads_distribuicao_crm_26', 'leads_manos_crm', 'leads_compra']);

/**
 * GET /api/lead/ficha?uid=leads_distribuicao_crm_26:123
 *
 * Devolve a ficha que a rotina da IA grava em handoff_summary ("FICHA IA — …")
 * e/ou o briefing de redistribuição. As views (leads, leads_unified) não
 * expõem esse campo, por isso a leitura vai direto na tabela-base.
 */
export async function GET(req: NextRequest) {
    const auth = await createAuthClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });

    const uid = decodeURIComponent(new URL(req.url).searchParams.get('uid') || '');
    const i = uid.indexOf(':');
    const table = i > 0 ? uid.slice(0, i) : '';
    const id = i > 0 ? uid.slice(i + 1) : '';
    if (!TABELAS.has(table) || !id) return NextResponse.json({ success: true, texto: null });

    const admin = createClient();
    const { data: lead } = await admin
        .from(table)
        .select('handoff_summary, handoff_at, assigned_consultant_id')
        .eq('id', table === 'leads_distribuicao_crm_26' ? parseInt(id, 10) : id)
        .maybeSingle();
    if (!lead) return NextResponse.json({ success: true, texto: null });

    // Mesmo guard da tela do lead: vendedor só vê ficha de lead dele (ou sem dono).
    const { data: me } = await admin
        .from('consultants_manos_crm')
        .select('id, role')
        .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
        .maybeSingle();
    const isAdmin = me?.role === 'admin' || (user.email || '').toLowerCase() === 'alexandre_gorges@hotmail.com';
    if (!isAdmin && lead.assigned_consultant_id && me?.id && lead.assigned_consultant_id !== me.id) {
        return NextResponse.json({ success: false, error: 'Este lead pertence a outro vendedor.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, texto: lead.handoff_summary || null, atualizado_em: lead.handoff_at || null });
}
