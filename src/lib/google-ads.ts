import { NextResponse } from 'next/server';

export interface GoogleAdsCredentials {
    developerToken: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    customerId: string;
    loginCustomerId?: string;
}

export async function getGoogleAdsAccessToken(creds: GoogleAdsCredentials): Promise<string> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: creds.refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error("❌ [GOOGLE OAUTH JSON ERROR]:", text);
        throw new Error(`Resposta inválida do Google OAuth: ${text.substring(0, 100)}`);
    }

    if (!response.ok) {
        console.error("❌ [GOOGLE OAUTH ERROR]:", JSON.stringify(data, null, 2));

        if (data.error === 'invalid_grant') {
            throw new Error("Erro Google OAuth: Refresh Token inválido ou expirado. Por favor, gere um novo token.");
        }

        throw new Error(`Erro Google OAuth: ${data.error_description || data.error}`);
    }

    return data.access_token;
}

export async function listAccessibleCustomers(creds: GoogleAdsCredentials): Promise<string[]> {
    const accessToken = await getGoogleAdsAccessToken(creds);
    const response = await fetch(
        'https://googleads.googleapis.com/v19/customers:listAccessibleCustomers',
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'developer-token': creds.developerToken,
            },
        }
    );

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Erro ao listar contas acessíveis: ${text}`);
    }

    const data = JSON.parse(text);
    return data.resourceNames || [];
}

export async function fetchGoogleAdsCampaigns(creds: GoogleAdsCredentials) {
    const accessToken = await getGoogleAdsAccessToken(creds);
    const customerId = creds.customerId.replace(/-/g, '');
    const loginId = (creds.loginCustomerId || customerId).replace(/-/g, '');

    // PRE-FLIGHT TEST: Verificar se a API base está respondendo e quais contas o token vê
    try {
        const accessible = await listAccessibleCustomers(creds);
        if (!accessible.some(acc => acc.includes(loginId) || acc.includes(customerId))) {
            throw new Error(`Token não enxerga os IDs configurados (${loginId} ou ${customerId}). Contas visíveis: ${accessible.join(', ') || 'nenhuma'}.`);
        }
    } catch (e: any) {
        throw new Error(`O Google Ads recusou a conexão básica. Motivo técnico: ${e.message}. Verifique se a 'Google Ads API' está 100% ativada no Google Cloud e se o Token de Desenvolvedor está aprovado para "Acesso Básico".`);
    }

    // Query simplificada e em uma única linha para evitar problemas de formatação
    const query = "SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr, metrics.average_cpc, metrics.conversions FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED')";

    const makeRequest = async (useLoginId: boolean) => {
        const headers: any = {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': creds.developerToken,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        if (useLoginId) {
            headers['login-customer-id'] = loginId;
        }

        return fetch(
            `https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:search`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ query }),
            }
        );
    };

    // Tenta com login-customer-id primeiro
    let response = await makeRequest(true);
    let text = await response.text();

    if (!response.ok) {
        // Tenta sem login-customer-id como fallback
        response = await makeRequest(false);
        text = await response.text();
    }

    if (!response.ok) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            const accessible = await listAccessibleCustomers(creds).catch(() => []);
            throw new Error(`Erro Crítico Google (HTTP ${response.status}). Suas contas acessíveis: ${accessible.join(', ') || 'Nenhuma detectada'}. Verifique se o ID ${customerId} está ativo e vinculado.`);
        }

        const details = data.error?.details?.[0]?.errors?.[0] || data.error;
        const msg = data.error?.message || JSON.stringify(details);

        // Mapeamento de erros comuns para mensagens amigáveis
        if (msg.includes('DEVELOPER_TOKEN_NOT_APPROVED')) {
            throw new Error("Google Ads: Token de desenvolvedor ainda em revisão ou não aprovado para produção.");
        }
        if (msg.includes('NOT_ADS_USER')) {
            throw new Error("Google Ads: O usuário do token não tem acesso à conta de anúncios configurada.");
        }
        if (msg.includes('Internal error encountered')) {
            const debugPayload = `[useLoginId: true/false trial] | loginId=${loginId} | customerId=${customerId} | msg=${msg} | rawError=${text.substring(0, 300)}`;
            throw new Error(`Google Ads Erro Interno (500) DETALHADO: ${debugPayload}`);
        }

        throw new Error(`Google Ads API: ${msg}`);
    }

    const data = JSON.parse(text);
    const results = data.results || [];

    return results.map((row: any) => {
        const c = row.campaign;
        const m = row.metrics || {};

        return {
            id: c.id,
            name: c.name,
            platform: 'Google Ads',
            status: c.status === 'ENABLED' ? 'active' : 'paused',
            total_spend: Number(m.costMicros || 0) / 1_000_000,
            link_clicks: Number(m.clicks || 0),
            impressions: Number(m.impressions || 0),
            ctr: (Number(m.ctr || 0) * 100),
            cpc: Number(m.averageCpc || 0) / 1_000_000,
            reach: 0,
            frequency: 0,
            conversions: Number(m.conversions || 0)
        };
    });
}
