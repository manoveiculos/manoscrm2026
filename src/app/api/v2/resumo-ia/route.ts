import { NextResponse } from 'next/server';
import { summarizeLeadConversation } from '@/lib/services/aiConversationService';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const result = await summarizeLeadConversation({
            leadId: body.leadId,
            phone: body.phone,
            leadName: body.leadName,
            vehicleInterest: body.vehicleInterest
        });

        return NextResponse.json({
            success: true,
            data: result
        });
    } catch (err: any) {
        console.error('[resumo-ia-api] Erro ao gerar resumo:', err);
        return NextResponse.json(
            { success: false, error: err?.message || 'Erro ao processar resumo IA' },
            { status: 500 }
        );
    }
}
