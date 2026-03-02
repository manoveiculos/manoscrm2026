import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { campaign_id, date_preset } = await req.json();

        const token = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
        const adAccountId = process.env.META_AD_ACCOUNT_ID || process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID;

        if (!token || !adAccountId || !campaign_id) {
            return NextResponse.json(
                { success: false, error: 'Configuração do Meta Ads ausente ou ID da campanha não fornecido.' },
                { status: 400 }
            );
        }

        const presetQuery = date_preset && date_preset !== 'maximum'
            ? `&date_preset=${date_preset}`
            : '&date_preset=maximum';

        // Fetch daily insights for the specific campaign using time_increment=1
        const apiUrl = `https://graph.facebook.com/v19.0/${campaign_id}/insights?time_increment=1&fields=date_start,spend,inline_link_clicks,impressions,cpc,ctr,reach&access_token=${token}${presetQuery}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        if (result.error) throw new Error(result.error.message);

        const history = result.data || [];

        // Format data for Recharts (e.g., LineChart)
        const formattedHistory = history.map((day: any) => {
            // Convert '2026-03-02' to '02/03'
            const dateStr = day.date_start;
            const [year, month, d] = dateStr.split('-');
            const displayDate = `${d}/${month}`;

            return {
                date: displayDate,
                fullDate: dateStr,
                spend: Number(day.spend || 0),
                clicks: Number(day.inline_link_clicks || 0),
                impressions: Number(day.impressions || 0),
                cpc: Number(day.cpc || 0),
                ctr: Number(day.ctr || 0)
            };
        });

        return NextResponse.json({
            success: true,
            data: formattedHistory
        });

    } catch (error: any) {
        console.error('Campaign History API Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Falha ao buscar histórico da campanha',
            details: error.message
        }, { status: 500 });
    }
}
