import { createHash } from 'crypto';
import { getMetaPixelId, getMetaAccessToken, getMetaApiVersion } from '@/lib/metaConfig';
import { supabaseAdmin, supabaseAdminUsingServiceRole } from '@/lib/supabaseAdmin';

/**
 * Normaliza o telefone para o formato E.164 exigido pela Meta:
 * 1. Remove tudo que não for número.
 * 2. Garante o prefixo DDI 55 (Brasil) se não houver DDI.
 */
export function normalizePhone(phone: string): string {
    if (!phone) return "";

    let digits = phone.replace(/\D/g, '');
    if (!digits) return "";

    // Se começar com 0, remove o zero
    if (digits.startsWith('0')) {
        digits = digits.substring(1);
    }

    // Se não tiver 55 e tiver 10 ou 11 dígitos (DDD + Número), adiciona 55
    if (!digits.startsWith('55') || digits.length < 12) {
        digits = '55' + digits;
    }

    return digits;
}

/**
 * Gera hash SHA256 em minúsculo conforme exigência da Meta.
 */
export function hashData(data: string | undefined | null): string {
    if (!data) return "";
    const clean = String(data).toLowerCase().trim();
    if (!clean) return "";
    return createHash('sha256').update(clean).digest('hex');
}

/**
 * Separa nome completo em Primeiro Nome e Sobrenome para Advanced Matching (fn, ln)
 */
export function extractFirstAndLastName(fullName: string): { firstName: string; lastName: string } {
    if (!fullName) return { firstName: '', lastName: '' };
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    return { firstName, lastName };
}

/**
 * Normaliza a sigla do estado para 2 letras minúsculas (ex: SC -> sc)
 */
export function normalizeState(state: string): string {
    if (!state) return '';
    const clean = state.trim().toLowerCase();
    // Se for nome completo, extrai primeira e última ou mapeamentos comuns
    if (clean === 'santa catarina') return 'sc';
    if (clean === 'são paulo' || clean === 'sao paulo') return 'sp';
    if (clean === 'paraná' || clean === 'parana') return 'pr';
    if (clean === 'rio de janeiro') return 'rj';
    if (clean === 'rio grande do sul') return 'rs';
    if (clean.length === 2) return clean;
    return clean.slice(0, 2);
}

export interface MetaLeadData {
    id?: string | number;
    lead_id?: string | number;       // Meta Lead Ads ID (fb_lead_id / leadgen_id)
    fb_lead_id?: string | number;    // Alias para lead_id da Meta
    name?: string;
    nome?: string;
    phone?: string;
    telefone?: string;
    whatsapp?: string;
    email?: string;
    city?: string;
    cidade?: string;
    state?: string;
    estado?: string;
    uf?: string;
    country?: string;
    vehicle_interest?: string;
    interesse?: string;
    source?: string;
    origem?: string;
    fbp?: string;
    fbc?: string;
    client_ip_address?: string;
    client_user_agent?: string;
}

export interface MetaConversionOptions {
    lead_event_source?: string;
    event_id?: string;
    value?: number;
    currency?: string;
    test_event_code?: string;
    lead_quality?: string;
    reason?: string;
    /**
     * 'website' para eventos originados na navegacao do cliente (ViewContent,
     * AddToCart, Purchase do site). Default 'system_generated' para os eventos
     * de funil disparados pelo proprio CRM.
     */
    action_source?: string;
    /** URL da pagina que originou o evento (obrigatorio de fato quando action_source = 'website'). */
    event_source_url?: string;
    /** 'product' para casar com o catalogo de veiculos. */
    content_type?: string;
    /**
     * IDs do catalogo. REGRA DE OURO: tem que ser o retailer_id do feed
     * (o <id> do XML da Altimus). Nunca um ID interno do CRM.
     */
    content_ids?: Array<string | number> | string | number;
    [key: string]: any;
}

/** Chaves que sao controle de evento e NAO devem vazar pra dentro de custom_data. */
const RESERVED_OPTION_KEYS = [
    'lead_event_source', 'event_id', 'value', 'currency', 'test_event_code',
    'lead_quality', 'reason', 'action_source', 'event_source_url',
    'content_type', 'content_ids',
];

/** Normaliza content_ids para array de string (formato que a Meta casa com o feed). */
function normalizeContentIds(raw: MetaConversionOptions['content_ids']): string[] | null {
    if (raw === undefined || raw === null) return null;
    const arr = Array.isArray(raw) ? raw : [raw];
    const out = arr
        .map(v => (v === undefined || v === null ? '' : String(v).trim()))
        .filter(Boolean);
    return out.length > 0 ? out : null;
}

/**
 * Envia um evento de conversão para a Meta (Conversions API Graph API v26.0).
 * @param leadData Dados do lead (nome, telefone, email, lead_id, etc)
 * @param eventName Nome do evento (ex: 'Lead', 'QualifiedLead', 'Schedule', 'InPersonMeeting', 'SubmitApplication', 'Purchase', 'DisqualifiedLead')
 * @param extraOptions Opções customizadas (valor, moeda, event_id, test_event_code, etc)
 */
