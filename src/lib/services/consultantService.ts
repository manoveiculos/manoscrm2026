import { supabase } from './supabaseClients';
import { cacheGet, cacheSet, TTL, cacheInvalidate } from './cacheLayer';
import { stripPrefix, getTableForLead } from './leadRouter';
import { logHistory } from './interactionService';

/**
 * SERVIÇO DE CONSULTORES
 * Gerencia a tabela unificada 'consultants_manos_crm'
 */

export async function getConsultants() {
    const cacheKey = 'consultants_all';
    const cached = cacheGet<any[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
        .from('consultants_manos_crm')
        .select('*')
        .eq('is_active', true);
        
    if (error) throw error;
    cacheSet(cacheKey, data, TTL.CONSULTANTS);
    return data;
}

export async function getConsultantsV2() {
    return supabase.from('consultants_manos_crm').select('*').eq('is_active', true);
}

export async function assignConsultant(leadId: string, consultantId: string) {
    const table = getTableForLead(leadId);
    const realId = stripPrefix(leadId);

    if (table === 'leads_manos_crm') {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(realId)) {
            console.warn(`Attempted to assign consultant for non-UUID lead in main table: ${realId}`);
            return;
        }
    }

    let consultantName = 'Desconhecido';
    if (consultantId) {
        const { data: consultant } = await supabase
            .from('consultants_manos_crm')
            .select('name')
            .eq('id', consultantId)
            .maybeSingle();
        consultantName = consultant?.name || 'Desconhecido';
    }

    const now = new Date().toISOString();
    const updateData: any = {};

    if (table === 'leads_manos_crm') {
        updateData.updated_at = now;
        updateData.assigned_consultant_id = consultantId || null;
    } else {
        updateData.atualizado_em = now;
        updateData.vendedor = consultantId ? consultantName : null;
        updateData.enviado = consultantId ? true : false;

        // TRACK FIRST CONSULTANT
        if (consultantId) {
            const { data: existing } = await supabase.from(table).select('primeiro_vendedor').eq('id', realId).single();
            if (!existing?.primeiro_vendedor) {
                updateData.primeiro_vendedor = consultantName;
            }
        }
    }

    const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', realId);

    if (error) {
        console.error(`Error updating ${table} (ID: ${realId}):`, error);
        throw error;
    }

    // Log history (only if table supports it)
    if (table === 'leads_manos_crm') {
        await logHistory(realId, 'contacted', undefined, `Lead ${consultantId ? 'atribuído para ' + consultantName : 'desatribuído'} manualmente.`);
    }
    
    cacheInvalidate('leads_');
}


export async function pickNextConsultant(leadName?: string, excludedId?: string, allowedNames?: string[], excludedName?: string) {
    // 0. Robust resolution of excludedId if only excludedName is provided
    let effectiveExcludedId = excludedId;
    if (!effectiveExcludedId && excludedName) {
        const firstName = excludedName.toLowerCase().trim().split(' ')[0];
        const { data: allConsultants } = await supabase.from('consultants_manos_crm').select('id, name');
        const excludedConsultant = allConsultants?.find((c: any) => c.name.toLowerCase().includes(firstName));
        if (excludedConsultant) effectiveExcludedId = excludedConsultant.id;
    }

    // Special Rules
    if (leadName) {
        const name = leadName.toLowerCase();
        if (name.includes('wilson')) {
            const { data: sergio } = await supabase
                .from('consultants_manos_crm')
                .select('*')
                .ilike('name', '%Sergio%')
                .single();
            if (sergio && sergio.id !== effectiveExcludedId) return sergio;
        }
        if (name.includes('rodrigo')) {
            const { data: victor } = await supabase
                .from('consultants_manos_crm')
                .select('*')
                .ilike('name', '%Victor%')
                .single();
            if (victor && victor.id !== effectiveExcludedId) return victor;
        }
    }

    // Round Robin: Active, oldest assignment, excluding specified ID
    let query = supabase
        .from('consultants_manos_crm')
        .select('*')
        .eq('is_active', true);

    if (effectiveExcludedId) {
        query = query.neq('id', effectiveExcludedId);
    }

    if (allowedNames && allowedNames.length > 0) {
        const orFilters = allowedNames.map(name => `name.ilike.%${name}%`).join(',');
        query = query.or(orFilters);
    }

    const { data: consultants, error: queryError } = await query
        .order('last_lead_assigned_at', { ascending: true, nullsFirst: true })
        .limit(1);

    if (queryError) {
        console.error("Error picking next consultant:", queryError);
        return null;
    }

    if (!consultants || consultants.length === 0) {
        if (effectiveExcludedId) {
            const { data: fallback } = await supabase
                .from('consultants_manos_crm')
                .select('*')
                .eq('is_active', true)
                .order('last_lead_assigned_at', { ascending: true, nullsFirst: true })
                .limit(1);
            return fallback?.[0] || null;
        }
        return null;
    }

    return consultants[0];
}

