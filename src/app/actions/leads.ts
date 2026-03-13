'use server';

import { createClient } from '@supabase/supabase-js';
import { LeadStatus, Lead, Sale, Purchase } from '@/lib/types';
import { sendMetaConversion } from '@/lib/meta-service';
import { dataService } from '@/lib/dataService';

/**
 * Função auxiliar para obter um cliente Supabase com privilégios de Service Role.
 * Isso garante o bypass de RLS em operações críticas no servidor.
 */
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!url || !serviceKey) {
        throw new Error("Configurações do Supabase (URL ou SERVICE_ROLE_KEY) ausentes no servidor.");
    }
    
    return createClient(url, serviceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });
}

export async function updateLeadStatusAction(
    leadId: string,
    status: LeadStatus,
    oldStatus?: LeadStatus,
    notes?: string,
    motivo_perda?: string,
    resumo_fechamento?: string
) {
    console.log('DEBUG: Status recebido no updateLeadStatus (SERVER ACTION):', status);

    const adminClient = getAdminClient();
    dataService.setClient(adminClient);

    let table = 'leads_manos_crm';
    let realId: any = leadId;

    if (leadId.startsWith('crm26_')) {
        table = 'leads_distribuicao_crm_26';
        realId = leadId.replace('crm26_', '');
    } else if (leadId.startsWith('main_')) {
        table = 'leads_manos_crm';
        realId = leadId.replace('main_', '');
    } else if (leadId.startsWith('dist_')) {
        table = 'leads_distribuicao';
        realId = leadId.replace('dist_', '');
    }

    // REDISTRIBUTION TRIGGER LOGIC
    const isRedistributionTrigger = ['lost', 'post_sale'].includes(status);
    let targetStatus = status;

    if (isRedistributionTrigger) {
        targetStatus = 'lost_redistributed' as any;

        try {
            const { data: currentLead } = await adminClient.from(table).select('*, consultants_manos_crm(name)').eq('id', realId).single();

            const meta = {
                ...(currentLead?.dados_brutos || {}),
                previous_consultant_id: currentLead?.assigned_consultant_id || currentLead?.vendedor,
                previous_consultant_name: currentLead?.consultants_manos_crm?.name || currentLead?.vendedor || 'Desconhecido',
                lost_at: new Date().toISOString(),
                redistribution_eligible_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
                motivo_perda: motivo_perda || 'Não especificado'
            };

            const redistributionPayload: any = {
                status: targetStatus,
                vendedor_anterior: meta.previous_consultant_name,
                dados_brutos: meta,
                updated_at: new Date().toISOString()
            };

            if (table === 'leads_manos_crm') {
                redistributionPayload.assigned_consultant_id = null;
            } else {
                redistributionPayload.vendedor = null;
                redistributionPayload.enviado = false;
            }

            if (motivo_perda) redistributionPayload.motivo_perda = motivo_perda;
            if (resumo_fechamento) redistributionPayload.resumo_fechamento = resumo_fechamento;

            const { error: redError } = await adminClient
                .from(table)
                .update(redistributionPayload)
                .eq('id', realId);

            if (redError) throw redError;

            try {
                if (table === 'leads_manos_crm' || table === 'leads_distribuicao_crm_26') {
                    await dataService.logHistory(
                        realId, 
                        targetStatus, 
                        status, 
                        `[SISTEMA] Lead movido para fila de reativação (Descarte de ${meta.previous_consultant_name}). Motivo: ${motivo_perda || 'Não informado'}`
                    );
                }
            } catch (err) {
                console.error("Erro ao registrar history de redistribuição:", err);
            }

            // Trigger Meta Disqualification event
            if (table === 'leads_manos_crm' || table === 'leads_distribuicao_crm_26') {
                const s = String(status).toUpperCase().trim();
                if (['PERDA / SEM CONTATO', 'PERDIDO / DESCARTE', 'LOST', 'LOST_REDISTRIBUTED', 'POST_SALE', 'TRASH'].includes(s)) {
                    await sendMetaConversion(currentLead || { id: realId }, 'DisqualifiedLead', {
                        lead_quality: "disqualified",
                        reason: s
                    });
                }
            }

            return { success: true, redistributed: true };
        } catch (err) {
            console.error("Redistribution trigger error:", err);
        }
    }

    const now = new Date().toISOString();
    const updatePayload: any = { status: targetStatus };

    if (table === 'leads_manos_crm') {
        updatePayload.updated_at = now;
    } else {
        updatePayload.atualizado_em = now;
    }

    if (motivo_perda) updatePayload.motivo_perda = motivo_perda;
    if (resumo_fechamento) updatePayload.resumo_fechamento = resumo_fechamento;
    if (notes) updatePayload.notas = notes;

    const { error } = await adminClient
        .from(table)
        .update(updatePayload)
        .eq('id', realId);

    if (error) {
        if (table === 'leads_distribuicao_crm_26') {
            const { data } = await adminClient.from(table).select('resumo').eq('id', realId).single();
            let resumo = data?.resumo || '';
            const statusMarker = `[STATUS:${targetStatus}]`;
            if (!resumo.includes('[STATUS:')) resumo += ` ${statusMarker}`;
            else resumo = resumo.replace(/\[STATUS:.*?\]/, statusMarker);
            await adminClient.from(table).update({ resumo, status: targetStatus }).eq('id', realId);
        } else {
            await adminClient.from(table).update({ status: targetStatus }).eq('id', realId);
        }
    }

    // DISPATCH META CONVERSION
    if (table === 'leads_manos_crm' || table === 'leads_distribuicao_crm_26') {
        try {
            const { data: leadData } = await adminClient.from(table).select('*').eq('id', realId).single();
            if (leadData && (leadData.phone || leadData.telefone)) {
                let eventName: string | null = null;
                let extraData: any = undefined;
                const s = String(status).toUpperCase().trim();

                if (['AGUARDANDO', 'EM ATENDIMENTO', 'NEW', 'RECEIVED', 'ATTEMPT', 'CONTACTED', 'CONFIRMED'].includes(s)) {
                    eventName = 'Lead';
                } else if (['AGENDAMENTO', 'SCHEDULED'].includes(s)) {
                    eventName = 'Schedule';
                } else if (['VISITA E TEST DRIVE', 'VISITED', 'TEST_DRIVE', 'VISITOU'].includes(s)) {
                    eventName = 'StoreVisit';
                } else if (['NEGOCIAÇÃO', 'PROPOSTA ENVIADA', 'PROPOSED', 'NEGOTIATION'].includes(s)) {
                    eventName = 'Contact';
                } else if (['VENDIDO', 'COMPRA REALIZADA', 'CLOSED', 'COMPRADO', 'FECHADO', 'VENDA'].includes(s)) {
                    eventName = 'Purchase';
                } else if (['PERDA / SEM CONTATO', 'PERDIDO / DESCARTE', 'LOST', 'LOST_REDISTRIBUTED', 'POST_SALE', 'TRASH'].includes(s)) {
                    eventName = 'DisqualifiedLead';
                    extraData = { lead_quality: "disqualified", reason: s };
                }

                if (eventName) {
                    await sendMetaConversion(leadData, eventName, extraData);
                }
            }
        } catch (metaErr) {
            console.warn("Non-blocking Meta CAPI error:", metaErr);
        }
    }

    return { success: true };
}

