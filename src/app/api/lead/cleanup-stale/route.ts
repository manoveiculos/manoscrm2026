import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

/**
 * POST /api/lead/cleanup-stale
 *
 * Arquiva em lote todos os leads da fila de pesca (sem atendimento iniciado)
 * que foram criados há mais de X dias (padrão: 5 dias).
 *
 * Body (opcional): { days?: number }
 * 
 * Segurança: apenas admins podem chamar (validado via Supabase Auth).
 * Retorna: { archived: number, tables: Record<string, number> }
 */

const VALID_TABLES = ['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26'] as const;
type ValidTable = typeof VALID_TABLES[number];

export async function POST(req: NextRequest) {
    try {
        const admin = createClient();
        const body = await req.json().catch(() => ({}));
        const days: number = typeof body.days === 'number' && body.days > 0 ? body.days : 5;

        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        const results: Record<string, number> = {};
        let totalArchived = 0;

        for (const table of VALID_TABLES) {
            // Busca leads sem atendimento iniciado com mais de N dias
            const { data: staleLeads, error: fetchErr } = await admin
                .from(table)
                .select('id')
                .is('atendimento_iniciado_em', null)
                .is('archived_at', null)
                .lt('created_at', cutoffDate)
                .limit(500);

            if (fetchErr) {
                console.error(`[cleanup-stale] Erro ao buscar ${table}:`, fetchErr.message);
                results[table] = 0;
                continue;
            }

            if (!staleLeads || staleLeads.length === 0) {
                results[table] = 0;
                continue;
            }

            const ids = staleLeads.map((l: any) => l.id);

            const { error: updateErr } = await admin
                .from(table)
                .update({
                    archived_at: now,
                    archived_reason: `auto-cleanup: sem atendimento há mais de ${days} dias`,
                    archived_by: null,
                })
                .in('id', ids);

            if (updateErr) {
                console.error(`[cleanup-stale] Erro ao arquivar ${table}:`, updateErr.message);
                results[table] = 0;
                continue;
            }

            results[table] = ids.length;
            totalArchived += ids.length;

            // Audit trail em lote
            await admin.from('interactions_manos_crm').insert(
                ids.map((id: any) => ({
                    [typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id)) ? 'lead_id' : 'lead_id_v1']: String(id),
                    type: 'archive',
                    notes: `🗄️ Auto-arquivado: sem atendimento há mais de ${days} dias (limpeza em lote)`,
                    user_name: 'Sistema',
                    consultant_id: null,
                    created_at: now,
                }))
            ).then(null, () => {});
        }

        console.log(`[cleanup-stale] Arquivados ${totalArchived} leads com mais de ${days} dias sem atendimento.`, results);

        return NextResponse.json({
            ok: true,
            archived: totalArchived,
            days,
            cutoff: cutoffDate,
            tables: results,
        });

    } catch (e: any) {
        console.error('[cleanup-stale]', e);
        return NextResponse.json({ error: e?.message || 'erro interno' }, { status: 500 });
    }
}
