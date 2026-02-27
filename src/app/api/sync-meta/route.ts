import { dataService } from '@/lib/dataService';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const token = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
        const adAccountId = process.env.META_AD_ACCOUNT_ID || process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID;

        if (!token || !adAccountId) {
            console.error("Missing Meta configuration in environment variables.");
            return NextResponse.json(
                { success: false, error: 'Configuração do Meta Ads ausente no servidor.' },
                { status: 500 }
            );
        }

        console.log("🚀 Server-side Meta sync triggered...");
        const count = await dataService.syncMetaCampaigns(token, adAccountId);

        return NextResponse.json({
            success: true,
            syncedCount: count,
            message: `${count} campanhas sincronizadas com sucesso.`
        });

    } catch (error: any) {
        console.error('Meta Sync API Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Falha na sincronização com o Meta',
            details: error.message
        }, { status: 500 });
    }
}
