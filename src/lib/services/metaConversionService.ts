import { sendMetaConversion, MetaLeadData, MetaConversionOptions } from '@/lib/meta-service';
import { getMetaAccessToken, getMetaEventsUrl } from '@/lib/metaConfig';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveCatalogVehicle } from '@/lib/services/metaCatalog';

/**
 * SERVIÇO DE ORQUESTRAÇÃO DA META CONVERSIONS API (v26.0)
 * Mapeia eventos do funil comercial do Manos-CRM em eventos padronizados da Meta.
 */

/**
 * 1. Evento: Lead (Entrada de novo lead no CRM)
 */
export async function trackLeadCreated(leadData: MetaLeadData, testEventCode?: string) {
    return await sendMetaConversion(leadData, 'Lead', {
        lead_event_source: 'Manos CRM - Form / Lead Engine',
        test_event_code: testEventCode
    });
}

/**
 * 2. Evento: QualifiedLead (Lead qualificado em Triagem)
 */
export async function trackLeadQualified(leadData: MetaLeadData, testEventCode?: string) {
    return await sendMetaConversion(leadData, 'QualifiedLead', {
        lead_event_source: 'Manos CRM - Triagem / IA Score',
        lead_quality: 'qualified',
        test_event_code: testEventCode
    });
}

/**
 * 3. Evento: Schedule (Agendamento de visita ou test drive em Ataque)
 */
export async function trackAppointmentScheduled(leadData: MetaLeadData, testEventCode?: string) {
    return await sendMetaConversion(leadData, 'Schedule', {
        lead_event_source: 'Manos CRM - Agendamento Showroom',
        test_event_code: testEventCode
    });
}

/**
 * 4. Evento: InPersonMeeting / StoreVisit (Visita realizada no showroom)
 */
export async function trackStoreVisit(leadData: MetaLeadData, testEventCode?: string) {
    return await sendMetaConversion(leadData, 'InPersonMeeting', {
        lead_event_source: 'Manos CRM - Visita Presencial',
        test_event_code: testEventCode
    });
}

/**
 * 5. Evento: SubmitApplication (Proposta enviada / Ficha de financiamento em Fechamento)
 */
export async function trackProposalSubmitted(leadData: MetaLeadData, estimatedValue?: number, testEventCode?: string) {
    return await sendMetaConversion(leadData, 'SubmitApplication', {
        lead_event_source: 'Manos CRM - Proposta Comercial',
        value: estimatedValue || 0,
        currency: 'BRL',
        test_event_code: testEventCode
    });
}

/**
 * 6. Evento: Purchase (Venda concluída / Negócio ganho)
 *
 * Enriquecido com os dados de catálogo (content_type / content_ids / value /
 * currency) SEM tirar nada do user_data — o advanced matching (em, ph, fn, ln,
 * ct, st, external_id, fbp, fbc) continua sendo montado pelo sendMetaConversion
 * a partir do leadData.
 *
 * content_ids = retailer_id do feed. Ordem de resolução:
 *   1. vehicleId explícito (já é o retailer_id);
 *   2. match do vehicle_interest no feed vivo da Altimus;
 *   3. nada → Purchase vai SEM content_ids (nunca com ID inventado).
 *
 * Atenção: veículo vendido sai do feed da Altimus. Se a venda for lançada dias
 * depois, o passo 2 falha — por isso vale passar o vehicleId explícito quando
 * o CRM souber qual carro foi.
 *
 * action_source = 'physical_store': a venda fecha na loja e é lançada aqui no
 * CRM, sem navegador envolvido. A doc da Conversions API exige
 * client_user_agent e event_source_url em evento 'website', e este evento não
 * tem nenhum dos dois — marcá-lo como 'website' seria declarar uma origem que
 * não existe e derrubar a qualidade do sinal. Quem tem contexto de navegador
 * (ViewContent/AddToCart, vindos do site) continua em 'website'.
 */
