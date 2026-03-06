import { dataService } from '@/lib/dataService';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { fullClear } = await req.json().catch(() => ({ fullClear: true }));

        const token = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
        const adAccountId = process.env.META_AD_ACCOUNT_ID || process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID;

        if (!token || !adAccountId) {
            return NextResponse.json(
                { success: false, error: 'Configuração do Meta Ads ausente no servidor.' },
                { status: 500 }
            );
        }

        if (fullClear) {
            await dataService.clearCampaigns();
        }

        // Sync campaigns (insights)
        const campaignCount = await dataService.syncMetaCampaigns(token, adAccountId);

        // Sync leads (Lead Ads forms)
        const leadCount = await dataService.syncMetaLeads(token, adAccountId);

        return NextResponse.json({
            success: true,
            syncedCampaigns: campaignCount,
            syncedLeads: leadCount,
            message: `Sincronização concluída: ${campaignCount} campanhas e ${leadCount} leads sincronizados.`
        });

    } catch (error: unknown) {
        const err = error as Error;
        console.error('Meta Sync Error:', err.message);
        return NextResponse.json({
            success: false,
            error: 'Falha na sincronização com o Meta',
            details: err.message
        }, { status: 500 });
    }
}
