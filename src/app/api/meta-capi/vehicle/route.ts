import { NextRequest, NextResponse } from 'next/server';
import { getMetaPixelId, getMetaAccessToken, getMetaApiVersion } from '@/lib/metaConfig';
import {
    trackVehicleViewContent,
    trackVehicleAddToCart,
    trackVehiclePurchase,
    isCatalogEventName,
    CATALOG_EVENTS,
    MetaWebContext,
} from '@/lib/services/metaCatalogEvents';
import { supabaseAdmin, supabaseAdminUsingServiceRole } from '@/lib/supabaseAdmin';

/**
 * POST /api/meta-capi/vehicle
 *
 * Porta de entrada server-side dos 3 eventos de catalogo (ViewContent,
 * AddToCart, Purchase). Quem chama e o site do veiculo
 * (manosveiculos.com.br / pagina de estoque da Altimus), porque a pagina de
 * detalhe do veiculo NAO e renderizada por este projeto — aqui e o CRM.
 *
 * O token da Meta nunca sai daqui: o site manda o contexto, este endpoint
 * assina e fala com a Graph API.
 *
 * Body:
 * {
 *   "event": "ViewContent" | "AddToCart" | "Purchase",
 *   "vehicle_id": "3563862",            // retailer_id (aceita a URL tambem)
 *   "vehicle_interest": "BMW Z4",       // fallback quando nao ha ID
 *   "value": 219900,                    // opcional: cai no preco do feed
 *   "currency": "BRL",
 *   "event_source_url": "https://...",
 *   "event_id": "...",                  // mesmo ID do Pixel do navegador (dedup)
 *   "test_event_code": "TEST12345",     // MODO TESTE
 *   "user_data": {
 *     "email": "...", "phone": "...",
 *     "fbp": "...", "fbc": "...",
 *     "client_ip_address": "...", "client_user_agent": "...",
 *     "external_id": "..."
 *   }
 * }
 */

const DEFAULT_ORIGINS = [
    'https://manosveiculos.com.br',
    'https://www.manosveiculos.com.br',
    'https://manosveiculoscompra.com',
    'https://www.manosveiculoscompra.com',
];

function allowedOrigins(): string[] {
    const fromEnv = (process.env.META_CAPI_ALLOWED_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    return fromEnv.length > 0 ? fromEnv : DEFAULT_ORIGINS;
}

function corsHeaders(req: NextRequest): Record<string, string> {
    const origin = req.headers.get('origin') || '';
    const list = allowedOrigins();
    const h: Record<string, string> = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Meta-Capi-Secret',
        'Access-Control-Max-Age': '86400',
    };
    if (list.includes('*')) {
        h['Access-Control-Allow-Origin'] = '*';
    } else if (origin && list.includes(origin)) {
        h['Access-Control-Allow-Origin'] = origin;
        h['Vary'] = 'Origin';
    }
    return h;
}

/** IP real do visitante: o que o site informou manda; senao lemos dos headers. */
function resolveClientIp(req: NextRequest, informed?: string): string | undefined {
    if (informed) return String(informed).trim();
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
        const first = xff.split(',')[0].trim();
        if (first) return first;
    }
    return req.headers.get('x-real-ip') || undefined;
}

/**
 * User agent do visitante. Se o site chamar server-to-server, o UA do header e
 * o do servidor dele — por isso o informado tem prioridade.
 */
function resolveUserAgent(req: NextRequest, informed?: string): string | undefined {
    if (informed) return String(informed).trim();
    return req.headers.get('user-agent') || undefined;
}

function resolveCookie(req: NextRequest, informed: string | undefined, cookieName: string): string | undefined {
    if (informed) return String(informed).trim();
    return req.cookies.get(cookieName)?.value || undefined;
}

