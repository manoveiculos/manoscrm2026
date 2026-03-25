import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const consultantId = searchParams.get('consultantId');

    try {
        let query = supabaseAdmin
            .from('cowork_alerts')
            .select('*')
            .eq('is_active', true)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: true });

        if (consultantId) {
            query = query.or(`target_consultant_id.eq.${consultantId},target_consultant_id.is.null`);
        }

        const { data: alerts, error } = await query;
        if (error) throw error;

        if (!consultantId || !alerts?.length) {
            return NextResponse.json({ success: true, alerts: alerts ?? [] });
        }

        // Filtra os já respondidos por este consultor
        const { data: acks } = await supabaseAdmin
            .from('alert_acknowledgements')
            .select('alert_id')
            .eq('consultant_id', consultantId);

        const ackedIds = new Set((acks ?? []).map((a: any) => a.alert_id));
        const pending = alerts.filter((a: any) => !ackedIds.has(a.id));

        return NextResponse.json({ success: true, alerts: pending });
    } catch (err: any) {
        console.error('[cowork-alerts GET]', err);
        return NextResponse.json({ success: false, alerts: [], error: err.message }, { status: 200 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { title, message, type = 'manual', priority = 2, target_consultant_id = null, expires_at = null } = body;

        if (!title || !message) {
            return NextResponse.json({ error: 'title e message são obrigatórios' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('cowork_alerts')
            .insert({ title, message, type, priority, target_consultant_id, expires_at, is_active: true })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, alert: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
