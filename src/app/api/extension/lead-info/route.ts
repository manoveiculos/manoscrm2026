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

        // A VIEW 'leads' já retorna id com prefixo (ex: 'master_uuid', 'main_uuid').
        // Extraímos o UUID puro para reconstruir o prefixedId sem double-prefix.
        const rawUuid = String(lead.id || '').replace(/^(main_|crm26_|dist_|master_)/, '');

        const sourceKey = lead.source_table === 'leads_manos_crm' ? 'main'
            : lead.source_table === 'leads_distribuicao_crm_26' ? 'crm26'
            : lead.source_table === 'leads_distribuicao' ? 'dist'
            : lead.source_table === 'leads_master' ? 'master'
            : 'main'; // fallback seguro para source_table null/desconhecido

        const prefixedId = `${sourceKey}_${rawUuid}`;

        return NextResponse.json({
            success: true,
            source: sourceKey,
            lead: {
                id: prefixedId,
                raw_id: rawUuid,
                name: lead.name,
                phone: lead.phone,
                status: lead.status,
                classification: lead.ai_classification,
                score: lead.ai_score,
                vehicle: lead.vehicle_interest || lead.interesse,
                valor: lead.valor_investimento,
                source: lead.source || lead.plataforma_meta || lead.utm_source,
                vendedor: lead.vendedor || lead.primeiro_vendedor || 'Não atribuído',
                diagnosis: lead.ai_reason || lead.ai_summary || lead.resumo_consultor,
                nextSteps: lead.proxima_acao || lead.next_step,
                carro_troca: lead.carro_troca,
                created_at: lead.created_at,
                updated_at: lead.updated_at,
            }
        });

    } catch (err: any) {
        console.error("Extension API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