/**
 * Resolves a consultant UUID based on a name string (case-insensitive).
 * Useful for leads arriving from external webhooks with only a name.
 */
export async function resolveConsultantIdByName(name: string): Promise<string | null> {
    if (!name || name.trim() === '') return null;
    
    // Attempt first name match first to be more precise
    const firstName = name.trim().split(' ')[0];
    
    // Check cache or db
    const { data: consultants, error } = await supabase
        .from('consultants_manos_crm')
        .select('id, name')
        .ilike('name', `%${firstName}%`);
        
    if (error || !consultants || consultants.length === 0) return null;
    
    // If multiple matches, try exact full name or just pick the first one as fallback
    if (consultants.length === 1) return consultants[0].id;
    
    const exactMatch = consultants.find(c => c.name.toLowerCase() === name.toLowerCase().trim());
    return exactMatch ? exactMatch.id : consultants[0].id;
}

export async function getConsultantMetrics(consultantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: consultant } = await supabase
        .from('consultants_manos_crm')
        .select('name')
        .eq('id', consultantId)
        .single();

    let totalLeads = 0;
    let statusCounts: Record<string, number> = {};

    if (consultantId) {
        const { data: leads26 } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('status, resumo, nome, telefone')
            .eq('assigned_consultant_id', consultantId);

        if (leads26) {
            const validLeads = (leads26 as any[]).filter(l => l.nome && l.nome.trim() !== '' && l.telefone && l.telefone.trim() !== '');
            totalLeads = validLeads.length;
            validLeads.forEach(l => {
                let status = l.status || (l.resumo?.match(/\[STATUS:(.*?)\]/)?.[1]) || 'received';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
        }
    }

    const { data: salesMonth } = await supabase
        .from('sales_manos_crm')
        .select('sale_value, profit_margin')
        .eq('consultant_id', consultantId)
        .gte('created_at', startOfMonth);

    const { data: salesAll } = await supabase
        .from('sales_manos_crm')
        .select('sale_value, profit_margin')
        .eq('consultant_id', consultantId);

    const salesCount = salesMonth?.length || 0;
    const totalRevenue = salesAll?.reduce((acc, s) => acc + (Number(s.sale_value) || 0), 0) || 0;
    const monthlyRevenue = salesMonth?.reduce((acc, s) => acc + (Number(s.sale_value) || 0), 0) || 0;

    const conversionRate = totalLeads > 0 ? (salesCount / totalLeads) * 100 : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let scheduledLeads: any[] = [];
    if (consultantId) {
        const { data: crm26Scheduled } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('*')
            .eq('assigned_consultant_id', consultantId)
            .neq('resumo', null)
            .ilike('resumo', '%STATUS:scheduled%');

        if (crm26Scheduled) {
            scheduledLeads = crm26Scheduled.map(item => ({
                id: `crm26_${item.id}`,
                name: item.nome,
                phone: item.telefone,
                vehicle_interest: item.interesse || '',
                status: 'scheduled',
                ai_summary: (item.resumo || '').split('||IA_DATA||')[0].replace(/\[STATUS:.*?\]\s*/g, ''),
                scheduled_at: new Date().toISOString()
            }));
        }
    }

    return {
        leadCount: totalLeads,
        salesCount,
        totalRevenue,
        monthlyRevenue,
        conversionRate,
        statusCounts: statusCounts || {},
        scheduledLeads: scheduledLeads || []
    };
}
