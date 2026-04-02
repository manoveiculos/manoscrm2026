
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
        // Filtro por vendedor (consultantId via query param)
        const consultantId = req.nextUrl.searchParams.get('consultantId');
        // Status de entrada/sem atendimento
        const entradaStatuses = ['new', 'received', 'entrada'];

        // Buscar em todas as tabelas — apenas leads em estágio de entrada
        let mainQuery = supabaseAdmin.from('leads_manos_crm')
            .select('id, name, phone, status, ai_classification, vehicle_interest, assigned_consultant_id, created_at')
            .in('status', entradaStatuses)
            .order('created_at', { ascending: false });
        let crm26Query = supabaseAdmin.from('leads_distribuicao_crm_26')
            .select('id, nome, telefone, status, ai_classification, interesse, assigned_consultant_id, created_at')
            .in('status', entradaStatuses)
            .order('created_at', { ascending: false });
        let masterQuery = supabaseAdmin.from('leads_master')
            .select('id, name, phone, status, ai_classification, vehicle_interest, assigned_consultant_id, created_at')
            .in('status', entradaStatuses)
            .order('created_at', { ascending: false });

        // Filtrar apenas leads desse vendedor
        if (consultantId) {
            mainQuery = mainQuery.eq('assigned_consultant_id', consultantId);
            crm26Query = crm26Query.eq('assigned_consultant_id', consultantId);
            masterQuery = masterQuery.eq('assigned_consultant_id', consultantId);
        }

        const [mainResponse, crm26Response, masterResponse] = await Promise.all([
            mainQuery, crm26Query, masterQuery
        ]);

        if (mainResponse.error) throw mainResponse.error;
        if (crm26Response.error) throw crm26Response.error;
        if (masterResponse.error) throw masterResponse.error;

        const allLeads = [
            ...(mainResponse.data || []).map(l => ({
                id: `main_${l.id}`,
                name: l.name,
                phone: l.phone,
                status: l.status,
                classification: l.ai_classification,
                vehicle: l.vehicle_interest,
                assigned_consultant_id: l.assigned_consultant_id,
                created_at: l.created_at,
                source: 'main'
            })),
            ...(crm26Response.data || []).map(l => ({
                id: `crm26_${l.id}`,
                name: l.nome,
                phone: l.telefone,
                status: l.status,
                classification: l.ai_classification,
                vehicle: l.interesse,
                assigned_consultant_id: l.assigned_consultant_id,
                created_at: l.created_at,
                source: 'crm26'
            })),
            ...(masterResponse.data || []).map(l => ({
                id: `master_${l.id}`,
                name: l.name,
                phone: l.phone,
                status: l.status,
                classification: l.ai_classification,
                vehicle: l.vehicle_interest,
                assigned_consultant_id: l.assigned_consultant_id,
                created_at: l.created_at,
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
