import { dataService } from '@/lib/dataService';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId;

    const creds = {
        developerToken: developerToken || '',
        clientId: clientId || '',
        clientSecret: clientSecret || '',
        refreshToken: refreshToken || '',
        customerId: customerId || '',
        loginCustomerId: (loginCustomerId || customerId || '').replace(/-/g, '')
    };

    try {
        if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Configuração do Google Ads incompleta.',
                    details: 'Verifique as variáveis de ambiente no servidor.',
                    missing_vars: {
                        developerToken: !developerToken,
                        clientId: !clientId,
                        clientSecret: !clientSecret,
                        refreshToken: !refreshToken,
                        customerId: !customerId
                    }
                },
                { status: 500 }
            );
        }

        const count = await dataService.syncGoogleCampaigns(creds);

        return NextResponse.json({
            success: true,
            syncedCount: count,
            message: `Sincronização Google concluída: ${count} campanhas encontradas.`
        });

    } catch (error: any) {
        console.error('Google Sync Error:', error.message);

        // Tentativa de listar as contas acessíveis para ajudar o usuário a configurar
        let accessibleCustomers: string[] = [];
        try {
            const { listAccessibleCustomers } = await import('@/lib/google-ads');
            accessibleCustomers = await listAccessibleCustomers(creds);
        } catch (e) {
            console.error('Falha ao listar contas acessíveis no erro:', e);
        }

        return NextResponse.json({
            success: false,
            error: error.message || 'Falha na sincronização com o Google Ads',
            details: error.message,
            accessible_accounts: accessibleCustomers,
            current_config: {
                customerId: customerId,
                loginCustomerId: loginCustomerId
            }
        }, { status: 500 });
    }
}