export async function sendMetaConversion(
    leadData: MetaLeadData,
    eventName: string = 'Lead',
    extraOptions?: MetaConversionOptions
) {
    const pixelId = getMetaPixelId();
    const accessToken = getMetaAccessToken();
    const apiVersion = getMetaApiVersion();

    if (!pixelId || !accessToken) {
        console.error('❌ Erro Meta: META_PIXEL_ID ou META_ACCESS_TOKEN não configurados no .env.local');
        return { success: false, error: 'Credenciais ausentes no .env.local' };
    }

    const leadIdStr = leadData.id ? String(leadData.id) : undefined;
    const rawFbLeadId = leadData.lead_id || leadData.fb_lead_id;
    const fbLeadIdNum = rawFbLeadId ? (Number(rawFbLeadId) || String(rawFbLeadId)) : undefined;

    // Advanced Matching Parameters
    const rawPhone = leadData.phone || leadData.telefone || leadData.whatsapp;
    const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : "";
    const hashedPhone = normalizedPhone ? hashData(normalizedPhone) : null;
    
    const rawEmail = leadData.email;
    const hashedEmail = rawEmail ? hashData(rawEmail) : null;

    const rawName = leadData.name || leadData.nome || "";
    const { firstName, lastName } = extractFirstAndLastName(rawName);
    const hashedFn = firstName ? hashData(firstName) : null;
    const hashedLn = lastName ? hashData(lastName) : null;

    const rawCity = leadData.city || leadData.cidade || "";
    const hashedCity = rawCity ? hashData(rawCity.replace(/\s+/g, '')) : null;

    const rawState = leadData.state || leadData.estado || leadData.uf || "";
    const normalizedSt = rawState ? normalizeState(rawState) : "";
    const hashedSt = normalizedSt ? hashData(normalizedSt) : null;

    const countryCode = (leadData.country || "br").toLowerCase();
    const hashedCountry = hashData(countryCode);

    const hashedExternalId = leadIdStr ? hashData(leadIdStr) : null;

    // User Data Object
    const userData: Record<string, any> = {};

    if (hashedPhone) userData.ph = [hashedPhone];
    if (hashedEmail) userData.em = [hashedEmail];
    if (hashedFn) userData.fn = [hashedFn];
    if (hashedLn) userData.ln = [hashedLn];
    if (hashedCity) userData.ct = [hashedCity];
    if (hashedSt) userData.st = [hashedSt];
    if (hashedCountry) userData.country = [hashedCountry];
    if (hashedExternalId) userData.external_id = [hashedExternalId];

    // Meta Lead Ads ID (Atribuição de 100% se proveniente de Instant Forms)
    if (fbLeadIdNum) {
        userData.lead_id = fbLeadIdNum;
    }

    // Web tracking cookies se presentes
    if (leadData.fbp) userData.fbp = leadData.fbp;
    if (leadData.fbc) userData.fbc = leadData.fbc;
    if (leadData.client_ip_address) userData.client_ip_address = leadData.client_ip_address;
    if (leadData.client_user_agent) userData.client_user_agent = leadData.client_user_agent;

    // Gerador determinístico de event_id para deduplicação com Pixel Web
    const nowSec = Math.floor(Date.now() / 1000);
    const eventId = extraOptions?.event_id || (leadIdStr ? `lead_${leadIdStr}_${eventName}_${nowSec}` : `evt_${nowSec}_${Math.random().toString(36).substring(2, 7)}`);

    // Custom Data Payload
    const customData: Record<string, any> = {
        event_source: "crm",
        lead_event_source: extraOptions?.lead_event_source || "Manos CRM",
        vehicle_interest: leadData.vehicle_interest || leadData.interesse,
        source: leadData.source || leadData.origem,
    };

    if (extraOptions?.value !== undefined && extraOptions.value !== null) {
        customData.value = Number(extraOptions.value) || 0;
        customData.currency = extraOptions.currency || "BRL";
    }

    // Dados de catalogo (ViewContent / AddToCart / Purchase de veiculo)
    const contentIds = normalizeContentIds(extraOptions?.content_ids);
    if (contentIds) {
        customData.content_ids = contentIds;
        customData.content_type = extraOptions?.content_type || 'product';
    } else if (extraOptions?.content_type) {
        customData.content_type = extraOptions.content_type;
    }

    if (extraOptions?.lead_quality) customData.lead_quality = extraOptions.lead_quality;
    if (extraOptions?.reason) customData.reason = extraOptions.reason;

    // Mesclar outras opções customizadas se fornecidas
    if (extraOptions) {
        Object.keys(extraOptions).forEach(key => {
            if (!RESERVED_OPTION_KEYS.includes(key)) {
                customData[key] = extraOptions[key];
            }
        });
    }

    const actionSource = extraOptions?.action_source || "system_generated";

    // A Meta exige client_user_agent quando action_source = 'website'. Sem ele o
    // evento entra, mas a qualidade do match despenca — melhor gritar no log.
    if (actionSource === 'website' && !userData.client_user_agent) {
        console.warn(`[meta-capi] ${eventName} com action_source='website' sem client_user_agent — match de identidade vai ficar fraco.`);
    }

    const eventPayload: Record<string, any> = {
        event_name: eventName,
        event_time: nowSec,
        action_source: actionSource,
        event_id: eventId,
        user_data: userData,
        custom_data: customData
    };

    if (extraOptions?.event_source_url) {
        eventPayload.event_source_url = extraOptions.event_source_url;
    }

    const payload: Record<string, any> = { data: [eventPayload] };

    // Suporte a test_event_code da aba "Testar Eventos" no Meta Events Manager
    const testCode = extraOptions?.test_event_code || process.env.META_TEST_EVENT_CODE;
    if (testCode) {
        payload.test_event_code = testCode;
    }

    const metaUrl = `https://graph.facebook.com/${apiVersion}/${pixelId}/events`;

    try {
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
        const errorMessage = result.error ? (result.error.message || JSON.stringify(result.error)) : null;

        // Registrar Log de Auditoria no Supabase Assincronamente
        logMetaConversionAudit({
            lead_id: leadIdStr,
            fb_lead_id: fbLeadIdNum ? String(fbLeadIdNum) : undefined,
            event_name: eventName,
            event_id: eventId,
            status: isSuccess ? 'SUCCESS' : 'FAILED',
            response_code: statusHttp,
            response_payload: result,
            payload_sent: payload,
            error_message: errorMessage
        }).catch(err => console.warn('⚠️ Non-blocking audit log insert warning:', err));

        if (!isSuccess) {
            console.error(`❌ Erro Meta Conversions API [${eventName}] (${statusHttp}):`, errorMessage);
            return { success: false, statusHttp, error: errorMessage, result };
        } else {
            console.log(`✅ Evento [${eventName}] enviado com sucesso para Meta (v26.0) | Lead ID: ${leadIdStr || 'N/A'} | Event ID: ${eventId}`);
            return { success: true, statusHttp, eventId, result };
        }
    } catch (error: any) {
        const errMsg = error.message || 'Falha de rede/desconhecida ao contactar a Meta Graph API';
        console.error(`❌ Falha na chamada da Meta Conversions API [${eventName}]:`, error);

        // Registrar falha de rede no log de auditoria
        logMetaConversionAudit({
            lead_id: leadIdStr,
            fb_lead_id: fbLeadIdNum ? String(fbLeadIdNum) : undefined,
            event_name: eventName,
            event_id: eventId,
            status: 'FAILED',
            response_code: 500,
            payload_sent: payload,
            error_message: errMsg
        }).catch(() => {});

        return { success: false, error: errMsg };
    }
}

