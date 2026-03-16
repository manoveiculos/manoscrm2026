
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

        // Tentar buscar com variantes (55, sem 55, e últimos 8 dígitos)
        const last8 = cleanPhone.length >= 8 ? cleanPhone.substring(cleanPhone.length - 8) : cleanPhone;
        const phoneVariants = [
            cleanPhone,
            cleanPhone.startsWith('55') ? cleanPhone.substring(2) : `55${cleanPhone}`,
            last8
        ].filter(p => p.length >= 8);

        // 1. Buscar na leads_manos_crm
        let { data: leadsMain, error: errorMain } = await supabaseAdmin
            .from('leads_manos_crm')
            .select(`*`)
            .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${phoneVariants.join('%,phone.ilike.%')}%`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (leadsMain && leadsMain.length > 0) {
            const leadMain = leadsMain[0];
            console.log("[Extension API] Lead found in Main Table:", leadMain.id);
            
            return NextResponse.json({
                success: true,
                source: 'main',
                lead: {
                    id: leadMain.id,
                    name: leadMain.name,
                    phone: leadMain.phone,
                    status: leadMain.status,
                    classification: leadMain.ai_classification,
                    score: leadMain.ai_score,
                    vehicle: leadMain.vehicle_interest,
                    vendedor: leadMain.assigned_consultant_id ? 'Consultor Atribuído' : 'Não atribuído',
                    diagnosis: leadMain.ai_reason || leadMain.ai_summary,
                    nextSteps: leadMain.next_step || leadMain.proxima_acao
                }
            });
        }

        // 2. Buscar na leads_distribuicao_crm_26
        let { data: leadsCrm26, error: errorCrm26 } = await supabaseAdmin
            .from('leads_distribuicao_crm_26')
            .select(`*`)
            .or(`telefone.ilike.%${cleanPhone}%,telefone.ilike.%${phoneVariants.join('%,telefone.ilike.%')}%`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (leadsCrm26 && leadsCrm26.length > 0) {
            const leadCrm26 = leadsCrm26[0];
            console.log("[Extension API] Lead found in CRM26 Table:", leadCrm26.id);

            return NextResponse.json({
                success: true,
                source: 'crm26',
                lead: {
                    id: `crm26_${leadCrm26.id}`,
                    name: leadCrm26.nome,
                    phone: leadCrm26.telefone,
                    status: leadCrm26.status,
                    classification: leadCrm26.ai_classification,
                    score: leadCrm26.ai_score,
                    vehicle: leadCrm26.interesse,
                    vendedor: leadCrm26.vendedor || 'Não atribuído',
                    diagnosis: leadCrm26.resumo_consultor || leadCrm26.ai_reason,
                    nextSteps: leadCrm26.proxima_acao || leadCrm26.next_step
                }
            });
        }

        if (errorMain || errorCrm26) {
            console.error("DB Error:", errorMain || errorCrm26);
            return NextResponse.json({ 
                success: false, 
                message: 'Erro no Banco de Dados', 
                details: (errorMain || errorCrm26)?.message 
            }, { status: 500 });
        }

        return NextResponse.json({ success: false, message: 'Lead não encontrado' });

    } catch (err: any) {
        console.error("Extension API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
