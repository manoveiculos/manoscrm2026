import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { lead_id } = body;

        if (!lead_id) {
            return NextResponse.json({ 
                success: false, 
                error: 'lead_id é obrigatório' 
            }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        // O dataService.deleteLead lida com roteamento por prefixo
        await dataService.deleteLead(lead_id);

        return NextResponse.json({ success: true, message: 'Lead excluído com sucesso' });

    } catch (err: any) {
        console.error("[api/extension/delete-lead] Error:", err);
        return NextResponse.json(
            { success: false, error: err.message || 'Erro ao excluir lead' },
            { status: 500 }
        );
    }
}
