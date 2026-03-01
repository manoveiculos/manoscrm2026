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

        const apiUrl = `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?limit=150&fields=name,status,effective_status,objective,insights{spend,inline_link_clicks,reach,impressions,cpc,ctr,cpm,frequency}&access_token=${token}${presetQuery}`;

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
            const insights = c.insights?.data?.[0] || {};
            // Prioriza o status master para nao esconder campanhas pausasadas indiretamente
            const status = (c.status || c.effective_status || '').toLowerCase();

            return {
                id: c.id,
                name: c.name || 'Sem Nome',
                platform: 'Meta Ads',
                status: status === 'active' ? 'active' : 'paused',
                total_spend: Number(insights.spend || 0),
                link_clicks: Number(insights.inline_link_clicks || 0),
                reach: Number(insights.reach || 0),
                impressions: Number(insights.impressions || 0),
                cpc: Number(insights.cpc || 0),
                ctr: Number(insights.ctr || 0),
                cpm: Number(insights.cpm || 0),
                frequency: Number(insights.frequency || 0),
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
