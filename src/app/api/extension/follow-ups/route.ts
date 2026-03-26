import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { getFollowUps, completeFollowUp } from '@/lib/services/followUpService';

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const leadId = searchParams.get('lead_id');

        if (!leadId) {
            return NextResponse.json({ error: 'lead_id obrigatório' }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        const { data, error } = await getFollowUps(leadId);
        if (error) throw error;

        return NextResponse.json({ success: true, followups: data || [] });

    } catch (err: any) {
        console.error('Extension Follow-ups API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { followup_id, result, result_note } = await req.json();

        if (!followup_id) {
            return NextResponse.json({ error: 'followup_id obrigatório' }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        const { data, error } = await completeFollowUp(followup_id, result || 'completed', result_note);
        if (error) throw error;

        return NextResponse.json({ success: true, followup: data });

    } catch (err: any) {
        console.error('Extension Complete Follow-up API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
