import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

/**
 * Tela de Cobrança / Pressão do Pátio.
 *
 * O `run_inactivity_monitor()` (pg_cron a cada 15min) grava em `inactivity_alerts`
 * mas NENHUMA tela lia essa tabela — 459 alertas, 0 reconhecidos. Esta rota
 * é o leitor que faltava: traz os alertas pendentes já enriquecidos com o
 * nome/veículo/tempo parado do lead, e fecha o loop com o acknowledge.
 *
 * GET  /api/alerts/inactivity?cid=<uuid>&role=<admin|consultant>
 * POST /api/alerts/inactivity   { alert_id, action: 'will_respond' | 'return_to_queue' }
 */

export const dynamic = 'force-dynamic';

// lead_table → metadados de escrita (id numérico? coluna de updated_at?)
const TABLE_META: Record<string, { numericId: boolean; updatedCol: string }> = {
    leads_distribuicao_crm_26: { numericId: true, updatedCol: 'atualizado_em' },
    leads_manos_crm: { numericId: false, updatedCol: 'updated_at' },
    leads_compra: { numericId: false, updatedCol: 'updated_at' },
};

export async function GET(req: NextRequest) {
    try {
        const admin = createClient();
        const { searchParams } = new URL(req.url);
        const cid = searchParams.get('cid');
        const role = searchParams.get('role');
        const isAdmin = role === 'admin';

        // 1. Alertas pendentes (não reconhecidos). Admin vê todos; consultor vê os seus.
        let q = admin
            .from('inactivity_alerts')
            .select('id, lead_uid, lead_table, lead_id, consultor_id, kind, created_at')
            .is('acknowledged_at', null)
            .order('created_at', { ascending: false })
            .limit(60);

        if (!isAdmin) {
            if (!cid) return NextResponse.json({ alerts: [], counts: { warning: 0, lost: 0 } });
            q = q.eq('consultor_id', cid);
        }

        const { data: alerts, error } = await q;
        if (error) {
            console.error('[alerts/inactivity] erro busca alertas:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!alerts || alerts.length === 0) {
            return NextResponse.json({ alerts: [], counts: { warning: 0, lost: 0 } });
        }

        // 2. Enriquece com dados do lead via view unificada (1 query, IN nos uids).
        const uids = Array.from(new Set(alerts.map(a => a.lead_uid).filter(Boolean)));
        const { data: leads } = await admin
            .from('leads_unified')
            .select('uid, name, vehicle_interest, status, ultima_interacao_humana, assigned_consultant_id')
            .in('uid', uids);
        const leadByUid = new Map((leads || []).map(l => [l.uid, l]));

        // 3. Nome do consultor responsável (para a visão admin).
        const consultorIds = Array.from(new Set(alerts.map(a => a.consultor_id).filter(Boolean)));
        let nameByConsultor = new Map<string, string>();
        if (consultorIds.length > 0) {
            const { data: cons } = await admin
                .from('consultants_manos_crm')
                .select('id, name')
                .in('id', consultorIds as string[]);
            nameByConsultor = new Map((cons || []).map(c => [c.id, c.name]));
        }

        const now = Date.now();
        const enriched = alerts.map(a => {
            const lead = leadByUid.get(a.lead_uid);
            const refTs = lead?.ultima_interacao_humana || a.created_at;
            const hoursInactive = refTs ? Math.floor((now - new Date(refTs).getTime()) / 3_600_000) : null;
            return {
                id: a.id,
                kind: a.kind, // 'warning_8h' | 'auto_lost_24h'
                created_at: a.created_at,
                lead_uid: a.lead_uid,
                lead_table: a.lead_table,
                name: lead?.name || 'Lead sem nome',
                vehicle_interest: lead?.vehicle_interest || null,
                status: lead?.status || null,
                ultima_interacao_humana: lead?.ultima_interacao_humana || null,
                hours_inactive: hoursInactive,
                consultor_id: a.consultor_id,
                consultor_name: a.consultor_id ? (nameByConsultor.get(a.consultor_id) || null) : null,
            };
        });

        const counts = {
            warning: enriched.filter(a => a.kind === 'warning_8h').length,
            lost: enriched.filter(a => a.kind === 'auto_lost_24h').length,
        };

        return NextResponse.json({ alerts: enriched, counts });
    } catch (e: any) {
        console.error('[alerts/inactivity GET]', e);
        return NextResponse.json({ error: e?.message || 'erro interno' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { alert_id, action } = await req.json();
        if (!alert_id || !action) {
            return NextResponse.json({ error: 'alert_id e action obrigatórios' }, { status: 400 });
        }

        const admin = createClient();

        const { data: alert } = await admin
            .from('inactivity_alerts')
            .select('id, lead_uid, lead_table, lead_id, acknowledged_at')
            .eq('id', alert_id)
            .maybeSingle();

        if (!alert) return NextResponse.json({ error: 'alerta não encontrado' }, { status: 404 });

        // Reconhece o alerta (fecha o loop — sai do badge de pressão).
        await admin
            .from('inactivity_alerts')
            .update({ acknowledged_at: new Date().toISOString() })
            .eq('id', alert_id);

        // Ação agressiva: devolve o lead à Fila Geral (re-pesca por qualquer vendedor).
        if (action === 'return_to_queue' && alert.lead_table && alert.lead_id) {
            const meta = TABLE_META[alert.lead_table];
            if (meta) {
                const leadId: string | number = meta.numericId ? parseInt(alert.lead_id, 10) : alert.lead_id;
                const patch: Record<string, any> = {
                    assigned_consultant_id: null,
                    atendimento_iniciado_em: null,
                    status: 'received',
                    [meta.updatedCol]: new Date().toISOString(),
                };
                const { error: updErr } = await admin
                    .from(alert.lead_table)
                    .update(patch)
                    .eq('id', leadId as any);
                if (updErr) {
                    console.error('[alerts/inactivity] falha ao devolver à fila:', updErr.message);
                    return NextResponse.json({ ok: true, requeued: false, warn: updErr.message });
                }
                return NextResponse.json({ ok: true, requeued: true });
            }
        }

        return NextResponse.json({ ok: true, requeued: false });
    } catch (e: any) {
        console.error('[alerts/inactivity POST]', e);
        return NextResponse.json({ error: e?.message || 'erro interno' }, { status: 500 });
    }
}
