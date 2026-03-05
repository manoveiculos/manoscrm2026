import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { date_preset } = await req.json();

        // 1. Fetch Meta Ads Insights
        const metaToken = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
        const metaAdAccountId = process.env.META_AD_ACCOUNT_ID || process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID;

        let metaCampaignsData: any[] = [];
        if (metaToken && metaAdAccountId) {
            const presetQuery = date_preset && date_preset !== 'maximum'
                ? `&date_preset=${date_preset}`
                : '&date_preset=maximum';

            const apiUrl = `https://graph.facebook.com/v19.0/act_${metaAdAccountId}/insights?level=campaign&fields=campaign_id,campaign_name,spend,inline_link_clicks,reach,impressions,cpc,ctr,cpm,frequency&limit=150&access_token=${metaToken}${presetQuery}`;

            try {
                const response = await fetch(apiUrl);
                if (response.ok) {
                    const result = await response.json();
                    const metaCampaigns = result.data || [];
                    metaCampaignsData = metaCampaigns.map((c: any) => ({
                        id: c.campaign_id,
                        name: c.campaign_name || 'Sem Nome',
                        platform: 'Meta Ads',
                        status: 'active',
                        total_spend: Number(c.spend || 0),
                        link_clicks: Number(c.inline_link_clicks || 0),
                        reach: Number(c.reach || 0),
                        impressions: Number(c.impressions || 0),
                        cpc: Number(c.cpc || 0),
                        ctr: Number(c.ctr || 0),
                        cpm: Number(c.cpm || 0),
                        frequency: Number(c.frequency || 0),
                    }));
                }
            } catch (e) {
                console.error("Meta Insights Fetch Error:", e);
            }
        }

        // 2. Fetch Google Ads Insights (via Supabase or directly? Better from DB for performance or direct if specific preset needed)
        // Since we have a sync button, we mostly pull from DB, but this route is for "live" filtering by date_preset.
        // Google Ads API doesn't have a simple "today" preset like Meta without a full GAQL with date ranges.
        // For simplicity, we'll return Meta and let Google be synced via the new sync-google route 
        // OR we pull from DB here if the DB contains the data.

        // Actually, the frontend calls this to get live metrics for a specific period.
        // For now, let's keep it to Meta or add a placeholder for Google if we can't do live GAQL here without date range logic.

        return NextResponse.json({
            success: true,
            data: metaCampaignsData // Frontend will merge with DB data for Google for now
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
