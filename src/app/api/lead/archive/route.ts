import { NextRequest, NextResponse } from 'next/server'; // Recompile forced
import { createClient } from '@/lib/supabase/admin';

/**
 * POST /api/lead/archive
 *
 * Arquiva ou desarquiva um lead.
 *
 * Body: {
 *   lead_id: string,
 *   lead_table: 'leads_manos_crm' | 'leads_compra' | 'leads_distribuicao_crm_26' | 'leads_master',
 *   reason?: string,           // só usado quando archive=true
 *   archived_by?: string,       // UUID do consultor (opcional)
 *   archive: true | false       // true=arquivar, false=desarquivar
 * }
 *
 * Lead arquivado:
 *   - Sai do /inbox e da view leads_unified_active
 *   - Não recebe mais msg automática (rescue-stale, follow-up-ai)
 *   - Sla-watcher pula
 *   - Pode ser desarquivado depois (archive=false)
 */

const VALID_TABLES = new Set(['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26', 'leads_master']);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { lead_id, lead_table, reason, archived_by, archive } = body;

        if (!lead_id || !lead_table) {
            return NextResponse.json({ error: 'lead_id e lead_table obrigatórios' }, { status: 400 });
        }
        if (!VALID_TABLES.has(lead_table)) {
            return NextResponse.json({ error: 'lead_table inválida' }, { status: 400 });
        }
        if (typeof archive !== 'boolean') {
            return NextResponse.json({ error: 'archive deve ser true ou false' }, { status: 400 });
        }

        const admin = createClient();
        const cleanId = String(lead_id).replace(/^(main_|crm26_|dist_|lead_|crm25_|master_|compra_)/, '');
        const now = new Date().toISOString();

        const update: Record<string, any> = archive
            ? {
                archived_at: now,
                archived_reason: reason || 'sem motivo',
                archived_by: archived_by || null,
            }
            : {
                archived_at: null,
                archived_reason: null,
                archived_by: null,
            };

        // Detecção de tipo de ID para evitar erro de cast no Postgres
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        
        let query = admin.from(lead_table).update(update);
        
        if (isUUID) {
            query = query.eq('id', cleanId);
        } else {
            // Se não for UUID, tenta tratar como número se a tabela for de números (crm26, compra)
            // Ou apenas passa a string e deixa o PostgREST tentar o cast
            query = query.eq('id', cleanId);
        }

        const { error, data } = await query
            .select('id')
            .maybeSingle();

        if (error) {
            console.error('[archive]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) {
            return NextResponse.json({ error: 'lead não encontrado' }, { status: 404 });
        }

        // Audit trail
        const noteAction = archive ? '🗄️ Lead ARQUIVADO' : '↩️ Lead DESARQUIVADO';
        await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
            type: archive ? 'archive' : 'unarchive',
            notes: `${noteAction}${reason ? ' · motivo: ' + reason : ''}`,
            user_name: 'Vendedor',
            consultant_id: archived_by || null,
            created_at: now,
        }).then(null, () => {});

        return NextResponse.json({ ok: true, archived: archive, lead_id: cleanId });
    } catch (e: any) {
        console.error('[archive]', e);
        return NextResponse.json({ error: e?.message || 'erro interno' }, { status: 500 });
    }
}
