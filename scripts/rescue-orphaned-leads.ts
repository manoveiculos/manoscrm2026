import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function rescueLeads() {
    console.log("🚀 Iniciando Resgate de Leads Órfãos...");

    // 1. Carregar todos os consultores para cache local
    const { data: consultants, error: consError } = await supabase
        .from('consultants_manos_crm')
        .select('id, name');

    if (consError || !consultants) {
        console.error("Erro ao carregar consultores:", consError);
        return;
    }

    console.log(`✅ ${consultants.length} consultores carregados.`);

    const resolveId = (name: string): string | null => {
        if (!name) return null;
        const search = name.toLowerCase().trim();
        const firstWord = search.split(' ')[0];
        
        // Tenta match exato primeiro
        let match = consultants.find(c => c.name.toLowerCase() === search);
        if (match) return match.id;
        
        // Tenta match pelo primeiro nome
        match = consultants.find(c => c.name.toLowerCase().startsWith(firstWord));
        return match ? match.id : null;
    };

    // 2. Processar leads_manos_crm (V1)
    console.log("\n--- Processando V1 (leads_manos_crm) ---");
    const { data: v1Leads, error: v1Error } = await supabase
        .from('leads_manos_crm')
        .select('id, primeiro_vendedor')
        .is('assigned_consultant_id', null)
        .not('primeiro_vendedor', 'is', null);

    if (v1Error) {
        console.error("Erro ao buscar leads V1:", v1Error);
    } else {
        console.log(`Encontrados ${v1Leads?.length || 0} leads órfãos na V1.`);
        let fixedV1 = 0;
        for (const lead of (v1Leads || [])) {
            const resolvedId = resolveId(lead.primeiro_vendedor);
            if (resolvedId) {
                const { error: updError } = await supabase
                    .from('leads_manos_crm')
                    .update({ assigned_consultant_id: resolvedId })
                    .eq('id', lead.id);
                if (!updError) fixedV1++;
            }
        }
        console.log(`✅ Sucesso: ${fixedV1} leads corrigidos na V1.`);
    }

    // 3. Processar leads_distribuicao_crm_26 (V2)
    console.log("\n--- Processando V2 (leads_distribuicao_crm_26) ---");
    const { data: v2Leads, error: v2Error } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('id, primeiro_vendedor')
        .is('assigned_consultant_id', null)
        .not('primeiro_vendedor', 'is', null);

    if (v2Error) {
        console.error("Erro ao buscar leads V2:", v2Error);
    } else {
        console.log(`Encontrados ${v2Leads?.length || 0} leads órfãos na V2.`);
        let fixedV2 = 0;
        for (const lead of (v2Leads || [])) {
            const resolvedId = resolveId(lead.primeiro_vendedor);
            if (resolvedId) {
                const { error: updError } = await supabase
                    .from('leads_distribuicao_crm_26')
                    .update({ assigned_consultant_id: resolvedId })
                    .eq('id', lead.id);
                if (!updError) fixedV2++;
            }
        }
        console.log(`✅ Sucesso: ${fixedV2} leads corrigidos na V2.`);
    }

    console.log("\n🎉 Missão de Resgate Concluída!");
}

rescueLeads();
