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

    if (consultantId) {
        await markConsultantAsAssigned(consultantId);
    }
    
    cacheInvalidate('leads_');
}

export async function markConsultantAsAssigned(consultantId: string) {
    if (!consultantId) return;
    
    const { error } = await supabase
        .from('consultants_manos_crm')
        .update({ last_lead_assigned_at: new Date().toISOString() })
        .eq('id', consultantId);

    if (error) {
        console.error("Error updating consultant assignment timestamp:", error);
    } else {
        cacheInvalidate('consultants_all');
    }
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

import { getFinancialMetrics as getUnifiedMetrics } from './analyticsService';

// ... (outras funções dadas)

export async function getConsultantMetrics(consultantId: string, period: 'today' | 'week' | 'month' | 'all' = 'month') {
    const periodMap: Record<string, 'today' | 'this_week' | 'this_month' | 'all'> = {
        'today': 'today',
        'week': 'this_week',
        'month': 'this_month',
        'all': 'all'
    };

    const metrics = await getUnifiedMetrics({
        period: periodMap[period],
        consultantId
    });

    // Formatar para o contrato esperado pelo ConsultantDashboard
    return {
        leadCount: metrics.leadCount,
        salesCount: metrics.salesCount,
        totalRevenue: metrics.totalRevenue,
        monthlyRevenue: metrics.totalRevenue, // No contexto unificado, totalRevenue respeita o período
        conversionRate: metrics.conversionRate,
        statusCounts: metrics.funnelData || {},
        scheduledLeads: metrics.tactical?.scheduled_leads || [],
        avgResponseMin: metrics.avgResponseTime || 0
    };
}
