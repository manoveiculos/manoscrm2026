
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const { leadId, status } = await req.json();

        if (!leadId || !status) {
            return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
        }

        const isCrm26 = leadId.startsWith('crm26_');
        const realId = leadId.replace('crm26_', '');

        if (isCrm26) {
            const { error } = await supabaseAdmin
                .from('leads_distribuicao_crm_26')
                .update({ status })
                .eq('id', parseInt(realId));
            if (error) throw error;
        } else {
            const { error } = await supabaseAdmin
                .from('leads_manos_crm')
                .update({ status })
                .eq('id', realId);
            if (error) throw error;
        }

        return NextResponse.json({ success: true, status });

    } catch (err: any) {
        console.error("Update Status API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
