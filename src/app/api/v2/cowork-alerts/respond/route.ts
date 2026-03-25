import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const { alert_id, consultant_id, consultant_name, action, contest_reason } = await req.json();

        if (!alert_id || !consultant_id || !action) {
            return NextResponse.json({ error: 'alert_id, consultant_id e action são obrigatórios' }, { status: 400 });
        }

        // Upsert to prevent duplicates
        const { error } = await supabaseAdmin
            .from('alert_acknowledgements')
            .upsert({
                alert_id,
                consultant_id,
                consultant_name: consultant_name || 'Desconhecido',
                action,
                contest_reason: contest_reason || null,
            }, { onConflict: 'alert_id,consultant_id' });

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