/**
 * Função interna para gravar log de auditoria na tabela public.meta_conversions_log
 */
async function logMetaConversionAudit(data: {
    lead_id?: string;
    fb_lead_id?: string;
    event_name: string;
    event_id: string;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    response_code?: number;
    response_payload?: any;
    payload_sent: any;
    error_message?: string | null;
}) {
    if (typeof window !== 'undefined') return;
    try {
        // ATENCAO: o supabase-js NAO lanca excecao quando a RLS rejeita — ele
        // devolve { error }. Antes isso nao era lido e o log morria em silencio:
        // eventos chegavam na Meta e a meta_conversions_log ficava vazia, o que
        // cega o painel /admin/meta-conversions. Agora o erro e conferido.
        const { error } = await supabaseAdmin.from('meta_conversions_log').insert([{
            lead_id: data.lead_id || null,
            fb_lead_id: data.fb_lead_id || null,
            event_name: data.event_name,
            event_id: data.event_id,
            status: data.status,
            response_code: data.response_code || null,
            response_payload: data.response_payload || null,
            payload_sent: data.payload_sent,
            error_message: data.error_message || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }]);

        if (error) {
            const code = (error as any).code || '';
            const msg = error.message || String(error);

            // 42501 = insufficient_privilege (RLS). A tabela so tem policy de
            // INSERT pra service_role — cair na chave anon derruba todo log.
            const pareceRls = code === '42501' || /row-level security|permission denied/i.test(msg);

            if (pareceRls && !supabaseAdminUsingServiceRole) {
                console.error(
                    `❌ [meta-capi] Log de auditoria BLOQUEADO pela RLS em meta_conversions_log ` +
                    `(evento ${data.event_name}). O supabaseAdmin nao esta usando a service role key: ` +
                    `defina SUPABASE_SERVICE_ROLE_KEY no ambiente. O evento FOI enviado pra Meta, ` +
                    `mas o painel /admin/meta-conversions vai continuar vazio.`
                );
            } else if (code === '42P01') {
                console.error(`❌ [meta-capi] Tabela meta_conversions_log nao existe — migration nao rodou.`);
            } else {
                console.error(`❌ [meta-capi] Falha ao gravar log de auditoria (${data.event_name}) [${code}]: ${msg}`);
            }
        }
    } catch (err: any) {
        // Nunca deixa o log derrubar o envio do evento.
        console.error(`❌ [meta-capi] Excecao ao gravar log de auditoria (${data.event_name}):`, err?.message || err);
    }
}
