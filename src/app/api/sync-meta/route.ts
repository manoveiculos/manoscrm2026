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

        const count = await dataService.syncMetaCampaigns(token, adAccountId);

        return NextResponse.json({
            success: true,
            syncedCount: count,
            message: `Sincronização concluída: ${count} campanhas encontradas na conta ${adAccountId}.`
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
