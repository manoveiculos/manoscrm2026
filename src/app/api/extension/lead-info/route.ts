import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const phone = searchParams.get('phone');

        if (!phone) {
            return NextResponse.json({ error: 'Telefone não fornecido' }, { status: 400 });
        }

        // Injetar Admin Client para bypass RLS na extensão (Protegido por Key de Serviço)
        const adminClient = createClient();
        dataService.setClient(adminClient);

        const lead = await dataService.getLeadByPhone(phone);

        if (!lead) {
            return NextResponse.json({ success: false, message: 'Lead não encontrado' });
        }

        return NextResponse.json({
            success: true,
            source: lead.source_table?.includes('manos_crm') ? 'main' : lead.source_table?.includes('crm_26') ? 'crm26' : 'dist',
            lead: {
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                status: lead.status,
                classification: lead.ai_classification,
                score: lead.ai_score,
                vehicle: lead.vehicle_interest || lead.interesse,
                vendedor: lead.primeiro_vendedor || 'Não atribuído',
                diagnosis: lead.ai_reason || lead.ai_summary || lead.resumo_consultor,
                nextSteps: lead.proxima_acao || lead.next_step
            }
        });

    } catch (err: any) {
        console.error("Extension API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
