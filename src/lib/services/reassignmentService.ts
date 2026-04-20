import { createClient } from '@/lib/supabase/admin';
import { pickNextConsultant } from './consultantService';

const N8N_WEBHOOK_URL =
    process.env.N8N_VENDOR_WEBHOOK_URL ||
    'https://n8n.drivvoo.com/webhook/chamadavendedorcrm';

const HOT_THRESHOLD = 60;
const WARNING_AFTER_HOURS = 24;
const REDISTRIBUTE_AFTER_WARNING_HOURS = 12;

type Reason =
    | 'manual_transfer'
    | 'reactivation'
    | 'auto_redistribution'
    | 'sla_warning_expired';

interface HistoryEntry {
    leadId: string;
    fromConsultantId: string | null;
    toConsultantId: string | null;
    reason: Reason;
    notes?: string;
    actorName?: string;
    scoreAtChange?: number | null;
}

async function logHistory(admin: ReturnType<typeof createClient>, e: HistoryEntry): Promise<void> {
    await admin.from('lead_consultant_history').insert({
        lead_id: e.leadId,
        from_consultant_id: e.fromConsultantId,
        to_consultant_id: e.toConsultantId,
        reason: e.reason,
        notes: e.notes || null,
        actor_name: e.actorName || 'Sistema',
        score_at_change: e.scoreAtChange ?? null,
    });
}

function onlyDigits(s?: string | null): string {
    return (s || '').replace(/\D/g, '');
}

async function pushToVendor(
    consultantName: string,
    consultantPhone: string,
    type: string,
    message: string,
    meta: Record<string, any> = {}
): Promise<void> {
    if (!consultantPhone) return;
    try {
        const res = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consultant_name: consultantName,
                consultant_phone: onlyDigits(consultantPhone),
                type,
                message,
                meta,
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) console.warn('[reassignment] push falhou', res.status);
    } catch (err: any) {
        console.warn('[reassignment] push erro:', err?.message);
    }
}

// ════════════════════════════════════════════════════════════════
// REATIVAÇÃO — Admin reabre lead perdido
// ════════════════════════════════════════════════════════════════

export async function reactivateLead(params: {
    leadId: string;
    newConsultantId?: string | null;
    reason?: string;
    actorName?: string;
}): Promise<{ success: boolean; assignedTo: string | null }> {
    const { leadId, newConsultantId, reason, actorName } = params;
    const admin = createClient();

    const { data: lead } = await admin
        .from('leads_manos_crm')
        .select('id, status, assigned_consultant_id, ai_score, name')
        .eq('id', leadId)
        .maybeSingle();

    if (!lead) throw new Error('Lead não encontrado');
    if (lead.status !== 'perdido') throw new Error(`Lead não está perdido (status: ${lead.status})`);

    // Se admin não escolheu consultor, usa round-robin excluindo o anterior
    let assignTo: string | null = newConsultantId || null;
    if (!assignTo) {
        const next = await pickNextConsultant(lead.name, lead.assigned_consultant_id || undefined);
        assignTo = next?.id || null;
    }

    const now = new Date().toISOString();
    await admin
        .from('leads_manos_crm')
        .update({
            status: 'entrada',
            assigned_consultant_id: assignTo,
            updated_at: now,
            // Limpa flags de perda para tratar como lead novo na operação
            redistribution_warning_at: null,
            redistribution_warned_consultant_id: null,
            redistributed_at: null,
        })
        .eq('id', leadId);

    await logHistory(admin, {
        leadId,
        fromConsultantId: lead.assigned_consultant_id || null,
        toConsultantId: assignTo,
        reason: 'reactivation',
        notes: reason || 'Lead reativado pelo gerente',
        actorName: actorName || 'Admin',
        scoreAtChange: Number(lead.ai_score) || 0,
    });

    await admin.from('interactions_manos_crm').insert({
        lead_id: leadId,
        type: 'reactivation',
        notes: `♻️ LEAD REATIVADO por ${actorName || 'Admin'}${reason ? ': ' + reason : ''}`,
        user_name: actorName || 'Admin',
        created_at: now,
    });

    return { success: true, assignedTo: assignTo };
}

// ════════════════════════════════════════════════════════════════
// TRANSFERÊNCIA MANUAL — Admin move lead entre vendedores
// ════════════════════════════════════════════════════════════════

export async function transferLead(params: {
    leadId: string;
    newConsultantId: string;
    reason: string;
    actorName?: string;
}): Promise<{ success: boolean }> {
    const { leadId, newConsultantId, reason, actorName } = params;
    if (!newConsultantId) throw new Error('newConsultantId obrigatório');
    const admin = createClient();

    const { data: lead } = await admin
        .from('leads_manos_crm')
        .select('id, assigned_consultant_id, ai_score')
        .eq('id', leadId)
        .maybeSingle();
    if (!lead) throw new Error('Lead não encontrado');

    if (lead.assigned_consultant_id === newConsultantId) {
        return { success: true };
    }

    const now = new Date().toISOString();
    await admin
        .from('leads_manos_crm')
        .update({
            assigned_consultant_id: newConsultantId,
            updated_at: now,
            redistribution_warning_at: null,
            redistribution_warned_consultant_id: null,
        })
        .eq('id', leadId);

    await logHistory(admin, {
        leadId,
        fromConsultantId: lead.assigned_consultant_id || null,
        toConsultantId: newConsultantId,
        reason: 'manual_transfer',
        notes: reason,
        actorName: actorName || 'Admin',
        scoreAtChange: Number(lead.ai_score) || 0,
    });

    await admin.from('interactions_manos_crm').insert({
        lead_id: leadId,
        type: 'transfer',
        notes: `🔁 TRANSFERIDO por ${actorName || 'Admin'}: ${reason}`,
        user_name: actorName || 'Admin',
        created_at: now,
    });

    return { success: true };
}

