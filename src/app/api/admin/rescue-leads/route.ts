import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveConsultantIdByName } from '@/lib/services/consultantService';

export async function GET() {
    console.log("🚀 Iniciando Resgate de Leads Órfãos via API...");

    try {
        // 1. Carregar todos os consultores
        const { data: consultants, error: consError } = await supabase
            .from('consultants_manos_crm')
            .select('id, name');

        if (consError || !consultants) {
            return NextResponse.json({ error: "Erro ao carregar consultores", details: consError }, { status: 500 });
        }

        const resolveId = (name: string): string | null => {
            if (!name) return null;
            const search = name.toLowerCase().trim();
            const firstWord = search.split(' ')[0];
            
            let match = consultants.find(c => c.name.toLowerCase() === search);
            if (match) return match.id;
            
            match = consultants.find(c => c.name.toLowerCase().startsWith(firstWord));
            return match ? match.id : null;
        };

        const results = {
            v1: { total: 0, fixed: 0, errors: 0 },
            v2: { total: 0, fixed: 0, errors: 0 }
        };

        // 2. Processar leads_manos_crm (V1)
        const { data: v1Leads, error: v1Error } = await supabase
            .from('leads_manos_crm')
            .select('id, primeiro_vendedor')
            .is('assigned_consultant_id', null)
            .not('primeiro_vendedor', 'is', null);

        if (!v1Error && v1Leads) {
            results.v1.total = v1Leads.length;
            for (const lead of v1Leads) {
                const resolvedId = resolveId(lead.primeiro_vendedor);
                if (resolvedId) {
                    const { error: updError } = await supabase
                        .from('leads_manos_crm')
                        .update({ assigned_consultant_id: resolvedId })
                        .eq('id', lead.id);
                    if (!updError) results.v1.fixed++;
                    else results.v1.errors++;
                }
            }
        }

        // 3. Processar leads_distribuicao_crm_26 (V2)
        const { data: v2Leads, error: v2Error } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('id, primeiro_vendedor')
            .is('assigned_consultant_id', null)
            .not('primeiro_vendedor', 'is', null);

        if (!v2Error && v2Leads) {
            results.v2.total = v2Leads.length;
            for (const lead of v2Leads) {
                const resolvedId = resolveId(lead.primeiro_vendedor);
                if (resolvedId) {
                    const { error: updError } = await supabase
                        .from('leads_distribuicao_crm_26')
                        .update({ assigned_consultant_id: resolvedId })
                        .eq('id', lead.id);
                    if (!updError) results.v2.fixed++;
                    else results.v2.errors++;
                }
            }
        }

        return NextResponse.json({ message: "Resgate concluído", results });
    } catch (err: any) {
        return NextResponse.json({ error: "Crash no resgate", details: err.message }, { status: 500 });
    }
}
