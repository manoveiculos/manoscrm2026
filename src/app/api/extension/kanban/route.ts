import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { leadService } from '@/lib/leadService';

/**
 * Kanban da extensão Chrome — agora consome a VIEW unificada `leads` via
 * leadService.getLeadsPaginated, mesma fonte que o CRM web (/leads/page.tsx:110).
 *
 * Antes: 3 queries paralelas em leads_manos_crm/leads_distribuicao_crm_26/leads_master
 * com mapping manual de colunas (name/nome, phone/telefone, vehicle_interest/interesse).
 * Isso causava divergência entre o que o consultor via na extensão e o que o gerente
 * via no dashboard, porque cada lado tinha sua própria lógica de normalização.
 *
 * Depois: single source of truth — a VIEW `leads` já normaliza tudo no Supabase.
 */
const ENTRADA_STATUSES = new Set(['new', 'received', 'entrada', 'novo']);

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const consultantId = req.nextUrl.searchParams.get('consultantId');

        // Injeta admin client (bypassa RLS — proteção é o EXTENSION_API_SECRET).
        const adminClient = createAdminClient();
        leadService.setClient(adminClient);

        const { leads } = await leadService.getLeadsPaginated(adminClient, {
            consultantId: consultantId || undefined,
            role: consultantId ? 'consultant' : 'admin',
            pipelineOnly: true, // estágios ativos do pipeline; filtramos os de entrada abaixo
            limit: 500,
        });

        // Mapeia o shape que o background.js já consome (extension/background.js:38-42).
        // Mantém os mesmos campos para não quebrar o consumer existente.
        const kanban: Record<string, any[]> = {};
        for (const l of leads) {
            const status = l.status || 'new';
            // O pipelineOnly do leadService inclui estágios mais profundos (negotiation, etc).
            // O kanban da extensão só quer os de ENTRADA — filtra aqui em memória.
            if (!ENTRADA_STATUSES.has(status)) continue;
            if (!kanban[status]) kanban[status] = [];
            kanban[status].push({
                id: l.id, // já vem prefixado da VIEW (main_/crm26_/master_)
                name: l.name,
                phone: l.phone,
                status,
                classification: l.ai_classification,
                vehicle: l.vehicle_interest,
                assigned_consultant_id: l.assigned_consultant_id,
                created_at: l.created_at,
                source: l.source_table === 'leads_distribuicao_crm_26' ? 'crm26'
                    : l.source_table === 'leads_master' ? 'master'
                    : 'main',
            });
        }

        return NextResponse.json({ success: true, kanban });

    } catch (err: any) {
        console.error("Extension Kanban API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
