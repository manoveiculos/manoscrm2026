import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { leadCacheInvalidate } from '@/lib/leadService';

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { lead_id, field, value } = body;

        if (!lead_id || !field) {
            return NextResponse.json({
                success: false,
                error: 'lead_id e field são obrigatórios'
            }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        // O dataService.updateLeadDetails lida com roteamento por prefixo e normalização.
        // Internamente já chama cacheInvalidate('leads_') do cacheLayer (leadCrud.ts:285).
        await dataService.updateLeadDetails(lead_id, { [field]: value });

        // Invalida também o cache em-memória do leadService.ts (usado pelo /api/extension/kanban
        // após o refactor que faz ele consumir leadService.getLeadsPaginated). Sem isso, o
        // próximo poll do kanban dentro dos 30s poderia retornar dado obsoleto desta serverless.
        leadCacheInvalidate();

        return NextResponse.json({ success: true, field, value });

    } catch (err: any) {
        console.error("[api/extension/update-lead-field] Error:", err);
        const isNotFound = err.message?.includes('não encontrado');
        return NextResponse.json(
            { success: false, error: isNotFound ? 'Lead não encontrado ou erro ao atualizar' : err.message },
            { status: isNotFound ? 404 : 500 }
        );
    }
}
