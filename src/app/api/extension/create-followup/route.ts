import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { createFollowUp } from '@/lib/services/followUpService';

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { lead_id, scheduled_at, type, note, priority } = await req.json();

        if (!lead_id || !scheduled_at) {
            return NextResponse.json({ error: 'lead_id e scheduled_at são obrigatórios' }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        const { data, error } = await createFollowUp({
            lead_id,
            user_id: 'extension',
            scheduled_at,
            type: type || 'ligacao',
            note: note || '',
            priority: priority || 'medium'
        });

        if (error) throw error;

        return NextResponse.json({ success: true, followup: data });

    } catch (err: any) {
        console.error('Extension Create Follow-up API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
