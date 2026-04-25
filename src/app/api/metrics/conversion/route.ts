import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/metrics/conversion
 *
 * Métricas que provam se a Sprint 1-4 está pagando.
 *
 * Query params:
 *   days?  janela de análise (default 30, max 90)
 *
 * Retorno:
 *   - daily: série diária de leads recebidos vs vendas fechadas vs perdidos
 *   - byVendor: por vendedor (recebidos, 1ª resposta <5min, vendidos, perdidos, conv%)
 *   - funnel: total → contatado → respondido → vendidos
 *   - speedToLead: distribuição do tempo até primeiro contato
 *   - kpis: tempo médio até 1ª resposta, % respondidos em 5min, conversão geral
 */

interface UnifiedRow {
    table_name: string;
    native_id: string;
    name: string | null;
    status: string | null;
    assigned_consultant_id: string | null;
    created_at: string;
    updated_at: string | null;
    first_contact_at: string | null;
}

const FINAL_LOST = ['perdido', 'lost', 'lost_by_inactivity'];
const FINAL_SOLD = ['vendido', 'comprado'];

function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get('days')) || 30;
    const days = Math.max(1, Math.min(90, daysRaw));
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const cutoffIso = cutoff.toISOString();

    const admin = createClient();

    const [{ data: leads }, { data: consultants }] = await Promise.all([
        admin.from('leads_unified')
            .select('table_name, native_id, name, status, assigned_consultant_id, created_at, updated_at, first_contact_at')
            .gte('created_at', cutoffIso)
            .limit(20000),
        admin.from('consultants_manos_crm')
            .select('id, name, is_active'),
    ]);

    const rows = (leads || []) as UnifiedRow[];
    const consMap = new Map<string, { name: string; is_active: boolean }>();
    for (const c of (consultants || []) as any[]) {
        if (c.id) consMap.set(c.id, { name: c.name || 'Sem nome', is_active: !!c.is_active });
    }

    const isLost = (s: string | null) => FINAL_LOST.includes((s || '').toLowerCase());
    const isSold = (s: string | null) => FINAL_SOLD.includes((s || '').toLowerCase());
    const responseMinutes = (r: UnifiedRow): number | null => {
        if (!r.first_contact_at) return null;
        return (new Date(r.first_contact_at).getTime() - new Date(r.created_at).getTime()) / 60000;
    };

    // Série diária
    const dailyMap = new Map<string, { received: number; sold: number; lost: number; firstContacted: number }>();
    for (let i = 0; i < days; i++) {
        const d = new Date(cutoff.getTime() + i * 24 * 3600 * 1000);
        dailyMap.set(ymd(d), { received: 0, sold: 0, lost: 0, firstContacted: 0 });
    }
    for (const r of rows) {
        const day = dailyMap.get(ymd(new Date(r.created_at)));
        if (day) {
            day.received++;
            if (r.first_contact_at) day.firstContacted++;
            if (isSold(r.status)) day.sold++;
            else if (isLost(r.status)) day.lost++;
        }
    }
    const daily = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v }));

    // Por vendedor
    const byVendorMap = new Map<string, {
        consultant_id: string;
        name: string;
        received: number;
        sold: number;
        lost: number;
        respondedFast: number;   // <5min
        respondedAt: number;     // total com first_contact_at
        sumResponseMin: number;
    }>();
    for (const r of rows) {
        if (!r.assigned_consultant_id) continue;
        const meta = consMap.get(r.assigned_consultant_id);
        if (!meta) continue;
        let bucket = byVendorMap.get(r.assigned_consultant_id);
        if (!bucket) {
            bucket = {
                consultant_id: r.assigned_consultant_id,
                name: meta.name,
                received: 0, sold: 0, lost: 0,
                respondedFast: 0, respondedAt: 0, sumResponseMin: 0,
            };
            byVendorMap.set(r.assigned_consultant_id, bucket);
        }
        bucket.received++;
        if (isSold(r.status)) bucket.sold++;
        else if (isLost(r.status)) bucket.lost++;
        const m = responseMinutes(r);
        if (m !== null && m >= 0) {
            bucket.respondedAt++;
            bucket.sumResponseMin += m;
            if (m < 5) bucket.respondedFast++;
        }
    }
    const byVendor = Array.from(byVendorMap.values()).map(v => ({
        consultant_id: v.consultant_id,
        name: v.name,
        received: v.received,
        sold: v.sold,
        lost: v.lost,
        conversion: v.received > 0 ? v.sold / v.received : 0,
        responseRateFast: v.received > 0 ? v.respondedFast / v.received : 0,
        avgResponseMin: v.respondedAt > 0 ? v.sumResponseMin / v.respondedAt : 0,
    })).sort((a, b) => b.sold - a.sold);

    // Funil
    const total = rows.length;
    const contacted = rows.filter(r => !!r.first_contact_at).length;
    const sold = rows.filter(r => isSold(r.status)).length;
    const lost = rows.filter(r => isLost(r.status)).length;
    const open = total - sold - lost;
    const funnel = { total, contacted, sold, lost, open };

    // Speed-to-lead distribuição
    const buckets = { '<1min': 0, '1-5min': 0, '5-30min': 0, '30min-2h': 0, '>2h': 0, 'sem_resposta': 0 };
    let totalResp = 0;
    let sumResp = 0;
    for (const r of rows) {
        const m = responseMinutes(r);
        if (m === null || m < 0) {
            buckets.sem_resposta++;
            continue;
        }
        totalResp++;
        sumResp += m;
        if (m < 1) buckets['<1min']++;
        else if (m < 5) buckets['1-5min']++;
        else if (m < 30) buckets['5-30min']++;
        else if (m < 120) buckets['30min-2h']++;
        else buckets['>2h']++;
    }

    const kpis = {
        days,
        windowStart: cutoffIso,
        totalReceived: total,
        totalSold: sold,
        totalLost: lost,
        conversion: total > 0 ? sold / total : 0,
        avgResponseMin: totalResp > 0 ? sumResp / totalResp : 0,
        respondedRate: total > 0 ? contacted / total : 0,
        respondedFastRate: total > 0 ? (buckets['<1min'] + buckets['1-5min']) / total : 0,
    };

    return NextResponse.json({
        ok: true,
        kpis,
        funnel,
        speedToLead: buckets,
        daily,
        byVendor,
    });
}
