import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

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

        // O dataService.updateLeadDetails lida com roteamento por prefixo e normalização
        await dataService.updateLeadDetails(lead_id, { [field]: value });

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