// ════════════════════════════════════════════════════════════════
// CRON: Warning + Redistribuição automática de leads esquecidos
// ════════════════════════════════════════════════════════════════

interface CronResult {
    warnings_sent: number;
    redistributions_done: number;
    skipped: number;
}

export async function runRedistributionCycle(): Promise<CronResult> {
    const admin = createClient();
    const now = new Date();
    const warningThreshold = new Date(now.getTime() - WARNING_AFTER_HOURS * 3_600_000).toISOString();
    const redistThreshold = new Date(now.getTime() - REDISTRIBUTE_AFTER_WARNING_HOURS * 3_600_000).toISOString();

    let warnings = 0;
    let redists = 0;
    let skipped = 0;

    // ── FASE 1: Reatribui leads que já receberam warning há 12h+ e seguem parados ──
    const { data: pendingRedist } = await admin
        .from('leads_manos_crm')
        .select('id, name, assigned_consultant_id, ai_score, redistribution_warning_at, updated_at')
        .not('redistribution_warning_at', 'is', null)
        .is('redistributed_at', null)
        .lte('redistribution_warning_at', redistThreshold)
        .neq('status', 'vendido')
        .neq('status', 'perdido')
        .neq('status', 'comprado');

    for (const lead of pendingRedist || []) {
        // Se vendedor agiu APÓS o warning, cancela redistribuição
        if (lead.updated_at && lead.updated_at > lead.redistribution_warning_at) {
            await admin
                .from('leads_manos_crm')
                .update({
                    redistribution_warning_at: null,
                    redistribution_warned_consultant_id: null,
                })
                .eq('id', lead.id);
            skipped++;
            continue;
        }

        const next = await pickNextConsultant(lead.name, lead.assigned_consultant_id);
        if (!next) {
            skipped++;
            continue;
        }

        const oldConsultantId = lead.assigned_consultant_id;

        await admin
            .from('leads_manos_crm')
            .update({
                assigned_consultant_id: next.id,
                redistributed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id);

        await logHistory(admin, {
            leadId: lead.id,
            fromConsultantId: oldConsultantId,
            toConsultantId: next.id,
            reason: 'auto_redistribution',
            notes: `Reatribuído automaticamente após warning sem ação por ${REDISTRIBUTE_AFTER_WARNING_HOURS}h`,
            actorName: 'Sistema',
            scoreAtChange: Number(lead.ai_score) || 0,
        });

        // Push para o novo vendedor
        if (next.phone) {
            await pushToVendor(
                next.name,
                next.phone,
                'lead_arrival',
                `🔥 *LEAD REATRIBUÍDO PARA VOCÊ*\n\n👤 ${lead.name || 'Sem nome'} (score ${lead.ai_score || 0})\n\nO vendedor anterior ficou inativo. Bora atacar agora.`,
                { lead_id: lead.id, reason: 'auto_redistribution' }
            );
        }
        redists++;
    }

    // ── FASE 2: Envia WARNING para leads quentes parados há 24h+ sem warning ainda ──
    const { data: pendingWarning } = await admin
        .from('leads_manos_crm')
        .select(`
            id, name, ai_score, assigned_consultant_id, updated_at,
            consultants_manos_crm:assigned_consultant_id ( id, name, phone )
        `)
        .gte('ai_score', HOT_THRESHOLD)
        .lte('updated_at', warningThreshold)
        .is('redistribution_warning_at', null)
        .not('assigned_consultant_id', 'is', null)
        .neq('status', 'vendido')
        .neq('status', 'perdido')
        .neq('status', 'comprado')
        .limit(50);

    for (const lead of pendingWarning || []) {
        const c = (lead as any).consultants_manos_crm;
        if (!c?.phone) {
            skipped++;
            continue;
        }

        await admin
            .from('leads_manos_crm')
            .update({
                redistribution_warning_at: new Date().toISOString(),
                redistribution_warned_consultant_id: lead.assigned_consultant_id,
            })
            .eq('id', lead.id);

        await pushToVendor(
            c.name,
            c.phone,
            'sla_warning',
            `⚠️ *AÇÃO URGENTE*\n\nO lead *${lead.name || 'sem nome'}* (score ${lead.ai_score}) está parado há ${WARNING_AFTER_HOURS}h.\n\n_Você tem ${REDISTRIBUTE_AFTER_WARNING_HOURS}h para registrar uma interação ou ele será reatribuído automaticamente para outro vendedor._\n\nResponda agora pra não perder.`,
            { lead_id: lead.id, reason: 'sla_warning' }
        );
        warnings++;
    }

    return { warnings_sent: warnings, redistributions_done: redists, skipped };
}
