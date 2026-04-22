import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

const HOT_SCORE_THRESHOLD = 70;

type Period = 'week' | 'month' | 'quarter' | 'all';

function startDateFor(period: Period): string | null {
    const now = new Date();
    if (period === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d.toISOString();
    }
    if (period === 'month') {
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }
    if (period === 'quarter') {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        return d.toISOString();
    }
    return null;
}

interface ConsultantRow {
    id: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    leads_assigned: number;
    sales_count: number;
    loss_count: number;
    hot_loss_count: number;
    consultant_abandoned_count: number;
    avg_response_score: number | null;
    conversion_rate: number;
    hot_loss_rate: number;
    risk_flag: 'red' | 'yellow' | 'green';
}

/**
 * GET /api/admin/consultant-performance?period=month
 *
 * Retorna ranking por vendedor com foco em DESMASCARAR quem queima
 * pipeline. Métrica chave: consultant_abandoned_count (perdas onde
 * a IA detectou que o vendedor abandonou cliente que respondeu).
 */
export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const period = (url.searchParams.get('period') || 'month') as Period;
    const start = startDateFor(period);

    const admin = createClient();

    const { data: consultants, error: consErr } = await admin
        .from('consultants_manos_crm')
        .select('id, name, email, role, is_active')
        .eq('is_active', true);

    if (consErr) {
        return NextResponse.json({ error: consErr.message }, { status: 500 });
    }

    const rows: ConsultantRow[] = await Promise.all((consultants || []).map(async (c) => {
        // Base query helpers — todos filtram por consultor + período
        const filterMain = (q: any) => {
            q = q.eq('assigned_consultant_id', c.id);
            if (start) q = q.gte('created_at', start);
            return q;
        };
        const filterCompra = (q: any) => {
            q = q.eq('assigned_consultant_id', c.id);
            if (start) q = q.gte('criado_em', start);
            return q;
        };

        // ── 1. Leads atribuídos no período ──
        const [assignedMain, assignedCompra] = await Promise.all([
            filterMain(admin.from('leads_manos_crm').select('id', { count: 'exact', head: true })),
            filterCompra(admin.from('leads_compra').select('id', { count: 'exact', head: true }))
        ]);

        // ── 2. Vendas / Compras (estágio final positivo) ──
        const [salesMain, salesCompra] = await Promise.all([
            filterMain(admin.from('leads_manos_crm').select('id', { count: 'exact', head: true }).eq('status', 'vendido')),
            filterCompra(admin.from('leads_compra').select('id', { count: 'exact', head: true }).in('status', ['fechado', 'comprado']))
        ]);

        // ── 3. Total de perdas ──
        const [lossMain, lossCompra] = await Promise.all([
            filterMain(admin.from('leads_manos_crm').select('id', { count: 'exact', head: true }).in('status', ['perdido', 'lost'])),
            filterCompra(admin.from('leads_compra').select('id', { count: 'exact', head: true }).eq('status', 'perdido'))
        ]);

        // ── 4. Perdas em leads HOT ──
        const [hotLossMain, hotLossCompra] = await Promise.all([
            filterMain(admin.from('leads_manos_crm').select('id', { count: 'exact', head: true })
                .in('status', ['perdido', 'lost'])
                .gte('ai_score_at_loss', HOT_SCORE_THRESHOLD)),
            filterCompra(admin.from('leads_compra').select('id', { count: 'exact', head: true })
                .eq('status', 'perdido')
                .gte('ai_score_at_loss', HOT_SCORE_THRESHOLD))
        ]);

        // ── 5. Perdas onde IA detectou abandono ──
        const [abandonedMain, abandonedCompra] = await Promise.all([
            filterMain(admin.from('leads_manos_crm').select('id', { count: 'exact', head: true })
                .in('status', ['perdido', 'lost'])
                .eq('loss_attribution', 'consultant_abandoned')),
            filterCompra(admin.from('leads_compra').select('id', { count: 'exact', head: true })
                .eq('status', 'perdido')
                .eq('loss_attribution', 'consultant_abandoned'))
        ]);

        // ── 6. Score médio de proatividade ──
        const [{ data: sMain }, { data: sCompra }] = await Promise.all([
            filterMain(admin.from('leads_manos_crm').select('consultant_response_score').not('consultant_response_score', 'is', null)),
            filterCompra(admin.from('leads_compra').select('consultant_response_score').not('consultant_response_score', 'is', null))
        ]);
        
        const allScores = [...(sMain || []), ...(sCompra || [])]
            .map((r: any) => Number(r.consultant_response_score))
            .filter((n: number) => !isNaN(n));
            
        const avgScore = allScores.length > 0
            ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
            : null;

        const assigned = (assignedMain.count || 0) + (assignedCompra.count || 0);
        const sales = (salesMain.count || 0) + (salesCompra.count || 0);
        const losses = (lossMain.count || 0) + (lossCompra.count || 0);
        const hotLosses = (hotLossMain.count || 0) + (hotLossCompra.count || 0);
        const abandoned = (abandonedMain.count || 0) + (abandonedCompra.count || 0);

        const conversionRate = assigned > 0 ? Math.round((sales / assigned) * 100) : 0;
        const hotLossRate = assigned > 0 ? Math.round((hotLosses / assigned) * 100) : 0;

        // Bandeira: red >= 3 hot/abandoned no período | yellow >= 1 | green
        let risk: 'red' | 'yellow' | 'green' = 'green';
        if (abandoned >= 3 || hotLosses >= 3) risk = 'red';
        else if (abandoned >= 1 || hotLosses >= 1) risk = 'yellow';

        return {
            id: c.id,
            name: c.name,
            email: c.email,
            role: c.role,
            is_active: c.is_active,
            leads_assigned: assigned,
            sales_count: sales,
            loss_count: losses,
            hot_loss_count: hotLosses,
            consultant_abandoned_count: abandoned,
            avg_response_score: avgScore,
            conversion_rate: conversionRate,
            hot_loss_rate: hotLossRate,
            risk_flag: risk,
        };
    }));

    // Ordena: red primeiro (urgente p/ gerente), depois maior taxa de perda hot
    rows.sort((a, b) => {
        const flagOrder = { red: 0, yellow: 1, green: 2 };
        if (flagOrder[a.risk_flag] !== flagOrder[b.risk_flag]) {
            return flagOrder[a.risk_flag] - flagOrder[b.risk_flag];
        }
        return b.hot_loss_count - a.hot_loss_count;
    });

    return NextResponse.json({
        period,
        threshold_hot: HOT_SCORE_THRESHOLD,
        consultants: rows,
        generated_at: new Date().toISOString(),
    });
}
