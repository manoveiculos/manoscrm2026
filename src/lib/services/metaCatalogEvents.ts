/**
 * metaCatalogEvents — os 3 eventos de catalogo da Conversions API:
 *   ViewContent  → abriu a pagina de detalhe do veiculo
 *   AddToCart    → clicou em "Tenho interesse" / WhatsApp / contato naquele veiculo
 *   Purchase     → venda fechada daquele veiculo
 *
 * Todos saem com action_source: 'website', event_time atual e
 * custom_data = { content_type: 'product', content_ids: [retailer_id], value, currency }.
 *
 * content_ids vem SEMPRE do metaCatalog (retailer_id do feed). Quando nao da pra
 * provar o retailer_id, o evento sai sem content_ids em vez de sair com ID errado.
 */

import { sendMetaConversion, MetaLeadData } from '@/lib/meta-service';
import { resolveCatalogVehicle, ResolvedCatalogVehicle } from '@/lib/services/metaCatalog';

/** Contexto de navegacao — quanto mais preenchido, melhor o match de identidade. */
export interface MetaWebContext {
    client_ip_address?: string;
    client_user_agent?: string;
    fbp?: string;                 // cookie _fbp
    fbc?: string;                 // cookie _fbc
    email?: string;               // vira em (SHA256) dentro do meta-service
    phone?: string;               // vira ph (SHA256) dentro do meta-service
    name?: string;
    city?: string;
    state?: string;
    /** ID interno do lead/cliente — vira external_id hasheado. */
    externalId?: string | number;
    /** ID de lead do Meta Lead Ads, quando houver. */
    fbLeadId?: string | number;
}

export interface CatalogEventInput {
    /** retailer_id do veiculo (ou a URL da pagina — o resolver extrai o ID). */
    vehicleId?: string | number | null;
    /** Alternativa quando nao ha ID: texto livre pra match no feed. */
    vehicleInterest?: string | null;
    /** Preco. Se omitido, usa o preco do feed. */
    value?: number | null;
    currency?: string;
    /** URL da pagina do veiculo. */
    eventSourceUrl?: string;
    /** Passe o mesmo event_id do Pixel do navegador pra deduplicar. */
    eventId?: string;
    /** Modo teste: aparece na aba "Testar eventos" do Gerenciador de Eventos. */
    testEventCode?: string;
    web?: MetaWebContext;
}

const EVENT_LABELS: Record<string, string> = {
    ViewContent: 'Site - Pagina do Veiculo',
    AddToCart: 'Site - Tenho Interesse / WhatsApp',
    Purchase: 'Manos CRM - Venda Concluida',
};

function buildLeadData(web?: MetaWebContext): MetaLeadData {
    const w = web || {};
    return {
        id: w.externalId,
        fb_lead_id: w.fbLeadId,
        name: w.name,
        email: w.email,
        phone: w.phone,
        city: w.city,
        state: w.state,
        fbp: w.fbp,
        fbc: w.fbc,
        client_ip_address: w.client_ip_address,
        client_user_agent: w.client_user_agent,
    };
}

export interface CatalogEventResult {
    success: boolean;
    eventName: string;
    /** O que foi enviado em content_ids (null = nao foi possivel provar o retailer_id). */
    contentIds: string[] | null;
    resolved: ResolvedCatalogVehicle | null;
    value: number | null;
    warning?: string;
    eventId?: string;
    error?: string;
    result?: any;
    statusHttp?: number;
}

/** Nucleo compartilhado pelos 3 eventos. */
async function sendCatalogEvent(eventName: 'ViewContent' | 'AddToCart' | 'Purchase', input: CatalogEventInput): Promise<CatalogEventResult> {
    const resolved = await resolveCatalogVehicle({
        vehicleId: input.vehicleId,
        vehicleInterest: input.vehicleInterest,
    });

    // Preco: o que o caller mandou manda; senao cai no preco do feed.
    const rawValue = input.value !== undefined && input.value !== null ? Number(input.value) : resolved?.price ?? null;
    const value = rawValue !== null && Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null;

    let warning: string | undefined;
    if (!resolved) {
        warning = `${eventName} enviado SEM content_ids: nao foi possivel determinar o retailer_id ` +
            `(vehicleId=${input.vehicleId ?? 'n/a'}, interesse=${input.vehicleInterest ?? 'n/a'}). ` +
            `Evento vale pro pixel, mas nao casa com o catalogo.`;
        console.warn(`[meta-capi] ${warning}`);
    } else if (!resolved.inLiveFeed) {
        warning = `retailer_id ${resolved.retailerId} nao esta no feed atual da Altimus ` +
            `(normal se o veiculo ja foi vendido). Enviado do mesmo jeito.`;
    }
    if (value === null) {
        console.warn(`[meta-capi] ${eventName} sem value (retailer_id=${resolved?.retailerId ?? 'n/a'}).`);
    }

    const options: Record<string, any> = {
        action_source: 'website',
        lead_event_source: EVENT_LABELS[eventName],
        event_source_url: input.eventSourceUrl,
        event_id: input.eventId,
        test_event_code: input.testEventCode,
    };

    // content_type sem content_ids gera aviso no diagnostico da Meta — os dois
    // andam juntos ou nenhum vai.
    //
    // Alem de content_ids mandamos `contents`, que a doc da Meta descreve como a
    // forma detalhada (id + quantity + item_price). Carro e sempre quantity 1.
    // Os dois convivem: content_ids e o que casa com o retailer_id do feed,
    // contents carrega o preco unitario do item.
    if (resolved) {
        options.content_type = 'product';
        options.content_ids = [resolved.retailerId];

        const item: Record<string, any> = { id: resolved.retailerId, quantity: 1 };
        if (value !== null) item.item_price = value;
        options.contents = [item];
    }
    if (value !== null) {
        options.value = value;
        options.currency = input.currency || 'BRL';
    }

    const res: any = await sendMetaConversion(buildLeadData(input.web), eventName, options);

    return {
        success: Boolean(res?.success),
        eventName,
        contentIds: resolved ? [resolved.retailerId] : null,
        resolved,
        value,
        warning,
        eventId: res?.eventId,
        error: res?.error,
        result: res?.result,
        statusHttp: res?.statusHttp,
    };
}

/** 1) ViewContent — abriu a pagina de detalhe do veiculo. */
export async function trackVehicleViewContent(input: CatalogEventInput) {
    return sendCatalogEvent('ViewContent', input);
}

/** 2) AddToCart — clicou em "Tenho interesse" / WhatsApp / contato no veiculo. */
export async function trackVehicleAddToCart(input: CatalogEventInput) {
    return sendCatalogEvent('AddToCart', input);
}

/** 3) Purchase — venda do veiculo fechada. */
export async function trackVehiclePurchase(input: CatalogEventInput) {
    return sendCatalogEvent('Purchase', input);
}

export const CATALOG_EVENTS = ['ViewContent', 'AddToCart', 'Purchase'] as const;
export type CatalogEventName = typeof CATALOG_EVENTS[number];

export function isCatalogEventName(v: any): v is CatalogEventName {
    return CATALOG_EVENTS.includes(v);
}
