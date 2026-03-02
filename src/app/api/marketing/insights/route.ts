import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { date_preset } = await req.json();

        const token = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
        const adAccountId = process.env.META_AD_ACCOUNT_ID || process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID;

        if (!token || !adAccountId) {
            return NextResponse.json(
                { success: false, error: 'Configuração do Meta Ads ausente no servidor.' },
                { status: 500 }
            );
        }

        // date_preset pode ser: today, yesterday, this_week, last_7d, this_month, last_30d, maximum
        const presetQuery = date_preset && date_preset !== 'maximum'
            ? `&date_preset=${date_preset}`
            : '&date_preset=maximum';

        // Get insights at the campaign level with the specific date preset
        const apiUrl = `https://graph.facebook.com/v19.0/act_${adAccountId}/insights?level=campaign&fields=campaign_id,campaign_name,spend,inline_link_clicks,reach,impressions,cpc,ctr,cpm,frequency&limit=150&access_token=${token}${presetQuery}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        if (result.error) throw new Error(result.error.message);

        const metaCampaigns = result.data || [];

        // Format the data to match our DB schema for the frontend
        const campaignsData = metaCampaigns.map((c: any) => {
            return {
                id: c.campaign_id,
                name: c.campaign_name || 'Sem Nome',
                platform: 'Meta Ads',
                status: 'active', // Insights edge doesn't reliably return status, assume active if active in DB or ignore for metrics patching
                total_spend: Number(c.spend || 0),
                link_clicks: Number(c.inline_link_clicks || 0),
                reach: Number(c.reach || 0),
                impressions: Number(c.impressions || 0),
                cpc: Number(c.cpc || 0),
                ctr: Number(c.ctr || 0),
                cpm: Number(c.cpm || 0),
                frequency: Number(c.frequency || 0),
            };
        });

        return NextResponse.json({
            success: true,
            data: campaignsData
        });

    } catch (error: any) {
        console.error('Marketing Insights API Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Falha ao buscar métricas de data',
            details: error.message
        }, { status: 500 });
    }
}
