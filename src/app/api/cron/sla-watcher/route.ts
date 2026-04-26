import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { notifyConsultant } from '@/lib/services/consultantNotifier';
import { assignNextConsultant } from '@/lib/services/autoAssignService';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';

/**
 * SLA Watcher — substitui pipeline-sla, anti-loss e hot-leak-alert.
 *
 * Roda a cada 5min (configurar no vercel.json ou cron externo).
 *
 * Níveis de escalonamento por lead novo sem resposta do vendedor:
 *   - >5min  → Push WhatsApp pessoal + cowork alert (nível 2)
 *   - >15min → Modal bloqueante (nível 3)
 *   - >30min → Reatribui pra outro vendedor + push de "perdeu o lead"
 *   - >7d    → Auto-finish como lost_by_inactivity
 *
 * Idempotência: cada nível só dispara 1x por lead (controlado por sla_escalations).
 */

interface LeadSla {
    id: string;
    table: 'leads_compra' | 'leads_manos_crm' | 'leads_distribuicao_crm_26';
    name: string;
    consultantId: string | null;
    createdAt: string;
    lastActivityAt: string;
    status: string;
}

const FINAL_STATUSES = ['vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity'];

async function getOpenLevel(leadId: string, level: number): Promise<boolean> {
    const admin = createClient();
    const { data } = await admin
        .from('sla_escalations')
        .select('id')
        .eq('lead_id', leadId)
        .eq('level', level)
        .limit(1);
    return (data?.length || 0) > 0;
}

async function recordEscalation(leadId: string, table: string, consultantId: string | null, level: number, notes: string) {
    const admin = createClient();
    await admin.from('sla_escalations').insert({
        lead_id: leadId,
        lead_table: table,
        consultant_id: consultantId,
        level,
        notes,
    });
}

async function fetchLeadsCompra(): Promise<LeadSla[]> {
    const admin = createClient();
    const { data } = await admin
        .from('leads_compra')
        .select('id, nome, assigned_consultant_id, criado_em, updated_at, status')
        .not('status', 'in', `(${FINAL_STATUSES.map(s => `"${s}"`).join(',')})`)
        .order('criado_em', { ascending: false })
        .limit(500);
    return (data || []).map(l => ({
        id: l.id,
        table: 'leads_compra' as const,
        name: l.nome || 'Lead',
        consultantId: l.assigned_consultant_id,
        createdAt: l.criado_em,
        lastActivityAt: l.updated_at || l.criado_em,
        status: l.status || 'novo',
    }));
}

async function fetchLeadsVenda(): Promise<LeadSla[]> {
    const admin = createClient();
    const { data } = await admin
        .from('leads_manos_crm')
        .select('id, name, assigned_consultant_id, created_at, updated_at, status')
        .not('status', 'in', `(${FINAL_STATUSES.map(s => `"${s}"`).join(',')})`)
        .order('created_at', { ascending: false })
        .limit(500);
    return (data || []).map(l => ({
        id: l.id,
        table: 'leads_manos_crm' as const,
        name: l.name || 'Lead',
        consultantId: l.assigned_consultant_id,
        createdAt: l.created_at,
        lastActivityAt: l.updated_at || l.created_at,
        status: l.status || 'novo',
    }));
}

async function ageMinutes(iso: string): Promise<number> {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

async function processLead(lead: LeadSla, results: any) {
    const minsSinceCreated = await ageMinutes(lead.createdAt);
    const minsSinceActivity = await ageMinutes(lead.lastActivityAt);
    const isNew = lead.status === 'novo' || lead.status === 'received';

    // Auto-finish após 7 dias sem atividade
    if (minsSinceActivity > 60 * 24 * 7) {
        if (!(await getOpenLevel(lead.id, 4))) {
            const admin = createClient();
            const finalCol = lead.table === 'leads_compra' ? { status: 'perdido' } : { status: 'lost_by_inactivity' };
            await admin.from(lead.table).update({
                ...finalCol,
                loss_category: 'sem_resposta',
                updated_at: new Date().toISOString(),
            }).eq('id', lead.id);
            await recordEscalation(lead.id, lead.table, lead.consultantId, 4, `Auto-finish após ${Math.floor(minsSinceActivity / 60 / 24)}d sem atividade`);
            results.autoFinished++;
        }
        return;
    }

    if (!isNew || !lead.consultantId) return;

    // Nível 3: reatribuir após 30min
    if (minsSinceCreated > 30 && !(await getOpenLevel(lead.id, 3))) {
        const oldConsultantId = lead.consultantId;
        const newId = await assignNextConsultant(lead.id, lead.table as any).catch(() => null);
        if (newId && newId !== oldConsultantId) {
            await notifyConsultant({
                consultantId: oldConsultantId,
                leadId: lead.id,
                level: 3,
                title: `Você perdeu o lead ${lead.name}`,
                message: `Lead atribuído a outro vendedor por inatividade (>30min sem resposta).`,
            });
            await recordEscalation(lead.id, lead.table, oldConsultantId, 3, 'Reatribuído por SLA 30min');
            results.reassigned++;
        }
        return;
    }

    // Nível 2: modal bloqueante após 15min
    if (minsSinceCreated > 15 && !(await getOpenLevel(lead.id, 2))) {
        await notifyConsultant({
            consultantId: lead.consultantId,
            leadId: lead.id,
            level: 3, // crítico interno
            title: `🚨 Lead ${lead.name} esperando há ${minsSinceCreated}min`,
            message: 'Responda agora ou ele será reatribuído em 15min.',
            blocking: true,
        });
        await recordEscalation(lead.id, lead.table, lead.consultantId, 2, `Modal bloqueante aos ${minsSinceCreated}min`);
        results.blockingModals++;
        return;
    }

    // Nível 1: push WhatsApp pessoal após 5min
    if (minsSinceCreated > 5 && !(await getOpenLevel(lead.id, 1))) {
        await notifyConsultant({
            consultantId: lead.consultantId,
            leadId: lead.id,
            level: 2,
            title: `Lead ${lead.name} esperando há ${minsSinceCreated}min`,
            message: 'Responda no WhatsApp agora pra não perder.',
        });
        await recordEscalation(lead.id, lead.table, lead.consultantId, 1, `Push aos ${minsSinceCreated}min`);
        results.pushes++;
    }
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (process.env.CRON_SECRET && auth !== expected) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    try {
        const results = await withHeartbeat('sla-watcher', async () => {
            const r = {
                scanned: 0,
                pushes: 0,
                blockingModals: 0,
                reassigned: 0,
                autoFinished: 0,
                errors: 0,
            };
            const [compra, venda] = await Promise.all([fetchLeadsCompra(), fetchLeadsVenda()]);
            const leads = [...compra, ...venda];
            r.scanned = leads.length;

            for (const lead of leads) {
                try {
                    await processLead(lead, r);
                } catch (e: any) {
                    r.errors++;
                    console.error('[sla-watcher] lead', lead.id, 'erro:', e?.message);
                }
            }
            return { result: r, metrics: r };
        });

        return NextResponse.json({ ok: true, results });
    } catch (e: any) {
        console.error('[sla-watcher] global error:', e?.message);
        return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
