import { supabase } from './supabaseClients';
import { stripPrefix } from './leadRouter';

/**
 * SERVIÇO DE COMPRAS (PURCHASES)
 * ⚠️ CONFLITO DETECTADO:
 * - recordPurchaseAction GRAVA em 'purchases'
 * - dataService BUSCA em 'purchases_manos_crm'
 * Unificação planejada para a Fase 4.
 */

export async function recordPurchase(purchaseData: any) {
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

    // 1. Gravar na tabela 'purchases' (Legacy)
    const { data: legacyPur, error: legacyError } = await supabase
        .from('purchases')
        .insert([purchasePayload])
        .select()
        .single();
    
    if (legacyError) console.error("Erro ao gravar em purchases (legacy):", legacyError);

    // 2. Gravar na tabela 'purchases_manos_crm' (V2 lookup)
    const { data: v2Pur, error: v2Error } = await supabase
        .from('purchases_manos_crm')
        .insert([purchasePayload])
        .select()
        .single();

    if (v2Error) console.error("Erro ao gravar em purchases_manos_crm (v2):", v2Error);

    return v2Pur || legacyPur;
}

export async function getPurchases(leadId?: string) {
    // BUSCA em 'purchases_manos_crm' como orientado no mapeamento de conflitos
    let query = supabase.from('purchases_manos_crm').select('*');
    if (leadId) {
        query = query.eq('lead_id', stripPrefix(leadId));
    }
    return query;
}
