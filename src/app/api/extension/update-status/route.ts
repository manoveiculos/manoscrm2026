import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        // Aceita tanto "leadId" (legado) quanto "lead_id" (padrão atual)
        const leadId = body.leadId || body.lead_id;
        const { status, notes } = body;

        if (!leadId || !status) {
            console.error("[api/extension/update-status] Erro de validação:", { body });
            return NextResponse.json({ 
                success: false, 
                error: `Dados inválidos: lead_id (${leadId}) e status (${status}) são obrigatórios` 
            }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        // O dataService.updateLeadStatus já lida com prefixos e históricos
        await dataService.updateLeadStatus(leadId, status, undefined, notes || '[API Extensão] Alteração de status via WhatsApp');

        return NextResponse.json({ success: true, status });

    } catch (err: any) {
        console.error("Update Status API Error:", err);
        const isNotFound = err.message?.includes('não encontrado');
        return NextResponse.json(
            { success: false, error: isNotFound ? 'Lead não encontrado ou erro ao atualizar' : err.message },
            { status: isNotFound ? 404 : 500 }
        );
    }
}
