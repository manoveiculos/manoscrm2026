import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — admin busca todos os avisos + acknowledgements
export async function GET() {
    try {
        const [alertsRes, acksRes] = await Promise.all([
            supabaseAdmin
                .from('cowork_alerts')
                .select('*, consultants_manos_crm(name)')
                .order('created_at', { ascending: false })
                .limit(100),
            supabaseAdmin
                .from('alert_acknowledgements')
                .select('*')
                .order('created_at', { ascending: false }),
        ]);

        return NextResponse.json({
            success: true,
            alerts: alertsRes.data ?? [],
            acknowledgements: acksRes.data ?? [],
        });
    } catch (err: any) {
        console.error('[cowork-alerts/all GET]', err);
        return NextResponse.json({ success: false, alerts: [], acknowledgements: [], error: err.message }, { status: 200 });
    }
}

// PATCH — admin ativa/desativa um aviso
export async function PATCH(req: NextRequest) {
    try {
        const { alert_id, is_active } = await req.json();
        if (!alert_id) return NextResponse.json({ error: 'alert_id obrigatório' }, { status: 400 });

        const { error } = await supabaseAdmin
            .from('cowork_alerts')
            .update({ is_active })
            .eq('id', alert_id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[cowork-alerts/all PATCH]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
