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
        status?: LeadStatus | 'all';
        searchTerm?: string;
        startDate?: string;
        origin?: string;
        minScore?: number;
        role?: 'admin' | 'consultant';
        pipelineOnly?: boolean; // Fase 2: só status ativos do pipeline
        endDate?: string;
    }) {
        const {
            page = 1,
            limit = 50,
            consultantId,
            status,
            searchTerm,
            startDate,
            origin,
            minScore,
            role = 'consultant',
            pipelineOnly = false,
            endDate
        } = params || {};

        const cacheKey = `leads_p${page}_l${limit}_c${consultantId || 'all'}_s${status || 'all'}_t${searchTerm || 'none'}_d${startDate || 'no'}_e${endDate || 'no'}_o${origin || 'all'}_sc${minScore || 0}_r${role}_pl${pipelineOnly ? 1 : 0}`;

        const cached = cacheGet<{ leads: Lead[], totalCount: number }>(cacheKey);
        if (cached) return cached;

        // Colunas lean para pipeline (evita select('*') com 50+ colunas)
        // Colunas que EXISTEM na VIEW 'leads' (fix_view_include_master.sql)
        // Não incluir: plataforma_meta, consultant_name, primeiro_vendedor, churn_probability, next_step, cidade
        const LEAN_COLS = 'id,name,phone,email,source,origem,status,ai_score,ai_classification,ai_summary,vehicle_interest,assigned_consultant_id,created_at,updated_at,vendedor,proxima_acao,valor_investimento,observacoes,carro_troca,region,source_table';

        try {
            const client = this.getClient(supabase);

            // Helper: monta a query com filtros (reutilizado para fallback)
            const buildQuery = (selectCols: string) => {
                let q = client
                    .from('leads')
                    .select(selectCols, { count: 'exact' });

                if (role === 'consultant' && consultantId) {
                    q = q.eq('assigned_consultant_id', consultantId);
                } else if (role === 'admin' && consultantId) {
                    if (consultantId === 'unassigned' || consultantId === 'none') {
                        q = q.is('assigned_consultant_id', null);
                    } else if (consultantId !== 'all') {
                        q = q.eq('assigned_consultant_id', consultantId);
                    }
                }

                if (pipelineOnly) {
                    q = q.in('status', [
                        'new', 'received', 'entrada', 'novo',
                        'attempt', 'contacted', 'triagem',
                        'confirmed', 'scheduled', 'visited', 'ataque',
                        'test_drive', 'proposed', 'negotiation', 'fechamento'
                    ]);
                } else if (status && status !== 'all') {
                    q = q.eq('status', status);
                }
                if (searchTerm) {
                    q = q.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,vehicle_interest.ilike.%${searchTerm}%,cpf.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%`);
                }
                if (startDate) {
                    q = q.gte('created_at', startDate);
                }
                if (endDate) {
                    q = q.lte('created_at', endDate);
                }
                if (origin && origin !== 'all') {
                    q = q.or(`origem.eq.${origin},source.eq.${origin}`);
                }
                if (minScore) {
                    q = q.gte('ai_score', minScore);
                }

                return q.order('created_at', { ascending: false })
                    .range((page - 1) * limit, page * limit - 1);
            };

            // Tenta lean query primeiro; se falhar (coluna inexistente na VIEW), fallback p/ select('*')
            let data: any[] | null = null;
            let count: number | null = null;

            if (pipelineOnly) {
                const res = await buildQuery(LEAN_COLS);
                if (res.error) {
                    console.warn("[leadService] Lean query failed, falling back to select('*'):", res.error.message || res.error);
                    const fallback = await buildQuery('*');
                    if (fallback.error) throw fallback.error;
                    data = fallback.data;
                    count = fallback.count;
                } else {
                    data = res.data;
                    count = res.count;
                }
            } else {
                const res = await buildQuery(LEAN_COLS);
                if (res.error) {
                    const fallback = await buildQuery('*');
                    if (fallback.error) throw fallback.error;
                    data = fallback.data;
                    count = fallback.count;
                } else {
                    data = res.data;
                    count = res.count;
                }
            }

            // Mapeia 'region' (da VIEW) → 'cidade' (usado no frontend)
            const leads = (data || []).map((l: any) => ({
                ...l,
                cidade: l.cidade || l.region || null,
            })) as Lead[];

            const result = {
                leads,
                totalCount: count || 0
            };

            cacheSet(cacheKey, result);
            return result;
        } catch (err: any) {
            console.error("Error in leadService.getLeadsPaginated:", err?.message || err);
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
            cleanId = idStr.substring(5); // Removes 'main_'
        } else if (idStr.startsWith('crm26_')) {
            targetTable = 'leads_distribuicao_crm_26';
            cleanId = idStr.substring(6); // Removes 'crm26_'
        } else if (idStr.startsWith('master_')) {
            targetTable = 'leads_master';
            cleanId = idStr.substring(7); // Removes 'master_'
        } else {
            // UUID puro ou sem prefixo conhecido — tenta leads_manos_crm por padrão
            targetTable = 'leads_manos_crm';
            cleanId = idStr;
        }

        const realId = targetTable === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        const updatePayload: any = {
            status,
            updated_at: new Date().toISOString()
        };

        // crm26 uses Portuguese column name and needs resonance in 'resumo' marker
        if (targetTable === 'leads_distribuicao_crm_26') {
            updatePayload.atualizado_em = updatePayload.updated_at;
            delete updatePayload.updated_at;

            // Sync status marker in 'resumo' to prevent legacy parser from reverting on state refresh
            try {
                const { data: currentLead } = await client
                    .from(targetTable)
                    .select('resumo')
                    .eq('id', realId)
                    .single();

                let resumo = currentLead?.resumo || '';
                const targetLabel = status.toUpperCase();
                const statusMarker = `[STATUS:${targetLabel}]`;
                
                if (!resumo.includes('[STATUS:')) resumo += ` ${statusMarker}`;
                else resumo = resumo.replace(/\[STATUS:.*?\]/, statusMarker);
                
                updatePayload.resumo = resumo;
            } catch (err) {
                console.warn("[leadService] Failed to sync resumo marker:", err);
            }
        }

        if (lossReason) {
            updatePayload.motivo_perda = lossReason;
        }

        const { data: updateRes, error } = await client
            .from(targetTable)
            .update(updatePayload)
            .eq('id', realId)
            .select('id');

        if (error || !updateRes || updateRes.length === 0) {
            console.warn(`[leadService] Primary update failed for ${targetTable}:${realId}. Error: ${error?.message || 'Zero rows'}`);
            
            // FALLBACK Resiliente para leads antigos (Master ou Manos)
            if (targetTable === 'leads_manos_crm' || targetTable === 'leads_master') {
                const otherTable = targetTable === 'leads_master' ? 'leads_manos_crm' : 'leads_master';
                console.log(`[leadService] Attempting fallback to ${otherTable}...`);
                const { data: fallbackRes, error: fallbackError } = await client
                    .from(otherTable)
                    .update(updatePayload)
                    .eq('id', realId)
                    .select('id');
                
                if (fallbackError || !fallbackRes || fallbackRes.length === 0) {
                    throw new Error(`Lead ${leadId} não encontrado em nenhuma tabela compatível (Master/Manos).`);
                }
            } else {
                throw error || new Error(`Lead ${leadId} não localizado.`);
            }
        }
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
            if (updateData.carro_troca) { updateData.troca = updateData.carro_troca; }
            if (updateData.cidade) { /* já é 'cidade' no crm26 */ }
        }

        if (targetTable === 'leads_manos_crm') {
            if (updateData.cidade) {
                updateData.region = updateData.cidade;
                delete updateData.cidade;
            }
        }

        if (targetTable === 'leads_master') {
            if (updateData.cidade) {
                updateData.city = updateData.cidade;
                delete updateData.cidade;
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
            .select('id, name, phone, email, source, origem, status, ai_score, ai_classification, vehicle_interest, assigned_consultant_id, created_at, updated_at, vendedor, resumo')
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
