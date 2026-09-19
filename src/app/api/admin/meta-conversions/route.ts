import { NextRequest, NextResponse } from 'next/server';
import { getMetaPixelId, getMetaAccessToken } from '@/lib/metaConfig';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendMetaConversion } from '@/lib/meta-service';
import {
    trackVehicleViewContent,
    trackVehicleAddToCart,
    trackVehiclePurchase,
    isCatalogEventName,
    CATALOG_EVENTS,
} from '@/lib/services/metaCatalogEvents';
import { getInventory } from '@/lib/services/altimusInventory';
import { retryFailedConversionLog } from '@/lib/services/metaConversionService';

export async function GET(req: NextRequest) {
    try {
        const pixelId = getMetaPixelId();
        const accessTokenConfigured = Boolean(getMetaAccessToken());
        const apiVersion = process.env.META_API_VERSION || 'v26.0';

        // Buscar logs mais recentes
        const { data: logs, error: logsError } = await supabaseAdmin
            .from('meta_conversions_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (logsError && logsError.code !== '42P01') {
            console.error('Error fetching meta conversion logs:', logsError);
        }

        const logList = logs || [];

        // Calcular estatísticas
        const total = logList.length;
        const successCount = logList.filter(l => l.status === 'SUCCESS').length;
        const failedCount = logList.filter(l => l.status === 'FAILED').length;
        const successRate = total > 0 ? Math.round((successCount / total) * 100) : 100;

        // Agrupamento por tipo de evento
        const eventsByType: Record<string, number> = {};
        logList.forEach(l => {
            eventsByType[l.event_name] = (eventsByType[l.event_name] || 0) + 1;
        });

        return NextResponse.json({
            status: {
                configured: Boolean(pixelId && accessTokenConfigured),
                pixelId,
                apiVersion,
                hasAccessToken: accessTokenConfigured
            },
            stats: {
                total,
                successCount,
                failedCount,
                successRate,
                eventsByType
            },
            logs: logList
        });
    } catch (err: any) {
        console.error('API /api/admin/meta-conversions GET error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao carregar estatísticas Meta CAPI' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, logId, eventName, testEventCode, leadData, vehicleId, vehicleInterest, value } = body;

        // MODO TESTE DOS EVENTOS DE CATÁLOGO (ViewContent / AddToCart / Purchase).
        // Dispara com test_event_code pra validar na aba "Testar eventos" do
        // Gerenciador de Eventos antes de ligar em produção.
        // Sem vehicleId, pega o 1º veículo do feed vivo — content_ids sai com um
        // retailer_id REAL, que é o único jeito de o teste provar algo.
        if (action === 'test-catalog') {
            if (!isCatalogEventName(eventName)) {
                return NextResponse.json(
                    { error: `eventName inválido. Use um de: ${CATALOG_EVENTS.join(', ')}` },
                    { status: 400 }
                );
            }

            let targetId = vehicleId || null;
            let amostraFeed: string | null = null;
            if (!targetId && !vehicleInterest) {
                const inv = await getInventory();
                const primeiro = inv.find(v => v.id_externo);
                if (!primeiro) {
                    return NextResponse.json(
                        { error: 'Feed da Altimus vazio/fora do ar: informe vehicleId (retailer_id) manualmente.' },
                        { status: 424 }
                    );
                }
                targetId = primeiro.id_externo!;
                amostraFeed = `${primeiro.marca} ${primeiro.modelo}`.trim();
            }

            const send =
                eventName === 'ViewContent' ? trackVehicleViewContent :
                eventName === 'AddToCart' ? trackVehicleAddToCart :
                trackVehiclePurchase;

            const r = await send({
                vehicleId: targetId,
                vehicleInterest: vehicleInterest || null,
                value: value !== undefined && value !== null ? Number(value) : null,
                currency: 'BRL',
                eventSourceUrl: body.eventSourceUrl || 'https://manosveiculos.com.br/estoque',
                testEventCode: testEventCode || process.env.META_TEST_EVENT_CODE,
                web: {
                    client_user_agent: body.clientUserAgent ||
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    client_ip_address: body.clientIpAddress || '177.20.0.1',
                    email: body.email || 'lead.teste@manoscrm.com.br',
                    phone: body.phone || '5547999999999',
                    externalId: body.externalId || `test_${Date.now()}`,
                },
            });

            return NextResponse.json({
                ...r,
                test_event_code_usado: testEventCode || process.env.META_TEST_EVENT_CODE || null,
                veiculo_do_feed: amostraFeed,
                lembrete: 'Sem test_event_code o evento entra como produção.',
            });
        }

        if (action === 'retry' && logId) {
            const result = await retryFailedConversionLog(logId);
            return NextResponse.json(result);
        }

        if (action === 'test') {
            const testLead = leadData || {
                id: `test_lead_${Date.now()}`,
                name: 'Lead Teste Meta CAPI',
                phone: '5547999999999',
                email: 'lead.teste@manoscrm.com.br',
                city: 'Balneário Camboriú',
                state: 'SC',
                vehicle_interest: 'BMW X6'
            };

            const targetEvent = eventName || 'Lead';
            const result = await sendMetaConversion(testLead, targetEvent, {
                lead_event_source: 'Manos CRM - Diagnostic Test',
                test_event_code: testEventCode || process.env.META_TEST_EVENT_CODE
            });

            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Ação inválida ou parâmetros ausentes' }, { status: 400 });

    } catch (err: any) {
        console.error('API /api/admin/meta-conversions POST error:', err);
        return NextResponse.json({ error: err.message || 'Erro na ação administrativa' }, { status: 500 });
    }
}
