
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        // Buscar em ambas as tabelas
        const [mainResponse, crm26Response] = await Promise.all([
            supabaseAdmin.from('leads_manos_crm').select('id, name, status, ai_classification, vehicle_interest'),
            supabaseAdmin.from('leads_distribuicao_crm_26').select('id, nome, status, ai_classification, interesse')
        ]);

        if (mainResponse.error) throw mainResponse.error;
        if (crm26Response.error) throw crm26Response.error;

        const allLeads = [
            ...(mainResponse.data || []).map(l => ({
                id: l.id,
                name: l.name,
                status: l.status,
                classification: l.ai_classification,
                vehicle: l.vehicle_interest,
                source: 'main'
            })),
            ...(crm26Response.data || []).map(l => ({
                id: `crm26_${l.id}`,
                name: l.nome,
                status: l.status,
                classification: l.ai_classification,
                vehicle: l.interesse,
                source: 'crm26'
            }))
        ];

        // Agrupar por status
        const kanban = allLeads.reduce((acc: any, lead) => {
            const status = lead.status || 'new';
            if (!acc[status]) acc[status] = [];
            acc[status].push(lead);
            return acc;
        }, {});

        return NextResponse.json({ success: true, kanban });

    } catch (err: any) {
        console.error("Extension Kanban API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
