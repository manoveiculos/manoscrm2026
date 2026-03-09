'use server';

import { supabase } from '@/lib/supabase';
import { LeadStatus } from '@/lib/types';
import { sendMetaConversion } from '@/lib/meta-service';

export async function updateLeadStatusAction(
    leadId: string,
    status: LeadStatus,
    oldStatus?: LeadStatus,
    notes?: string,
    motivo_perda?: string,
    resumo_fechamento?: string
) {
    console.log('DEBUG: Status recebido no updateLeadStatus (SERVER ACTION):', status);

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
            const { data: currentLead } = await supabase.from(table).select('*, consultants_manos_crm(name)').eq('id', realId).single();

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

            const { error: redError } = await supabase
                .from(table)
                .update(redistributionPayload)
                .eq('id', realId);

            if (redError) throw redError;

            // Trigger Meta Disqualification event BEFORE early return
            if (table === 'leads_manos_crm' || table === 'leads_distribuicao_crm_26') {
                const s = String(status).toUpperCase().trim();
                if (['PERDA / SEM CONTATO', 'PERDIDO / DESCARTE', 'LOST', 'LOST_REDISTRIBUTED', 'POST_SALE', 'TRASH'].includes(s)) {
                    console.log(`⚠️ Evento de Desqualificação enviado para Meta | Motivo: ${s}`);
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

    const { error } = await supabase
        .from(table)
        .update(updatePayload)
        .eq('id', realId);

    if (error) {
        if (table === 'leads_distribuicao_crm_26') {
            const { data } = await supabase.from(table).select('resumo').eq('id', realId).single();
            let resumo = data?.resumo || '';
            const statusMarker = `[STATUS:${targetStatus}]`;
            if (!resumo.includes('[STATUS:')) resumo += ` ${statusMarker}`;
            else resumo = resumo.replace(/\[STATUS:.*?\]/, statusMarker);
            await supabase.from(table).update({ resumo, status: targetStatus }).eq('id', realId);
        } else {
            await supabase.from(table).update({ status: targetStatus }).eq('id', realId);
        }
    }

    // DISPATCH META CONVERSION (Wait for it since we are on server)
    if (table === 'leads_manos_crm' || table === 'leads_distribuicao_crm_26') {
        try {
            const { data: leadData } = await supabase.from(table).select('*').eq('id', realId).single();
            if (leadData && (leadData.phone || leadData.telefone)) {
                let eventName: string | null = null;
                let extraData: any = undefined;
                const s = String(status).toUpperCase().trim();

                // FINAL META CAPI MAPPING (Refined as requested)
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
                    console.log(`⚠️ Evento de Desqualificação enviado para Meta | Motivo: ${s}`);
                }

                if (eventName) {
                    console.log(`DEBUG: Disparando Meta Conversion [${eventName}] para ${leadData.nome || 'Lead'} (Lead ID: ${leadData.id || realId})...`);
                    await sendMetaConversion(leadData, eventName, extraData);
                }
            }
        } catch (metaErr) {
            console.warn("Non-blocking Meta CAPI error:", metaErr);
        }
    }

    return { success: true };
}
