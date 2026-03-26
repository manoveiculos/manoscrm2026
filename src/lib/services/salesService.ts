import { supabase } from './supabaseClients';
import { stripPrefix } from './leadRouter';
import { cacheInvalidate } from './cacheLayer';

/**
 * SERVIÇO DE VENDAS (SALES)
 * ⚠️ CONFLITO DOCUMENTADO:
 * - metricsService.ts e recordSaleAction usam tabela 'sales'
 * - dataService.getConsultantMetrics usa 'sales_manos_crm'
 * Unificação na Fase 4.
 */

export async function getSales() {
    return supabase.from('sales').select('*');
}

export async function getSalesManosCrm(consultantId?: string) {
    let query = supabase.from('sales_manos_crm').select('*');
    if (consultantId) {
        query = query.eq('consultant_id', stripPrefix(consultantId));
    }
    return query;
}

export async function recordSale(saleData: any) {
    const cleanId = stripPrefix(saleData.lead_id || '');
    const cleanConsId = stripPrefix(saleData.consultant_id || '');
    const now = new Date().toISOString();

    const salePayload = {
        lead_id: cleanId,
        consultant_id: cleanConsId || null,
        sale_value: saleData.sale_value || 0,
        profit_margin: saleData.profit_margin || 0,
        sale_date: saleData.sale_date || now,
        created_at: now,
        inventory_id: saleData.inventory_id || null,
        vehicle_name: saleData.vehicle_name || saleData.lead?.vehicle_interest || 'Venda Direta',
        consultant_name: saleData.consultant_name || 'Equipe'
    };

    // 1. Gravar na tabela 'sales' (Legacy + metricsService)
    const { data: legacySale, error: legacyError } = await supabase
        .from('sales')
        .insert([salePayload])
        .select()
        .single();

    if (legacyError) console.error("Erro ao gravar em sales (legacy):", legacyError);

    // 2. Gravar na tabela 'sales_manos_crm' (V2 Performance + dataService)
    const { data: v2Sale, error: v2Error } = await supabase
        .from('sales_manos_crm')
        .insert([salePayload])
        .select()
        .single();

    if (v2Error) console.error("Erro ao gravar em sales_manos_crm (v2):", v2Error);

    cacheInvalidate('leads_', 'metrics_');
    return v2Sale || legacySale;
}


