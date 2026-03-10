
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const phone = searchParams.get('phone');

        if (!phone) {
            return NextResponse.json({ error: 'Telefone não fornecido' }, { status: 400 });
        }

        const cleanPhone = phone.replace(/\D/g, '');
        console.log(`[Extension API] Buscando phone: ${cleanPhone}`);

        // Tentar buscar com e sem o prefixo 55
        const phoneVariants = [
            cleanPhone,
            cleanPhone.startsWith('55') ? cleanPhone.substring(2) : `55${cleanPhone}`
        ].filter(p => p.length >= 8);

        // 1. Buscar na leads_manos_crm
        let { data: leadsMain, error: errorMain } = await supabaseAdmin
            .from('leads_manos_crm')
            .select(`
                id, name, phone, status, ai_score, ai_classification, vehicle_interest, 
                assigned_consultant_id,
                consultants_manos_crm (name)
            `)
            .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${phoneVariants.join('%,phone.ilike.%')}%`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (errorMain) console.error("Error Main Table:", errorMain);

        if (leadsMain && leadsMain.length > 0) {
            const leadMain = leadsMain[0];
            return NextResponse.json({
                success: true,
                source: 'main',
                lead: {
                    id: leadMain.id,
                    name: leadMain.name,
                    status: leadMain.status,
                    classification: leadMain.ai_classification,
                    score: leadMain.ai_score,
                    vehicle: leadMain.vehicle_interest,
                    vendedor: (leadMain as any).consultants_manos_crm?.name || (Array.isArray((leadMain as any).consultants_manos_crm) ? (leadMain as any).consultants_manos_crm[0]?.name : 'Não atribuído')
                }
            });
        }

        // 2. Buscar na leads_distribuicao_crm_26
        let { data: leadsCrm26, error: errorCrm26 } = await supabaseAdmin
            .from('leads_distribuicao_crm_26')
            .select(`
                id, nome, telefone, status, ai_score, ai_classification, interesse, 
                vendedor
            `)
            .or(`telefone.ilike.%${cleanPhone}%,telefone.ilike.%${phoneVariants.join('%,telefone.ilike.%')}%`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (errorCrm26) console.error("Error CRM26 Table:", errorCrm26);

        if (leadsCrm26 && leadsCrm26.length > 0) {
            const leadCrm26 = leadsCrm26[0];
            return NextResponse.json({
                success: true,
                source: 'crm26',
                lead: {
                    id: `crm26_${leadCrm26.id}`,
                    name: leadCrm26.nome,
                    status: leadCrm26.status,
                    classification: leadCrm26.ai_classification,
                    score: leadCrm26.ai_score,
                    vehicle: leadCrm26.interesse,
                    vendedor: leadCrm26.vendedor || 'Não atribuído'
                }
            });
        }

        return NextResponse.json({ success: false, message: 'Lead não encontrado' });

    } catch (err: any) {
        console.error("Extension API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