export async function trackDealWon(
    leadData: MetaLeadData,
    saleValue?: number,
    testEventCode?: string,
    vehicleId?: string | number | null,
    actionSource: string = 'physical_store'
) {
    // Prioriza meta_content_id já salvo no lead ou vehicleId explícito.
    // Fallback para resolvedor por texto vivo no feed apenas quando ambos estiverem vazios.
    const explicitVehicleId = vehicleId || leadData?.meta_content_id || null;

    const resolved = await resolveCatalogVehicle({
        vehicleId: explicitVehicleId,
        vehicleInterest: leadData?.vehicle_interest || leadData?.interesse || null
    });

    const val = Number(saleValue) || resolved?.price || 0;

    const options: MetaConversionOptions = {
        lead_event_source: 'Manos CRM - Venda Concluída',
        action_source: actionSource || 'physical_store',
        value: val,
        currency: 'BRL',
        test_event_code: testEventCode
    };

    // content_type e content_ids andam juntos (ou nenhum dos dois).
    if (resolved) {
        options.content_type = 'product';
        options.content_ids = [resolved.retailerId];
    } else {
        console.warn('[meta-capi] Purchase sem content_ids: retailer_id não determinado ' +
            `(lead=${leadData?.id ?? 'n/a'}, meta_content_id="${leadData?.meta_content_id || ''}", interesse="${leadData?.vehicle_interest || leadData?.interesse || ''}").`);
    }

    return await sendMetaConversion(leadData, 'Purchase', options);
}

/**
 * 7. Evento: DisqualifiedLead (Lead desqualificado ou perdido)
 */
export async function trackLeadDisqualified(leadData: MetaLeadData, reason?: string, testEventCode?: string) {
    return await sendMetaConversion(leadData, 'DisqualifiedLead', {
        lead_event_source: 'Manos CRM - Descarte / Perda',
        lead_quality: 'disqualified',
        reason: reason || 'Lead desqualificado no CRM',
        test_event_code: testEventCode
    });
}

/**
 * Mapeia dinamicamente a mudança de status do CRM para o evento Meta CAPI correto
 */
export async function dispatchMetaConversionForStatusChange(
    leadData: MetaLeadData,
    newStatus: string,
    saleValue?: number,
    motivoPerda?: string,
    testEventCode?: string,
    vehicleId?: string | number | null,
    actionSource?: string
) {
    if (!leadData) return;

    const s = String(newStatus).toLowerCase().trim();

    // Mapeamento dos status (incluindo V1, V2 e CRM26)
    if (['entrada', 'new', 'received', 'aguardando', 'novo'].includes(s)) {
        return await trackLeadCreated(leadData, testEventCode);
    } 
    else if (['triagem', 'contacted', 'attempt', 'em atendimento', 'qualificando', 'qualificado'].includes(s)) {
        return await trackLeadQualified(leadData, testEventCode);
    } 
    else if (['agendamento', 'agendado', 'scheduled'].includes(s)) {
        return await trackAppointmentScheduled(leadData, testEventCode);
    } 
    else if (['visita', 'visitou', 'visited', 'test_drive', 'visita realizada'].includes(s)) {
        return await trackStoreVisit(leadData, testEventCode);
    } 
    else if (['fechamento', 'negociação', 'negociando', 'proposta', 'proposed'].includes(s)) {
        return await trackProposalSubmitted(leadData, saleValue, testEventCode);
    } 
    else if (['vendido', 'closed', 'venda realizada', 'comprado', 'fechado'].includes(s)) {
        return await trackDealWon(leadData, saleValue, testEventCode, vehicleId, actionSource);
    } 
    else if (['perdido', 'lost', 'lost_redistributed', 'descarte', 'desqualificado', 'trash'].includes(s)) {
        return await trackLeadDisqualified(leadData, motivoPerda, testEventCode);
    }
}

/**
 * Re-envia um evento que falhou a partir do registro do log de auditoria
 */
export async function retryFailedConversionLog(logId: string) {
    if (!logId) throw new Error('ID de log é obrigatório');

    // 1. Buscar log anterior
    const { data: log, error } = await supabaseAdmin
        .from('meta_conversions_log')
        .select('*')
        .eq('id', logId)
        .single();

    if (error || !log) {
        throw new Error(`Log ${logId} não encontrado no banco de dados`);
    }

    const payload = log.payload_sent;
    if (!payload || !payload.data || !payload.data[0]) {
        throw new Error('Payload original inválido no log');
    }

    const eventData = payload.data[0];
    const eventName = eventData.event_name;
    const userData = eventData.user_data || {};
    const customData = eventData.custom_data || {};

    const accessToken = getMetaAccessToken();
    const metaUrl = getMetaEventsUrl();

    const response = await fetch(metaUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });

    const statusHttp = response.status;
    const result = await response.json();
    const isSuccess = response.ok && !result.error;

    // Atualizar registro no banco com nova tentativa
    await supabaseAdmin
        .from('meta_conversions_log')
        .update({
            status: isSuccess ? 'SUCCESS' : 'FAILED',
            response_code: statusHttp,
            response_payload: result,
            attempts: (log.attempts || 1) + 1,
            error_message: result.error ? result.error.message : null,
            updated_at: new Date().toISOString()
        })
        .eq('id', logId);

    return { success: isSuccess, statusHttp, result };
}
