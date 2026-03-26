import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { getUnifiedTimeline } from '@/lib/services/interactionService';

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const leadId = searchParams.get('lead_id');
        const phone = searchParams.get('phone') || undefined;

        if (!leadId) {
            return NextResponse.json({ error: 'lead_id obrigatório' }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        const events = await getUnifiedTimeline(leadId, phone);

        return NextResponse.json({ success: true, events });

    } catch (err: any) {
        console.error('Extension Timeline API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
