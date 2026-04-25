import { createClient } from '@/lib/supabase/admin';
import { stripPrefix } from './leadRouter';

/**
 * SERVIÇO DE COMPRAS (PURCHASES)
 * ⚠️ CONFLITO DETECTADO:
 * - recordPurchaseAction GRAVA em 'purchases'
 * - dataService BUSCA em 'purchases_manos_crm'
 * Unificação planejada para a Fase 4.
 */

export async function recordPurchase(purchaseData: any) {
    const admin = createClient();
    const cleanId = stripPrefix(purchaseData.lead_id || '');
    const cleanConsId = stripPrefix(purchaseData.consultant_id || '');
    const now = new Date().toISOString();

    const purchasePayload = {
        lead_id: cleanId,
        consultant_id: cleanConsId || null,
        vehicle_details: purchaseData.vehicle_details,
        purchase_value: purchaseData.purchase_value || 0,
        purchase_date: purchaseData.purchase_date || now,
        created_at: now
    };

    // 1. Gravar na tabela 'purchases' (Legacy) e 'purchases_manos_crm' (V2) em paralelo
    const [legacyRes, v2Res] = await Promise.all([
        admin.from('purchases').insert([purchasePayload]).select().single(),
        admin.from('purchases_manos_crm').insert([purchasePayload]).select().single()
    ]);
    
    if (legacyRes.error) console.error("Erro ao gravar em purchases (legacy):", legacyRes.error);
    if (v2Res.error) console.error("Erro ao gravar em purchases_manos_crm (v2):", v2Res.error);

    return v2Res.data || legacyRes.data;
}

export async function getPurchases(leadId?: string) {
    const admin = createClient();
    let query = admin.from('purchases_manos_crm').select('*');
    if (leadId) {
        query = query.eq('lead_id', stripPrefix(leadId));
    }
    return query;
}
