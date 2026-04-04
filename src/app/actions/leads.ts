'use server';

import { createClient } from '@/lib/supabase/admin';
import { LeadStatus, Lead, Sale, Purchase } from '@/lib/types';
import { sendMetaConversion } from '@/lib/meta-service';
import { dataService } from '@/lib/dataService';
import { revalidatePath } from 'next/cache';
import { cacheInvalidate } from '@/lib/services/cacheLayer';

export async function updateLeadStatusAction(
    leadId: string,
    status: LeadStatus,
    oldStatus?: LeadStatus,
    notes?: string,
    motivo_perda?: string,
    resumo_fechamento?: string
) {
    // DEBUG: Remoção conforme solicitado na auditoria final

    const adminClient = createClient();
    dataService.setClient(adminClient);

    let table = 'leads_manos_crm';
    let realId: any = leadId;

    if (leadId.startsWith('crm26_')) {
        table = 'leads_distribuicao_crm_26';
        realId = parseInt(leadId.substring(6));
    } else if (leadId.startsWith('main_')) {
        table = 'leads_manos_crm';
        realId = leadId.substring(5);
    } else if (leadId.startsWith('master_')) {
        table = 'leads_master';
        realId = leadId.substring(7);
    } else if (leadId.startsWith('dist_')) {
        table = 'leads_distribuicao';
        realId = parseInt(leadId.substring(5));
    }

    // REDISTRIBUTION TRIGGER LOGIC
    const isRedistributionTrigger = ['lost', 'post_sale'].includes(status);
    let targetStatus = status;

    if (isRedistributionTrigger) {
        targetStatus = 'lost_redistributed' as any;

        try {
            const { data: currentLead } = await adminClient
                .from(table)
                .select('id, dados_brutos, assigned_consultant_id, vendedor, consultants(name)')
                .eq('id', realId)
                .single();

            const meta = {
                ...(currentLead?.dados_brutos || {}),
                previous_consultant_id: currentLead?.assigned_consultant_id || currentLead?.vendedor,
                previous_consultant_name: (currentLead?.consultants as any)?.[0]?.name || currentLead?.vendedor || 'Desconhecido',
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
                // Erro silencioso
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

            cacheInvalidate('leads_');
            revalidatePath('/', 'layout');
            
            return { success: true, redistributed: true };
        } catch (err) {
            console.error("Redistribution trigger error:", err);
        }
    }

    const now = new Date().toISOString();
    const updatePayload: any = { status: targetStatus };

    if (table === 'leads_manos_crm' || table === 'leads_master') {
        updatePayload.updated_at = now;
    } else {
        updatePayload.atualizado_em = now;
    }

    if (motivo_perda) updatePayload.motivo_perda = motivo_perda;
    if (resumo_fechamento) updatePayload.resumo_fechamento = resumo_fechamento;
    if (notes) updatePayload.notas = notes;

    // Sincronizar marcador de status no resumo para leads CRM26 (Evita que o parser legado sobrescreva no refresh)
    if (table === 'leads_distribuicao_crm_26') {
        const { data: currentLead } = await adminClient.from(table).select('resumo').eq('id', realId).single();
        let resumo = currentLead?.resumo || '';
        const statusMarker = `[STATUS:${targetStatus}]`;
        if (!resumo.includes('[STATUS:')) resumo += ` ${statusMarker}`;
        else resumo = resumo.replace(/\[STATUS:.*?\]/, statusMarker);
        
        updatePayload.resumo = resumo;
    }

    const { data: updateData, error } = await adminClient
        .from(table)
        .update(updatePayload)
        .eq('id', realId)
        .select('id');

    if (error || !updateData || updateData.length === 0) {
        console.warn(`[updateLeadStatusAction] Falha na atualização primária (tabela: ${table}, id: ${realId}):`, error?.message || 'Zero rows affected');
        
        // --- FALLBACK 1: CRM26 Legacy ---
        if (table === 'leads_distribuicao_crm_26') {
            const { data: currentLead } = await adminClient.from(table).select('resumo').eq('id', realId).single();
            let resumo = currentLead?.resumo || '';
            const statusMarker = `[STATUS:${targetStatus}]`;
            
            if (!resumo.includes('[STATUS:')) resumo += ` ${statusMarker}`;
            else resumo = resumo.replace(/\[STATUS:.*?\]/, statusMarker);
            
            const { error: fError, data: fData } = await adminClient
                .from(table)
                .update({ resumo, status: targetStatus, atualizado_em: now })
                .eq('id', realId)
                .select('id');

            if (fError || !fData || fData.length === 0) {
                console.error("[updateLeadStatusAction] Erro CRÍTICO: Lead CRM26 não encontrado.", { realId });
                throw new Error(`Lead ${leadId} não encontrado.`);
            }
        } 
        // --- FALLBACK 2: Transição V1 <-> V2 (UUIDs sem prefixo ou com prefixo trocado) ---
        else if (table === 'leads_master' || table === 'leads_manos_crm') {
            const otherTable = table === 'leads_master' ? 'leads_manos_crm' : 'leads_master';
            
            const { error: fError, data: fData } = await adminClient
                .from(otherTable)
                .update(updatePayload)
                .eq('id', realId)
                .select('id');

            if (fError || !fData || fData.length === 0) {
                throw new Error(`Falha ao persistir status do lead ${leadId}. O registro não foi encontrado em nenhuma tabela compatível (Master ou Manos).`);
            }
        } else {
            throw new Error(`Falha ao persistir status do lead ${leadId}. O registro pode ter sido excluído.`);
        }
    }

    // DISPATCH META CONVERSION
    if (table === 'leads_manos_crm' || table === 'leads_distribuicao_crm_26') {
        try {
            const { data: leadData } = await adminClient
                .from(table)
                .select('id, phone, telefone, status')
                .eq('id', realId)
                .single();
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
    
    // ATENÇÃO: Limpa cache local da API Node e FORÇA o re-render da /pipeline do Next.js
    // Invalidamos 'leads' e 'leads2' para cobrir V2 e CRM26
    cacheInvalidate('leads_', 'leads2');
    revalidatePath('/', 'layout');

    return { success: true };
}

export async function recordSaleAction(leadData: Partial<Lead>, saleData: Partial<Sale>) {
    try {
        const adminClient = createClient();
        dataService.setClient(adminClient); // Injeta o adminClient globalmente (Fase 4)

        // 1. Promover lead usando dataService
        const promotedLead = await dataService.createLead(leadData);
        if (!promotedLead) throw new Error("Falha ao promover lead.");

        // 2. Registrar venda via serviço unificado (grava em ambas as tabelas)
        const saleRecord = await dataService.recordSale({
            ...saleData,
            lead_id: promotedLead.id,
            lead: promotedLead
        });

        return { success: true, lead: promotedLead, sale: saleRecord };
    } catch (err: any) {
        console.error("recordSaleAction Error:", err);
        return { success: false, error: err.message || "Erro desconhecido ao registrar venda." };
    }
}

export async function recordPurchaseAction(leadData: Partial<Lead>, purchaseData: Partial<Purchase>) {
    try {
        const adminClient = createClient();
        dataService.setClient(adminClient);

        const promotedLead = await dataService.createLead(leadData);
        if (!promotedLead) throw new Error("Falha ao promover lead.");

        const purchaseRecord = await dataService.recordPurchase({
            ...purchaseData,
            lead_id: promotedLead.id
        });

        return { success: true, lead: promotedLead, purchase: purchaseRecord };
    } catch (err: any) {
        console.error("recordPurchaseAction Error:", err);
        return { success: false, error: err.message || "Erro desconhecido ao registrar compra." };
    }
}

