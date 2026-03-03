import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const leadData = await request.json();
        const token = process.env.META_ACCESS_TOKEN;
        const pixelId = "1422926202228119"; // ID do Pixel fornecido no objetivo

        if (!token) {
            console.error("❌ META_ACCESS_TOKEN não configurado nas variáveis de ambiente.");
            return NextResponse.json(
                { success: false, error: 'Token de acesso da Meta não configurado.' },
                { status: 500 }
            );
        }

        if (!leadData || !leadData.data) {
            return NextResponse.json(
                { success: false, error: 'Payload do Lead inválido.' },
                { status: 400 }
            );
        }

        console.log(`🚀 Enviando evento Lead para Meta (Pixel: ${pixelId})...`);

        const response = await fetch(`https://graph.facebook.com/v25.0/${pixelId}/events?access_token=${token}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(leadData),
        });

        const result = await response.json();

        if (response.ok) {
            console.log("✅ Meta API Response:", result);
            return NextResponse.json({ success: true, result });
        } else {
            console.error("❌ Meta API Error:", result);
            return NextResponse.json(
                { success: false, error: 'Erro na API da Meta', details: result },
                { status: response.status }
            );
        }

    } catch (error: any) {
        console.error('💥 Meta CAPI Internal Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro interno no servidor ao processar evento Meta',
            details: error.message
        }, { status: 500 });
    }
}
