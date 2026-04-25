import { createClient } from '@/lib/supabase/admin';

/**
 * salesMetrics — substituição enxuta do antigo analyticsService.
 * Foco: só o que o dashboard de venda precisa.
 *
 * Sem funis complexos, sem CAC/CPL, sem ROI multivariado — apenas
 * leads recebidos, em andamento, vendidos, perdidos e tempo de resposta.
 */

export type Period = 'today' | 'this_week' | 'this_month' | 'all';

export interface SalesMetrics {
    leadCount: number;
    salesCount: number;
    inventoryCount: number;
    totalRevenue: number;
    totalProfit: number;
    conversionRate: number;
    avgResponseTime: number;
    responseRate: number;
    cac: number;
    roi: number;
    funnelData: Record<string, number>;
    tactical?: { scheduled_leads?: any[] };
}

function periodCutoff(period: Period): string | null {
    const now = new Date();
    if (period === 'all') return null;
    if (period === 'today') {
        now.setHours(0, 0, 0, 0);
    } else if (period === 'this_week') {
        const day = now.getDay();
        now.setDate(now.getDate() - day);
        now.setHours(0, 0, 0, 0);
    } else if (period === 'this_month') {
        now.setDate(1);
        now.setHours(0, 0, 0, 0);
    }
    return now.toISOString();
}

interface GetMetricsArgs {
    period: Period;
    consultantId?: string;
    customRange?: { start: string; end: string };
}

/**
 * Compatível com o contrato antigo de getFinancialMetrics.
 * Implementação minimalista — só zera o que não vamos calcular.
 */
export async function getFinancialMetrics(args: GetMetricsArgs): Promise<SalesMetrics> {
    const admin = createClient();
    const start = args.customRange?.start ?? periodCutoff(args.period);
    const end = args.customRange?.end ?? new Date().toISOString();

    const leadsQuery = admin.from('leads_manos_crm').select('id, status, ai_score', { count: 'exact' });
    if (start) leadsQuery.gte('created_at', start);
    if (args.customRange?.end) leadsQuery.lte('created_at', end);
    if (args.consultantId) leadsQuery.eq('assigned_consultant_id', args.consultantId);

    const salesQuery = admin.from('leads_manos_crm').select('id, valor_investimento', { count: 'exact' }).eq('status', 'vendido');
    if (start) salesQuery.gte('won_at', start);
    if (args.consultantId) salesQuery.eq('assigned_consultant_id', args.consultantId);

    const [leadsRes, salesRes] = await Promise.all([leadsQuery, salesQuery]);

    const leadCount = leadsRes.count || 0;
    const salesCount = salesRes.count || 0;
    const totalRevenue = (salesRes.data || []).reduce((acc, s: any) => acc + (Number(s.valor_investimento) || 0), 0);
    const conversionRate = leadCount > 0 ? salesCount / leadCount : 0;

    const funnelData: Record<string, number> = {};
    for (const l of leadsRes.data || []) {
        const k = (l as any).status || 'novo';
        funnelData[k] = (funnelData[k] || 0) + 1;
    }

    return {
        leadCount,
        salesCount,
        inventoryCount: 0,
        totalRevenue,
        totalProfit: 0,
        conversionRate,
        avgResponseTime: 0,
        responseRate: 0,
        cac: 0,
        roi: 0,
        funnelData,
        tactical: { scheduled_leads: [] },
    };
}
