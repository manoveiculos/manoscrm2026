import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendMetaConversion } from '@/lib/meta-service';
import { retryFailedConversionLog } from '@/lib/services/metaConversionService';

export async function GET(req: NextRequest) {
    try {
        const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '995826668986455';
        const accessTokenConfigured = Boolean(process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN);
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
        const { action, logId, eventName, testEventCode, leadData } = body;

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
