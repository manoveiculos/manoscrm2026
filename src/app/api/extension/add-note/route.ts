import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { lead_id, note, status } = await req.json();

        if (!lead_id || !note) {
            return NextResponse.json({ error: 'lead_id e note são obrigatórios' }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        // Strip prefix para obter o ID limpo
        const cleanId = String(lead_id).replace(/^(main_|crm26_|dist_)/, '');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(cleanId)) {
            // Lead legado (crm_26 / dist) — não tem UUID na tabela interactions_manos_crm
            return NextResponse.json({
                success: false,
                error: 'Nota não disponível para leads legados. Migre o lead para o CRM principal primeiro.'
            }, { status: 422 });
        }

        const { error } = await adminClient.from('interactions_manos_crm').insert([{
            lead_id: cleanId,
            new_status: status || null,
            notes: note,
            created_at: new Date().toISOString()
        }]);

        if (error) throw error;

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error('Extension Add-Note API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
