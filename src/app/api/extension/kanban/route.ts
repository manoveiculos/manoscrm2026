
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
        // Buscar em todas as tabelas (Main, CRM26 e Master/V2)
        const [mainResponse, crm26Response, masterResponse] = await Promise.all([
            supabaseAdmin.from('leads_manos_crm').select('id, name, status, ai_classification, vehicle_interest'),
            supabaseAdmin.from('leads_distribuicao_crm_26').select('id, nome, status, ai_classification, interesse'),
            supabaseAdmin.from('leads_master').select('id, name, status, ai_classification, vehicle_interest')
        ]);

        if (mainResponse.error) throw mainResponse.error;
        if (crm26Response.error) throw crm26Response.error;
        if (masterResponse.error) throw masterResponse.error;
 
        const allLeads = [
            ...(mainResponse.data || []).map(l => ({
                id: `main_${l.id}`,
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
            })),
            ...(masterResponse.data || []).map(l => ({
                id: `master_${l.id}`,
                name: l.name,
                status: l.status,
                classification: l.ai_classification,
                vehicle: l.vehicle_interest,
                source: 'master'
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
