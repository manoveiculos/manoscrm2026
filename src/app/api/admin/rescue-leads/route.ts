import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/rescue-leads
 * Lista leads que "caíram no buraco" da automação:
 * 1. Sem vendedor atribuído
 * 2. Com falha de IA pendente (ai_pending = true)
 * 3. Sem primeiro contato há mais de 30 minutos (SLA crítico)
 */
export async function GET() {
    const admin = createClient();
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    try {
        // 1. Buscar em leads_manos_crm (Venda)
        const { data: vLeads, error: vError } = await admin
            .from('leads_manos_crm')
            .select('id, name, created_at, status, ai_pending, assigned_consultant_id, first_contact_at')
            .not('status', 'in', '("vendido","perdido","comprado")')
            .or(`assigned_consultant_id.is.null,ai_pending.eq.true,and(first_contact_at.is.null,created_at.lt.${thirtyMinAgo})`);

        if (vError) throw vError;

        // 2. Buscar em leads_compra (Compra)
        const { data: cLeads, error: cError } = await admin
            .from('leads_compra')
            .select('id, nome, criado_em, status, ai_pending, assigned_consultant_id, first_contact_at')
            .not('status', 'in', '("fechado","comprado","perdido")')
            .or(`assigned_consultant_id.is.null,ai_pending.eq.true,and(first_contact_at.is.null,criado_em.lt.${thirtyMinAgo})`);

        if (cError) throw cError;

        // Normalização básica para o dashboard
        const normalized = [
            ...(vLeads || []).map(l => ({
                id: l.id,
                name: l.name,
                created_at: l.created_at,
                type: 'Venda',
                reason: getReason(l, thirtyMinAgo)
            })),
            ...(cLeads || []).map(l => ({
                id: l.id,
                name: l.nome,
                created_at: l.criado_em,
                type: 'Compra',
                reason: getReason(l, thirtyMinAgo)
            }))
        ];

        // Ordenar por mais antigos primeiro
        normalized.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        return NextResponse.json({
            count: normalized.length,
            leads: normalized,
            generated_at: now.toISOString()
        });

    } catch (err: any) {
        console.error('[RescueLeads] Erro:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

function getReason(lead: any, thirtyMinAgo: string) {
    if (!lead.assigned_consultant_id) return 'Sem vendedor (Atribuição Falhou)';
    if (lead.ai_pending) return 'IA Pendente (Erro no GPT)';
    const createdAt = lead.created_at || lead.criado_em;
    if (!lead.first_contact_at && createdAt < thirtyMinAgo) return 'SLA Excedido (>30min sem contato)';
    return 'Desconhecido';
}