export async function OPTIONS(req: NextRequest) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
    const headers = corsHeaders(req);

    try {
        // FALHA FECHADO. Este endpoint escreve no pixel de anuncios: sem trava,
        // qualquer um que descubra a URL injeta Purchase e estraga a otimizacao
        // das campanhas. Por isso o segredo nao e opcional em producao.
        const secret = process.env.META_CAPI_SITE_SECRET;
        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                console.error('❌ [meta-capi] META_CAPI_SITE_SECRET nao configurada — endpoint recusando tudo.');
                return NextResponse.json(
                    {
                        error: 'Endpoint desabilitado',
                        detail: 'META_CAPI_SITE_SECRET nao esta configurada no servidor. ' +
                            'Defina a variavel na Vercel e envie o mesmo valor no header X-Meta-Capi-Secret.',
                    },
                    { status: 503, headers }
                );
            }
            console.warn('⚠️ [meta-capi] Sem META_CAPI_SITE_SECRET — liberado apenas porque nao e producao.');
        } else if ((req.headers.get('x-meta-capi-secret') || '') !== secret) {
            return NextResponse.json({ error: 'Nao autorizado' }, { status: 401, headers });
        }

        const body = await req.json();
        const eventName = body.event || body.event_name;

        if (!isCatalogEventName(eventName)) {
            return NextResponse.json(
                { error: `event invalido. Use um de: ${CATALOG_EVENTS.join(', ')}` },
                { status: 400, headers }
            );
        }

        const vehicleId = body.vehicle_id ?? body.vehicleId ?? body.retailer_id ?? body.content_id ?? null;
        const vehicleInterest = body.vehicle_interest ?? body.vehicleInterest ?? null;

        if (!vehicleId && !vehicleInterest) {
            return NextResponse.json(
                { error: 'Informe vehicle_id (retailer_id do feed) ou vehicle_interest.' },
                { status: 400, headers }
            );
        }

        const ud = body.user_data || body.userData || {};

        const web: MetaWebContext = {
            client_ip_address: resolveClientIp(req, ud.client_ip_address || ud.ip),
            client_user_agent: resolveUserAgent(req, ud.client_user_agent || ud.user_agent),
            fbp: resolveCookie(req, ud.fbp, '_fbp'),
            fbc: resolveCookie(req, ud.fbc, '_fbc'),
            email: ud.email || ud.em,
            phone: ud.phone || ud.ph || ud.telefone,
            name: ud.name || ud.nome,
            city: ud.city || ud.cidade,
            state: ud.state || ud.estado,
            externalId: ud.external_id || ud.externalId || ud.lead_id,
            fbLeadId: ud.fb_lead_id || ud.fbLeadId,
        };

        const input = {
            vehicleId,
            vehicleInterest,
            value: body.value !== undefined && body.value !== null ? Number(body.value) : null,
            currency: body.currency || 'BRL',
            eventSourceUrl: body.event_source_url || body.eventSourceUrl || req.headers.get('referer') || undefined,
            eventId: body.event_id || body.eventId,
            testEventCode: body.test_event_code || body.testEventCode,
            web,
        };

        const send =
            eventName === 'ViewContent' ? trackVehicleViewContent :
            eventName === 'AddToCart' ? trackVehicleAddToCart :
            trackVehiclePurchase;

        const result = await send(input);

        return NextResponse.json(
            {
                success: result.success,
                event: result.eventName,
                content_ids: result.contentIds,
                value: result.value,
                currency: result.value !== null ? input.currency : null,
                matched_by: result.resolved?.matchedBy || null,
                vehicle: result.resolved?.name || null,
                test_mode: Boolean(input.testEventCode || process.env.META_TEST_EVENT_CODE),
                warning: result.warning,
                event_id: result.eventId,
                error: result.error,
            },
            { status: result.success ? 200 : 502, headers }
        );

    } catch (err: any) {
        console.error('API /api/meta-capi/vehicle error:', err);
        return NextResponse.json(
            { error: err?.message || 'Erro interno ao enviar evento de catalogo' },
            { status: 500, headers }
        );
    }
}

export async function GET(req: NextRequest) {
    // Sonda o log de auditoria: eventos podem estar chegando na Meta enquanto a
    // meta_conversions_log fica vazia (RLS + fallback anon). Melhor ver aqui do
    // que concluir que nada funciona olhando um painel zerado.
    let logAuditoria: Record<string, any>;
    try {
        const { count, error } = await supabaseAdmin
            .from('meta_conversions_log')
            .select('*', { count: 'exact', head: true });
        logAuditoria = error
            ? { legivel: false, erro: error.message, codigo: (error as any).code || null }
            : { legivel: true, linhas: count ?? 0 };
    } catch (e: any) {
        logAuditoria = { legivel: false, erro: e?.message || 'falha ao consultar' };
    }

    return NextResponse.json({
        status: 'online',
        service_role_configurada: supabaseAdminUsingServiceRole,
        log_auditoria: logAuditoria,
        aviso_log: supabaseAdminUsingServiceRole
            ? undefined
            : 'SUPABASE_SERVICE_ROLE_KEY ausente: os eventos vao pra Meta, mas o log de auditoria e rejeitado pela RLS e o painel /admin/meta-conversions fica vazio.',
        endpoint: 'POST /api/meta-capi/vehicle',
        events: CATALOG_EVENTS,
        pixel_id: getMetaPixelId(),
        api_version: getMetaApiVersion(),
        token_configurado: Boolean(getMetaAccessToken()),
        segredo_exigido: true,
        segredo_configurado: Boolean(process.env.META_CAPI_SITE_SECRET),
        test_event_code_global: process.env.META_TEST_EVENT_CODE
            ? 'ATIVO (todos os eventos vao pro modo teste)'
            : 'inativo',
        content_ids: 'retailer_id do feed Altimus (tag <id> do XML) — mesmo ID do catalogo do Facebook',
    }, { headers: corsHeaders(req) });
}
