import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from './supabase';
import { Lead, LeadStatus, AIClassification } from './types';
import { metaCapiService } from './metaCapiService';

// ============ Cache ============
const _cache = new Map<string, { data: any, expiry: number }>();
const TTL = 30_000; // 30s for leads

function cacheGet<T>(key: string): T | null {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        _cache.delete(key);
        return null;
    }
    return entry.data as T;
}

function cacheSet<T>(key: string, data: T, ttlMs: number = TTL): void {
    _cache.set(key, { data, expiry: Date.now() + ttlMs });
}

export function leadCacheInvalidate(): void {
    _cache.clear();
}

// ============ Lead Service ============
export const leadService = {
    _client: null as any,

    setClient(client: any) {
        this._client = client;
    },

    getClient(fallback?: SupabaseClient) {
        return this._client || fallback || defaultSupabase;
    },

    /**
     * Fetches leads with server-side pagination and filtering.
     * Uses the unified 'leads' View created in Supabase.
     */
    async getLeadsPaginated(supabase?: SupabaseClient, params?: {
        page?: number;
        limit?: number;
        consultantId?: string;
        status?: LeadStatus;
        searchTerm?: string;
    }) {
        const { page = 1, limit = 50, consultantId, status, searchTerm } = params || {};
        const cacheKey = `leads_p${page}_l${limit}_c${consultantId || 'all'}_s${status || 'all'}_t${searchTerm || 'none'}`;
        
        const cached = cacheGet<{ leads: Lead[], totalCount: number }>(cacheKey);
        if (cached) return cached;

        try {
            const client = this.getClient(supabase);
            let query = client
                .from('leads')
                .select('*', { count: 'exact' });

            if (consultantId) {
                if (consultantId === 'unassigned' || consultantId === 'none') {
                    query = query.is('assigned_consultant_id', null);
                } else {
                    query = query.eq('assigned_consultant_id', consultantId);
                }
            }
            if (status) {
                query = query.eq('status', status);
            }
            if (searchTerm) {
                query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
            }

            const { data, count, error } = await query
                .order('created_at', { ascending: false })
                .range((page - 1) * limit, page * limit - 1);

            if (error) throw error;

            const result = { 
                leads: (data || []) as Lead[], 
                totalCount: count || 0 
            };
            
            cacheSet(cacheKey, result);
            return result;
        } catch (err) {
            console.error("Error in leadService.getLeadsPaginated:", err);
            return { leads: [], totalCount: 0 };
        }
    },

    async updateLeadStatus(supabase: SupabaseClient | undefined, leadId: string, status: LeadStatus, oldStatus?: LeadStatus, notes?: string, lossReason?: string) {
        const client = this.getClient(supabase);
        const idStr = leadId.toString();

        // Route update to the correct table based on the ID prefix from the VIEW
        let targetTable: string;
        let cleanId: string;
        if (idStr.startsWith('main_')) {
            targetTable = 'leads_manos_crm';
            cleanId = idStr.replace('main_', '');
        } else if (idStr.startsWith('crm26_')) {
            targetTable = 'leads_distribuicao_crm_26';
            cleanId = idStr.replace('crm26_', '');
        } else if (idStr.startsWith('master_')) {
            targetTable = 'leads_master';
            cleanId = idStr.replace('master_', '');
        } else {
            // Plain UUID or unknown prefix — assume leads_master
            targetTable = 'leads_master';
            cleanId = idStr.replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');
        }

        const realId = targetTable === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        const updatePayload: any = {
            status,
            updated_at: new Date().toISOString()
        };

        // crm26 uses Portuguese column name
        if (targetTable === 'leads_distribuicao_crm_26') {
            updatePayload.atualizado_em = updatePayload.updated_at;
            delete updatePayload.updated_at;
        }

        if (lossReason) {
            updatePayload.motivo_perda = lossReason;
        }

        const { error } = await client
            .from(targetTable)
            .update(updatePayload)
            .eq('id', realId);

        if (error) throw error;
        leadCacheInvalidate();

        // [Meta CAPI] Trigger event asynchronously
        const eventName = metaCapiService.mapStatusToEvent(status);
        if (eventName) {
            this.getLeadById(supabase, leadId).then(lead => {
                if (lead) metaCapiService.sendEvent(lead, eventName);
            }).catch(err => console.error("Meta CAPI async trigger error:", err));
        }

        return true;
    },

    async updateLeadDetails(supabase: SupabaseClient | undefined, leadId: string, details: Partial<Lead>) {
        const client = this.getClient(supabase);
        const idStr = leadId.toString();

        let targetTable: string;
        let cleanId: string;
        if (idStr.startsWith('main_')) {
            targetTable = 'leads_manos_crm';
            cleanId = idStr.replace('main_', '');
        } else if (idStr.startsWith('crm26_')) {
            targetTable = 'leads_distribuicao_crm_26';
            cleanId = idStr.replace('crm26_', '');
        } else if (idStr.startsWith('master_')) {
            targetTable = 'leads_master';
            cleanId = idStr.replace('master_', '');
        } else {
            targetTable = 'leads_master';
            cleanId = idStr.replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');
        }

        const realId = targetTable === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        const updateData: any = { ...details };
        delete updateData.id;
        delete updateData.source_type;
        updateData.updated_at = new Date().toISOString();

        if (targetTable === 'leads_distribuicao_crm_26') {
            updateData.atualizado_em = updateData.updated_at;
            delete updateData.updated_at;

            // Mapeamentos específicos CRM26
            if (updateData.name) { updateData.nome = updateData.name; delete updateData.name; }
            if (updateData.vehicle_interest) { updateData.interesse = updateData.vehicle_interest; } 
            if (updateData.carro_troca) { 
                updateData.troca = updateData.carro_troca; 
            }
        }

        const { error } = await client
            .from(targetTable)
            .update(updateData)
            .eq('id', realId);

        if (error) throw error;
        leadCacheInvalidate();
        return true;
    },

    async deleteLead(supabase: SupabaseClient | undefined, leadId: string) {
        const client = this.getClient(supabase);
        const idStr = leadId.toString();

        let targetTable: string;
        let cleanId: string;
        if (idStr.startsWith('main_')) {
            targetTable = 'leads_manos_crm';
            cleanId = idStr.replace('main_', '');
        } else if (idStr.startsWith('crm26_')) {
            targetTable = 'leads_distribuicao_crm_26';
            cleanId = idStr.replace('crm26_', '');
        } else if (idStr.startsWith('master_')) {
            targetTable = 'leads_master';
            cleanId = idStr.replace('master_', '');
        } else {
            targetTable = 'leads_master';
            cleanId = idStr.replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');
        }

        const realId = targetTable === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        const { error } = await client
            .from(targetTable)
            .delete()
            .eq('id', realId);

        if (error) throw error;
        leadCacheInvalidate();
        return true;
    },

    async getLeadById(supabase: SupabaseClient | undefined, leadId: string): Promise<Lead | null> {
        const client = this.getClient(supabase);
        const { data, error } = await client
            .from('leads')
            .select('*')
            .eq('id', leadId)
            .maybeSingle();

        if (error || !data) return null;
        return data as Lead;
    },

    // ============ Follow-up Services ============
    followUp: {
        async getFollowUps(supabase: SupabaseClient | undefined, leadId: string) {
            const client = leadService.getClient(supabase);
            const { data, error } = await client
                .from('follow_ups')
                .select('*')
                .eq('lead_id', leadId)
                .order('scheduled_at', { ascending: false });
            return { data, error };
        },

        async getNextFollowUp(supabase: SupabaseClient | undefined, leadId: string) {
            const client = leadService.getClient(supabase);
            const { data, error } = await client
                .from('follow_ups')
                .select('*')
                .eq('lead_id', leadId)
                .eq('status', 'pending')
                .gte('scheduled_at', new Date().toISOString())
                .order('scheduled_at', { ascending: true })
                .limit(1)
                .maybeSingle();
            return { data, error };
        },

        async createFollowUp(supabase: SupabaseClient | undefined, followUp: {
            lead_id: string;
            user_id: string;
            scheduled_at: string;
            type: string;
            note: string;
            priority: string;
        }) {
            const client = leadService.getClient(supabase);
            const { data, error } = await client
                .from('follow_ups')
                .insert(followUp)
                .select()
                .single();
            return { data, error };
        },

        async completeFollowUp(supabase: SupabaseClient | undefined, id: string, result: string, resultNote?: string) {
            const client = leadService.getClient(supabase);
            const { data, error } = await client
                .from('follow_ups')
                .update({
                    status: 'completed',
                    result,
                    result_note: resultNote,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .single();
            return { data, error };
        },

        async markMissedFollowUps(supabase: SupabaseClient | undefined, leadId: string) {
            const client = leadService.getClient(supabase);
            await client
                .from('follow_ups')
                .update({ status: 'missed' })
                .eq('lead_id', leadId)
                .eq('status', 'pending')
                .lt('scheduled_at', new Date().toISOString());
        }
    }
};
