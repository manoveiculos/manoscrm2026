import { NextResponse } from 'next/server';

export interface GoogleAdsCredentials {
    developerToken: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    customerId: string;
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

        // Specific check for common oauth errors
        if (data.error === 'invalid_grant') {
            throw new Error("Erro Google OAuth: Refresh Token inválido ou expirado. Por favor, gere um novo token.");
        }

        throw new Error(`Erro Google OAuth: ${data.error_description || data.error}`);
    }

    return data.access_token;
}

export async function fetchGoogleAdsCampaigns(creds: GoogleAdsCredentials) {
    const accessToken = await getGoogleAdsAccessToken(creds);
    const customerId = creds.customerId.replace(/-/g, '');

    // GAQL Query to fetch campaign metrics
    const query = `
        SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            metrics.cost_micros,
            metrics.clicks,
            metrics.impressions,
            metrics.ctr,
            metrics.average_cpc,
            metrics.conversions
        FROM campaign
        WHERE campaign.status IN ('ENABLED', 'PAUSED')
    `;

    const response = await fetch(
        `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:search`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'developer-token': creds.developerToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query }),
        }
    );

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error("❌ [GOOGLE ADS API JSON ERROR]:", text);
        throw new Error(`Resposta inválida da API Google Ads: ${text.substring(0, 100)}`);
    }

    if (!response.ok) {
        console.error("❌ [GOOGLE ADS API ERROR]:", JSON.stringify(data, null, 2));

        const googleError = data.error?.details?.[0]?.errors?.[0];
        if (googleError?.errorCode?.authorizationError === 'DEVELOPER_TOKEN_NOT_APPROVED') {
            throw new Error("Erro na API Google Ads: Token de Desenvolvedor não aprovado para contas de produção. Use uma conta de teste ou solicite upgrade para acesso 'Basic'.");
        }

        if (googleError?.errorCode?.authorizationError === 'USER_PERMISSION_DENIED') {
            throw new Error("Erro na API Google Ads: O usuário não tem permissão para acessar esta conta de cliente.");
        }

        throw new Error(`Erro na API Google Ads: ${data.error?.message || JSON.stringify(data.error)}`);
    }

    // Transform GAQL result to our internal format
    return (data.results || []).map((row: any) => {
        const c = row.campaign;
        const m = row.metrics;

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
            reach: 0, // Google Ads doesn't have a direct "reach" metric like Meta, often synonymous with impressions in some report levels
            frequency: 0,
            conversions: Number(m.conversions || 0)
        };
    });
}
