import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/live-feed
 *
 * Estado inicial pro painel /admin/live.
 * O frontend depois mantém via Realtime (postgres_changes).
 *
 * Retorna 5 listas paralelas (últimos 25 itens de cada):
 *   - aiSent          → msgs enviadas pelo robô (ai_first_contact, ai_followup)
 *   - clientReplies   → respostas dos clientes (whatsapp_messages direction=inbound)
 *   - vendorAlerts    → cobranças enviadas pro vendedor (vendor_alert + cowork_alerts blocking)
 *   - reassigned      → leads reativados/reatribuídos (sla_escalations)
 *   - hotLeads        → leads quentes precisando atenção (score >= 80, ativos, sem first_contact_at recente)
 */

export async function GET(_req: NextRequest) {
    const admin = createClient();
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [
        sentRes,
        repliesRes,
        alertsLogRes,
        coworkAlertsRes,
        escRes,
        hotRes,
        consRes,
    ] = await Promise.all([
        // 1. IA enviou pro CLIENTE
        admin.from('whatsapp_send_log')
            .select('id, to_phone, kind, provider, lead_id, sent_at')
            .in('kind', ['ai_first_contact', 'ai_followup'])
            .gte('sent_at', dayAgo)
            .order('sent_at', { ascending: false })
            .limit(25),

        // 2. CLIENTE respondeu (inbound)
        admin.from('whatsapp_messages')
            .select('id, lead_id, direction, message_text, created_at')
            .eq('direction', 'inbound')
            .gte('created_at', dayAgo)
            .order('created_at', { ascending: false })
            .limit(25),

        // 3a. Cobranças enviadas pro VENDEDOR (whatsapp_send_log kind=vendor_alert)
        admin.from('whatsapp_send_log')
            .select('id, to_phone, kind, lead_id, sent_at')
            .eq('kind', 'vendor_alert')
            .gte('sent_at', dayAgo)
            .order('sent_at', { ascending: false })
            .limit(25),

        // 3b. Modais bloqueantes do CRM (cowork_alerts)
        admin.from('cowork_alerts')
            .select('id, assigned_consultant_id, lead_id, title, message, priority, blocking, acknowledged, acknowledged_action, created_at')
            .eq('blocking', true)
            .gte('created_at', dayAgo)
            .order('created_at', { ascending: false })
            .limit(25),

        // 4. Reatribuições / auto-finish (sla_escalations)
        admin.from('sla_escalations')
            .select('id, lead_id, lead_table, consultant_id, level, notes, triggered_at')
            .gte('triggered_at', dayAgo)
            .order('triggered_at', { ascending: false })
            .limit(25),

        // 5. Leads SUPER QUENTES — score >= 80, ativos, sem fechamento
        admin.from('leads_unified_active')
            .select('uid, table_name, native_id, name, phone, vehicle_interest, ai_score, ai_classification, status, assigned_consultant_id, first_contact_at, updated_at, created_at')
            .gte('ai_score', 80)
            .order('ai_score', { ascending: false, nullsFirst: false })
            .limit(15),

        admin.from('consultants_manos_crm')
            .select('id, name'),
    ]);

    // Consultor lookup
    const consMap = new Map<string, string>();
    for (const c of (consRes.data || []) as any[]) {
        if (c.id) consMap.set(c.id, c.name || 'Sem nome');
    }

    // Lead lookup helper — pega nomes em batch dos lead_ids citados
    const leadIds = new Set<string>();
    for (const r of (sentRes.data || []) as any[]) if (r.lead_id) leadIds.add(String(r.lead_id));
    for (const r of (repliesRes.data || []) as any[]) if (r.lead_id) leadIds.add(String(r.lead_id));
    for (const r of (alertsLogRes.data || []) as any[]) if (r.lead_id) leadIds.add(String(r.lead_id));
    for (const r of (coworkAlertsRes.data || []) as any[]) if (r.lead_id) leadIds.add(String(r.lead_id));
    for (const r of (escRes.data || []) as any[]) if (r.lead_id) leadIds.add(String(r.lead_id));

    const leadIdsArr = Array.from(leadIds).filter(id => id && !id.startsWith('c:'));
    const leadNameMap = new Map<string, { name: string; uid: string; phone: string | null }>();
    if (leadIdsArr.length > 0) {
        // Busca em paralelo nas 3 tabelas (cada lead_id pode estar em só uma)
        const [a, b, c] = await Promise.all([
            admin.from('leads_manos_crm').select('id, name, phone').in('id', leadIdsArr),
            admin.from('leads_compra').select('id, nome, telefone').in('id', leadIdsArr),
            admin.from('leads_distribuicao_crm_26').select('id, nome, telefone').in('id', leadIdsArr.filter(id => /^\d+$/.test(id)).map(Number) as any),
        ]);
        for (const l of (a.data || []) as any[]) {
            leadNameMap.set(String(l.id), { name: l.name || 'Sem nome', uid: `leads_manos_crm:${l.id}`, phone: l.phone });
        }
        for (const l of (b.data || []) as any[]) {
            leadNameMap.set(String(l.id), { name: l.nome || 'Sem nome', uid: `leads_compra:${l.id}`, phone: l.telefone });
        }
        for (const l of (c.data || []) as any[]) {
            leadNameMap.set(String(l.id), { name: l.nome || 'Sem nome', uid: `leads_distribuicao_crm_26:${l.id}`, phone: l.telefone });
        }
    }

    function leadInfo(leadId: string | null | undefined) {
        if (!leadId) return { name: '—', uid: null, phone: null };
        const info = leadNameMap.get(String(leadId));
        if (info) return info;
        return { name: 'Lead', uid: null, phone: null };
    }

    // Mapeia pra formato consumível pelo frontend
    const aiSent = ((sentRes.data || []) as any[]).map(r => {
        const info = leadInfo(r.lead_id);
        return {
            id: `sent-${r.id}`,
            type: r.kind,
            ts: r.sent_at,
            leadName: info.name,
            leadUid: info.uid,
            phone: r.to_phone,
            provider: r.provider,
        };
    });

    const clientReplies = ((repliesRes.data || []) as any[]).map(r => {
        const info = leadInfo(r.lead_id);
        return {
            id: `reply-${r.id}`,
            ts: r.created_at,
            leadName: info.name,
            leadUid: info.uid,
            preview: (r.message_text || '').slice(0, 120),
        };
    });

    // Une vendor_alerts (whatsapp_send_log) + cowork_alerts blocking
    const vendorAlerts = [
        ...((alertsLogRes.data || []) as any[]).map(r => {
            // Se lead_id começa com "c:", é prefixo do nosso whatsappSender pro consultor
            const consId = (r.lead_id || '').startsWith('c:')
                ? (r.lead_id || '').split(':')[1]
                : null;
            const consultantName = consId ? consMap.get(consId) : null;
            return {
                id: `valert-log-${r.id}`,
                ts: r.sent_at,
                consultantName: consultantName || '—',
                phone: r.to_phone,
                kind: 'whatsapp_push',
                title: '📱 Push WhatsApp pessoal',
                message: '',
                acknowledged: null,
            };
        }),
        ...((coworkAlertsRes.data || []) as any[]).map(r => ({
            id: `valert-cowork-${r.id}`,
            ts: r.created_at,
            consultantName: consMap.get(r.assigned_consultant_id) || '—',
            phone: null,
            kind: 'modal_blocking',
            title: r.title || '🚨 Modal bloqueante',
            message: r.message || '',
            acknowledged: r.acknowledged ? r.acknowledged_action || 'sim' : null,
            leadUid: r.lead_id ? leadInfo(r.lead_id).uid : null,
        })),
    ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 30);

    const reassigned = ((escRes.data || []) as any[]).map(r => {
        const info = leadInfo(r.lead_id);
        const consultantName = consMap.get(r.consultant_id) || null;
        const levelLabel = r.level === 1 ? 'Push 5min'
            : r.level === 2 ? 'Modal 15min'
                : r.level === 3 ? '🔄 Reatribuído'
                    : r.level === 4 ? '🪦 Auto-finalizado'
                        : `Nível ${r.level}`;
        return {
            id: `esc-${r.id}`,
            ts: r.triggered_at,
            level: r.level,
            levelLabel,
            leadName: info.name,
            leadUid: info.uid,
            consultantName,
            notes: r.notes,
        };
    });

    const hotLeads = ((hotRes.data || []) as any[]).map(r => {
        const consultantName = consMap.get(r.assigned_consultant_id) || null;
        const minSinceUpdate = r.updated_at
            ? Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 60000)
            : null;
        const status: 'urgent' | 'waiting_vendor' | 'ai_only' | 'ok' =
            !r.first_contact_at ? 'urgent'
                : minSinceUpdate !== null && minSinceUpdate > 30 ? 'waiting_vendor'
                    : r.first_contact_at && r.assigned_consultant_id ? 'ok'
                        : 'ai_only';
        return {
            uid: r.uid,
            name: r.name || 'Sem nome',
            phone: r.phone,
            vehicle: r.vehicle_interest,
            score: r.ai_score,
            classification: r.ai_classification,
            consultantName,
            firstContactAt: r.first_contact_at,
            updatedAt: r.updated_at,
            createdAt: r.created_at,
            minSinceUpdate,
            status,
        };
    });

    return NextResponse.json({
        ok: true,
        generated_at: new Date().toISOString(),
        aiSent,
        clientReplies,
        vendorAlerts,
        reassigned,
        hotLeads,
        kpis: {
            aiSentLast24h: aiSent.length,
            repliesLast24h: clientReplies.length,
            vendorAlertsLast24h: vendorAlerts.length,
            reassignedLast24h: reassigned.length,
            hotLeadsActive: hotLeads.length,
        },
    });
}
