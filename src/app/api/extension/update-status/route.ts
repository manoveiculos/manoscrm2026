import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { leadId, status, notes } = await req.json();

        if (!leadId || !status) {
            return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        // O dataService.updateLeadStatus já lida com prefixos e históricos
        await dataService.updateLeadStatus(leadId, status, undefined, notes || '[API Extensão] Alteração de status via WhatsApp');

        return NextResponse.json({ success: true, status });

    } catch (err: any) {
        console.error("Update Status API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
