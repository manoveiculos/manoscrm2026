import { NextRequest, NextResponse } from 'next/server';
import { sendMetaConversion } from '@/lib/meta-service';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { eventName, userData, customData, testEventCode } = body;

        if (!eventName || !userData) {
            return NextResponse.json({ error: 'eventName e userData são obrigatórios' }, { status: 400 });
        }

        const result = await sendMetaConversion(
            {
                id: userData.externalId || userData.id,
                lead_id: userData.lead_id || userData.fb_lead_id,
                name: userData.name || userData.nome,
                phone: userData.phone || userData.telefone,
                email: userData.email,
                city: userData.city || userData.cidade,
                state: userData.state || userData.estado,
                vehicle_interest: userData.vehicle_interest || customData?.vehicle_interest,
                source: userData.source || customData?.source,
                fbp: userData.fbp,
                fbc: userData.fbc
            },
            eventName,
            {
                ...customData,
                test_event_code: testEventCode
            }
        );

        if (!result.success) {
            return NextResponse.json({ error: result.error, result: result.result }, { status: 400 });
        }

        return NextResponse.json({ success: true, eventId: result.eventId, fb_result: result.result });

    } catch (err: any) {
        console.error('API /api/meta-capi error:', err);
        return NextResponse.json({ error: err.message || 'Erro interno ao processar conversão Meta' }, { status: 500 });
    }
}
