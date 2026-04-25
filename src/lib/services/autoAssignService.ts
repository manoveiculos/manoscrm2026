import { createClient } from '@/lib/supabase/admin';

/**
 * Atribuição automática de leads — critério composto.
 *
 * Score por consultor (maior = melhor candidato):
 *   capacity   (40%) → 1 / (1 + carga ativa últimas 24h)
 *   winRate    (40%) → vendas / leads recebidos nos últimos 30 dias
 *   speed      (20%) → 1 / (1 + tempo médio em min até primeira resposta nos últimos 30 dias)
 *
 * Tie-break: consultor que recebeu lead há mais tempo (round-robin justo).
 *
 * Mantém compatibilidade do contrato anterior (assignNextConsultant(leadId, table)).
 */

const FINAL_STATUSES = ['vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity'];

interface ConsultantScore {
    id: string;
    name: string;
    load: number;
    wonLast30: number;
    leadsLast30: number;
    avgFirstResponseMin: number;
    lastAssignedAt: string | null;
    composite: number;
}

async function statsFor(consultantId: string): Promise<Pick<ConsultantScore, 'load' | 'wonLast30' | 'leadsLast30' | 'avgFirstResponseMin'>> {
    const admin = createClient();
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

    const [{ count: load }, { count: leadsLast30 }, { count: wonLast30 }, { data: respLeads }] = await Promise.all([
        admin.from('leads_manos_crm').select('id', { count: 'exact', head: true })
            .eq('assigned_consultant_id', consultantId)
            .gte('created_at', dayAgo)
            .not('status', 'in', `(${FINAL_STATUSES.map(s => `"${s}"`).join(',')})`),
        admin.from('leads_manos_crm').select('id', { count: 'exact', head: true })
            .eq('assigned_consultant_id', consultantId)
            .gte('created_at', monthAgo),
        admin.from('leads_manos_crm').select('id', { count: 'exact', head: true })
            .eq('assigned_consultant_id', consultantId)
            .eq('status', 'vendido')
            .gte('won_at', monthAgo),
        admin.from('leads_manos_crm')
            .select('created_at, first_contact_at')
            .eq('assigned_consultant_id', consultantId)
            .not('first_contact_at', 'is', null)
            .gte('created_at', monthAgo)
            .limit(100),
    ]);

    let avgFirstResponseMin = 60;
    if (respLeads && respLeads.length > 0) {
        const diffs: number[] = [];
        for (const r of respLeads as any[]) {
            const a = new Date(r.first_contact_at).getTime();
            const b = new Date(r.created_at).getTime();
            const m = (a - b) / 60000;
            if (m >= 0 && m < 60 * 24) diffs.push(m); // ignora outliers >24h
        }
        if (diffs.length > 0) {
            avgFirstResponseMin = diffs.reduce((s, x) => s + x, 0) / diffs.length;
        }
    }

    return {
        load: load || 0,
        wonLast30: wonLast30 || 0,
        leadsLast30: leadsLast30 || 0,
        avgFirstResponseMin,
    };
}

function compositeScore(s: { load: number; wonLast30: number; leadsLast30: number; avgFirstResponseMin: number }): number {
    const capacity = 1 / (1 + s.load);
    const winRate = s.leadsLast30 > 0 ? s.wonLast30 / s.leadsLast30 : 0;
    const speed = 1 / (1 + s.avgFirstResponseMin / 5); // 5min = score 0.5
    return 0.4 * capacity + 0.4 * winRate + 0.2 * speed;
}

export async function assignNextConsultant(
    leadId: string,
    table: 'leads_compra' | 'leads_manos_crm' | 'leads_master'
): Promise<string | null> {
    const admin = createClient();

    const { data: consultants, error } = await admin
        .from('consultants_manos_crm')
        .select('id, name, last_lead_assigned_at')
        .eq('is_active', true)
        .neq('role', 'admin');

    if (error || !consultants || consultants.length === 0) {
        await logFailure(leadId, table, 'sem_consultor_ativo');
        return null;
    }

    const scored: ConsultantScore[] = await Promise.all(
        consultants.map(async (c: any) => {
            const stats = await statsFor(c.id);
            return {
                id: c.id,
                name: c.name,
                load: stats.load,
                wonLast30: stats.wonLast30,
                leadsLast30: stats.leadsLast30,
                avgFirstResponseMin: stats.avgFirstResponseMin,
                lastAssignedAt: c.last_lead_assigned_at,
                composite: compositeScore(stats),
            };
        })
    );

    scored.sort((a, b) => {
        if (b.composite !== a.composite) return b.composite - a.composite;
        // Tie-break: round-robin justo (quem recebeu há mais tempo)
        if (!a.lastAssignedAt) return -1;
        if (!b.lastAssignedAt) return 1;
        return new Date(a.lastAssignedAt).getTime() - new Date(b.lastAssignedAt).getTime();
    });

    const chosen = scored[0];

    const { error: updErr } = await admin
        .from(table)
        .update({ assigned_consultant_id: chosen.id, updated_at: new Date().toISOString() })
        .eq('id', leadId);

    if (updErr) {
        await logFailure(leadId, table, `update_lead_falhou: ${updErr.message}`);
        return null;
    }

    await admin
        .from('consultants_manos_crm')
        .update({ last_lead_assigned_at: new Date().toISOString() })
        .eq('id', chosen.id);

    console.log(`[autoAssign] ${leadId} → ${chosen.name} (composite=${chosen.composite.toFixed(3)} load=${chosen.load} winRate=${chosen.leadsLast30 > 0 ? (chosen.wonLast30 / chosen.leadsLast30 * 100).toFixed(1) : 0}% speed=${chosen.avgFirstResponseMin.toFixed(1)}min)`);
    return chosen.id;
}

async function logFailure(leadId: string, channel: string, msg: string) {
    try {
        const admin = createClient();
        await admin.from('notification_failures').insert({
            lead_id: leadId,
            channel: `auto_assign_${channel}`,
            error_message: msg,
            resolved: false,
            payload: { timestamp: new Date().toISOString() },
        });
    } catch {}
}
