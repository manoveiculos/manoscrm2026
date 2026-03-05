import { dataService } from '@/lib/dataService';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
        const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

        if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
            return NextResponse.json(
                { success: false, error: 'Configuração do Google Ads ausente no servidor (Tokens ou ID da Conta).' },
                { status: 500 }
            );
        }

        const creds = {
            developerToken,
            clientId,
            clientSecret,
            refreshToken,
            customerId
        };


        const count = await dataService.syncGoogleCampaigns(creds);

        return NextResponse.json({
            success: true,
            syncedCount: count,
            message: `Sincronização Google concluída: ${count} campanhas encontradas.`
        });

    } catch (error: any) {
        console.error('Google Sync Error:', error.message);
        return NextResponse.json({
            success: false,
            error: 'Falha na sincronização com o Google Ads',
            details: error.message,
            stack: error.stack,
            fullError: error
        }, { status: 500 });
    }
}
