import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { getTableForLead, stripPrefix } from '@/lib/services/leadRouter';

/**
 * POST /api/lead/permanent-delete
 *
 * Exclusão definitiva: deleta lead em 9 tabelas relacionadas + adiciona
 * telefone à lead_blocklist. Trigger AFTER INSERT respeita a blocklist —
 * mesmo se n8n re-criar lead com mesmo telefone, IA SDR não dispara.
 *
 * Body: { lead_id: string, reason?: string, deleted_by?: string }
 * - lead_id pode vir com prefixo (main_xxx, crm26_xxx, master_xxx) ou puro
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { lead_id, reason, deleted_by } = body;

        if (!lead_id) {
            return NextResponse.json(
                { success: false, error: 'lead_id é obrigatório' },
                { status: 400 }
            );
        }

        const table = getTableForLead(lead_id);
        const cleanId = stripPrefix(lead_id);

        const admin = createClient();

        const { data, error } = await admin.rpc('permanently_delete_lead', {
            p_lead_id: cleanId,
            p_lead_table: table,
            p_reason: reason || 'manual',
            p_deleted_by: deleted_by || null,
        });

        if (error) {
            console.error('[permanent-delete] RPC erro:', error);
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        const result = data as { ok: boolean; phone?: string; error?: string; deleted?: Record<string, number> };

        if (!result.ok) {
            return NextResponse.json(
                { success: false, error: result.error || 'erro_desconhecido' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Lead excluído permanentemente. Telefone bloqueado contra re-criação.',
            phone: result.phone,
            deleted_counts: result.deleted,
        });
    } catch (err: any) {
        console.error('[permanent-delete] exception:', err);
        return NextResponse.json(
            { success: false, error: err?.message || 'erro_interno' },
            { status: 500 }
        );
    }
}
