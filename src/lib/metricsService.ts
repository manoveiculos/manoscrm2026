import { SupabaseClient } from '@supabase/supabase-js';
import { getFinancialMetrics } from './services/analyticsService';
import { FinancialMetrics } from './types';

/**
 * METRICS SERVICE (COMPATIBILITY PROXY)
 * Este serviço agora delega para o analyticsService modular (Fase 3).
 */
export const metricsService = {
    _client: null as any,

    setClient(client: any) {
        this._client = client;
    },

    /**
     * @deprecated Use analyticsService.getFinancialMetrics diretamente em novos recursos.
     */
    async getFinancialMetrics(
        supabase?: SupabaseClient, 
        consultantId?: string, 
        period: 'daily' | 'monthly' = 'daily'
    ): Promise<FinancialMetrics> {
        const mappedPeriod = period === 'daily' ? 'today' : 'this_month';
        
        const metrics = await getFinancialMetrics({
            period: mappedPeriod,
            consultantId
        });

        // Garantir mapeamento para o tipo esperado pela V1/Dashboard Legado
        return {
            leadCount: metrics.leadCount,
            salesCount: metrics.salesCount,
            inventoryCount: metrics.inventoryCount, // Novo campo real
            totalSpend: 0,
            totalRevenue: metrics.totalRevenue,
            totalProfit: metrics.totalProfit,
            cac: metrics.cac,
            cpl: 0,
            roi: metrics.roi,
            avgResponseTime: metrics.avgResponseTime,
            responseRate: metrics.responseRate,
            conversionRate: metrics.conversionRate
        } as any;
    }
};