export async function recordSaleAction(leadData: Partial<Lead>, saleData: Partial<Sale>) {
    try {
        console.log("DEBUG: Iniciando recordSaleAction (SERVER V2)...");
        const adminClient = getAdminClient();
        dataService.setClient(adminClient);

        // 1. Promover lead usando dataService
        const promotedLead = await dataService.createLead(leadData);
        if (!promotedLead) throw new Error("Falha ao promover lead via Server Action.");

        const realLeadId = promotedLead.id.replace('main_', '');
        const cleanConsultantId = saleData.consultant_id?.replace(/main_|crm26_|dist_/, '');

        // 2. Inserir venda via ADMIN para pular RLS
        const { data: insertedSale, error: saleError } = await adminClient
            .from('sales_manos_crm')
            .insert([{
                lead_id: realLeadId,
                consultant_id: cleanConsultantId || null,
                sale_value: saleData.sale_value || 0,
                profit_margin: saleData.profit_margin || 0,
                sale_date: new Date().toISOString(),
                created_at: new Date().toISOString(),
                inventory_id: null
            }])
            .select()
            .single();

        if (saleError) {
            console.error("ERRO RLS/DB na Inserção de Venda:", saleError);
            throw new Error(`Erro ao inserir venda (Bypass): ${saleError.message}`);
        }

        console.log("DEBUG: Venda registrada com sucesso:", insertedSale?.id);
        return { success: true, lead: promotedLead, sale: insertedSale };
    } catch (err: any) {
        console.error("SERVER ACTION ERROR (recordSale):", err);
        return { success: false, error: err.message };
    }
}

export async function recordPurchaseAction(leadData: Partial<Lead>, purchaseData: Partial<Purchase>) {
    try {
        console.log("DEBUG: Iniciando recordPurchaseAction (SERVER V2)...");
        const adminClient = getAdminClient();
        dataService.setClient(adminClient);

        const promotedLead = await dataService.createLead(leadData);
        if (!promotedLead) throw new Error("Falha ao promover lead via Server Action.");

        const realLeadId = promotedLead.id.replace('main_', '');
        const cleanConsultantId = purchaseData.consultant_id?.replace(/main_|crm26_|dist_/, '');

        const { data: insertedPurchase, error: purchaseError } = await adminClient
            .from('purchases_manos_crm')
            .insert([{
                lead_id: realLeadId,
                consultant_id: cleanConsultantId || null,
                vehicle_details: purchaseData.vehicle_details,
                purchase_value: purchaseData.purchase_value || 0,
                purchase_date: new Date().toISOString(),
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (purchaseError) {
            console.error("ERRO RLS/DB na Inserção de Compra:", purchaseError);
            throw new Error(`Erro ao inserir compra (Bypass): ${purchaseError.message}`);
        }

        console.log("DEBUG: Compra registrada com sucesso:", insertedPurchase?.id);
        return { success: true, lead: promotedLead, purchase: insertedPurchase };
    } catch (err: any) {
        console.error("SERVER ACTION ERROR (recordPurchase):", err);
        return { success: false, error: err.message };
    }
}
