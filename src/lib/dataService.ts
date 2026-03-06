import { supabase } from './supabase';
import { Lead, Campaign, Sale, Purchase, InventoryItem, LeadStatus, AIClassification } from './types';

// ============ PERFORMANCE: In-Memory Cache ============
// Prevents redundant Supabase queries on re-renders & page navigations
interface CacheEntry<T> {
    data: T;
    expiry: number;
}

const _cache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        _cache.delete(key);
        return null;
    }
    return entry.data as T;
}

function cacheSet<T>(key: string, data: T, ttlMs: number): void {
    _cache.set(key, { data, expiry: Date.now() + ttlMs });
}

function cacheInvalidate(...patterns: string[]): void {
    for (const key of _cache.keys()) {
        if (patterns.some(p => key.startsWith(p))) {
            _cache.delete(key);
        }
    }
}

// Cache TTLs (in ms)
const TTL = {
    LEADS: 30_000,         // 30s â€” leads refresh often
    CONSULTANTS: 120_000,  // 2min â€” rarely changes
    INVENTORY: 120_000,    // 2min â€” stock doesn't shift every second
    CAMPAIGNS: 60_000,     // 1min
    METRICS: 30_000,       // 30s
};

// ============ END Cache ============

// LOCKS CONCORRENCIAIS: Previnem falhas por StrictMode do React ou duplo clique, evitando sobrecarga no Banco
let isSyncingLeads = false;
let isDistributingLeads = false;

export const dataService = {
    // Leads
    async getLeads(consultantId?: string, leadId?: string) {
        // PERF: Rate-limit auto-distribution to once per 30s
        const distKey = 'auto_dist_last';
        const lastDist = cacheGet<number>(distKey);
        if (!lastDist) {
            cacheSet(distKey, Date.now(), 30_000);
            this.autoDistributePendingCRM26().catch(err => console.error("Distribute Error:", err));
        }

        // PERF: Cache the consultant name lookup
        let consultantName = undefined;
        if (consultantId) {
            const cNameKey = `consultant_name_${consultantId}`;
            consultantName = cacheGet<string>(cNameKey);
            if (!consultantName) {
                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('name')
                    .eq('id', consultantId)
                    .single();
                consultantName = consultant?.name;
                if (consultantName) cacheSet(cNameKey, consultantName, TTL.CONSULTANTS);
            }
        }

        // PERF: Cache leads by consultantId
        const cacheKey = `leads_${consultantId || 'all'}_${leadId || 'none'}`;
        const cached = cacheGet<Lead[]>(cacheKey);
        if (cached) return cached;

        try {
            const [crm26Leads, mainLeads] = await Promise.all([
                this.getLeadsCRM26(consultantName, true, !!leadId),
                this.getLeadsManos(consultantId, leadId)
            ]);

            const unifiedLeads = [...mainLeads, ...crm26Leads].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            cacheSet(cacheKey, unifiedLeads, TTL.LEADS);
            return unifiedLeads;
        } catch (err) {
            console.error("Error fetching leads from unified sources:", err);
            return [];
        }
    },

    async syncAssignedLeadsToMain() {
        if (isSyncingLeads) return;
        isSyncingLeads = true;

        try {


            // 1. Fetch un-sent leads from CRM 26 that HAVE a vendedor
            const { data: leadsToSync } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('*')
                .not('vendedor', 'is', null)
                .eq('enviado', false)
                .limit(10);

            if (leadsToSync && leadsToSync.length > 0) {
                const { data: consultants } = await supabase.from('consultants_manos_crm').select('id, name');

                for (const lead of leadsToSync) {
                    const consultant = consultants?.find(c => {
                        if (!c.name || !lead.vendedor) return false;
                        const firstName = c.name.trim().split(' ')[0].toLowerCase();
                        return lead.vendedor.toLowerCase().includes(firstName);
                    });
                    if (consultant) {
                        await this.promoteLeadToMain(lead, 'crm26', consultant.id);
                    }
                }
            }

            // 2. Fetch from legacy leads_distribuicao too
            const { data: legacyToSync } = await supabase
                .from('leads_distribuicao')
                .select('*')
                .not('vendedor', 'is', null)
                .eq('enviado', false)
                .limit(10);

            if (legacyToSync && legacyToSync.length > 0) {
                const { data: consultants } = await supabase.from('consultants_manos_crm').select('id, name');
                for (const lead of legacyToSync) {
                    const consultant = consultants?.find(c => {
                        if (!c.name || !lead.vendedor) return false;
                        const firstName = c.name.trim().split(' ')[0].toLowerCase();
                        return lead.vendedor.toLowerCase().includes(firstName);
                    });
                    if (consultant) {
                        await this.promoteLeadToMain(lead, 'legacy', consultant.id);
                    }
                }
            }
        } finally {
            isSyncingLeads = false;
        }
    },

    async promoteLeadToMain(sourceLead: any, source: 'crm26' | 'legacy', consultantId: string) {
        // Clean phone for duplicate check
        const cleanPhone = (sourceLead.telephone || sourceLead.telefone || '').replace(/\D/g, '');
        if (!cleanPhone) return;

        // Check if already exists in main
        const { data: existing } = await supabase
            .from('leads_manos_crm')
            .select('id')
            .eq('phone', cleanPhone)
            .limit(1);

        if (existing && existing.length > 0) {
            // Already exists, just mark as sent in source to stop syncing
            await this.markLeadAsSent(sourceLead.id, source);
            return;
        }

        // Mapping fields
        const leadData: Partial<Lead> = {
            name: sourceLead.nome || sourceLead.name || 'Lead Importado',
            phone: cleanPhone,
            vehicle_interest: sourceLead.interesse || sourceLead.vehicle_interest || '',
            region: sourceLead.cidade || sourceLead.region || '',
            assigned_consultant_id: consultantId,
            status: 'received', // New active lead for the consultant, maps to 'Aguardando' stage
            source: sourceLead.origem || sourceLead.source || (source === 'crm26' ? 'WhatsApp' : 'Facebook Leads'),
            ai_score: sourceLead.ai_score || 0,
            ai_classification: sourceLead.ai_classification || 'warm',
            ai_reason: sourceLead.ai_reason || sourceLead.resumo_consultor || '',
            ai_summary: sourceLead.resumo || '',
            carro_troca: sourceLead.troca || sourceLead.carro_troca || '',
            created_at: sourceLead.criado_em || new Date().toISOString()
        };

        const { error: insertError } = await supabase
            .from('leads_manos_crm')
            .insert(leadData);

        if (!insertError) {
            await this.markLeadAsSent(sourceLead.id, source);

        } else {
            console.error("Error promoting lead:", insertError);
        }
    },

    async markLeadAsSent(id: any, source: 'crm26' | 'legacy') {
        const table = source === 'crm26' ? 'leads_distribuicao_crm_26' : 'leads_distribuicao';
        await supabase
            .from(table)
            .update({ enviado: true, atualizado_em: new Date().toISOString() })
            .eq('id', id);
    },

    async getLeadsCRM26(consultantName?: string, includeSent: boolean = false, showRedistributed: boolean = false) {
        // Trigger auto-distribution for any unassigned leads in the background
        this.autoDistributePendingCRM26().catch(console.error);

        let query = supabase
            .from('leads_distribuicao_crm_26')
            .select('*');

        if (!showRedistributed) {
            query = query.not('status', 'eq', 'lost_redistributed');
        }

        query = query.order('criado_em', { ascending: false });

        // Se quisermos apenas os pendentes de sync, setamos false. Mas agora a tabela Ã‰ a principal.
        // if (!includeSent) {
        //   query = query.eq('enviado', false);
        // }

        if (consultantName) {
            const firstName = consultantName.trim().split(' ')[0];
            query = query.ilike('vendedor', `%${firstName}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Error on leads_distribuicao_crm_26:", error);
            return [];
        }
        // PERF: Cache consultant list used for vendedorâ†’id mapping
        let allConsultants = cacheGet<any[]>('consultant_names');
        if (!allConsultants) {
            const { data: consultantsData } = await supabase.from('consultants_manos_crm').select('id, name');
            allConsultants = consultantsData || [];
            cacheSet('consultant_names', allConsultants, TTL.CONSULTANTS);
        }

        // Filter: name and phone are mandatory
        return (data || [])
            .filter(item => item.nome && item.nome.trim() !== '' && item.telefone && item.telefone.trim() !== '')
            .map(item => {
                // Priority 1: Real AI columns (if they were added)
                // Priority 2: JSON metadata inside 'resumo'
                // Priority 3: Fallback mapping based on 'nivel_interesse'

                let aiScore = item.ai_score;
                let aiClass = item.ai_classification;

                // Check for JSON metadata in resumo (fallback persistence)
                if (item.resumo && item.resumo.includes('||IA_DATA||')) {
                    try {
                        const metadataPart = item.resumo.split('||IA_DATA||')[1];
                        const metadata = JSON.parse(metadataPart);
                        aiScore = metadata.score !== undefined ? metadata.score : aiScore;
                        aiClass = metadata.classification || aiClass;
                    } catch (e) {
                        console.warn("Failed to parse metadata from resumo:", e);
                    }
                }

                // Ensure aiScore is 0 if not provided for rigour
                if (aiScore === undefined || aiScore === null) {
                    aiScore = 0;
                    aiClass = 'warm';
                }

                let assignedConsultantId = undefined;
                if (item.vendedor && allConsultants) {
                    const firstName = item.vendedor.trim().split(' ')[0].toLowerCase();
                    const found = allConsultants.find(c => c.name && c.name.toLowerCase().includes(firstName));
                    if (found) assignedConsultantId = found.id;
                }

                // Build ai_summary from best available source
                const rawResumo = (item.resumo || '').split('||IA_DATA||')[0].replace(/\[STATUS:.*?\]\s*/g, '').trim();
                const bestSummary = rawResumo || item.resumo_consultor || '';

                // Determine status: native column > tag in resumo > fallback
                let leadStatus: LeadStatus = 'received';
                if (item.status && item.status !== '') {
                    // Normalizar 'NOVO' para 'received'
                    if (item.status.toUpperCase() === 'NOVO') {
                        leadStatus = 'received';
                    } else {
                        leadStatus = item.status as LeadStatus;
                    }
                } else if (item.resumo) {
                    const statusMatch = item.resumo.match(/\[STATUS:(.*?)\]/);
                    if (statusMatch) {
                        const s = statusMatch[1].toUpperCase();
                        leadStatus = s === 'NOVO' ? 'received' : statusMatch[1] as LeadStatus;
                    }
                }

                return {
                    id: `crm26_${item.id}`,
                    name: item.nome,
                    phone: item.telefone,
                    vehicle_interest: item.interesse || '',
                    region: item.cidade || '',
                    ai_classification: (aiClass?.toLowerCase() || 'warm') as AIClassification,
                    ai_score: aiScore,
                    ai_reason: item.ai_reason || '',
                    status: leadStatus,
                    created_at: item.criado_em,
                    updated_at: item.atualizado_em || item.criado_em,
                    source: item.origem && item.origem.toLowerCase().includes('facebook') ? 'Facebook Leads' :
                        item.origem && item.origem.toLowerCase().includes('meta') ? 'Facebook Leads' :
                            'WhatsApp',
                    consultants_manos_crm: { name: item.vendedor || 'Pendente' },
                    assigned_consultant_id: assignedConsultantId,
                    ai_summary: bestSummary,
                    carro_troca: item.troca || '',
                    nivel_interesse: item.nivel_interesse,
                    momento_compra: item.momento_compra,
                    resumo_consultor: item.resumo_consultor,
                    proxima_acao: item.proxima_acao,
                    motivo_perda: item.motivo_perda || '',
                    primeiro_vendedor: item.primeiro_vendedor || '',
                    resumo_fechamento: item.resumo_fechamento || '',
                    email: '',
                    origem: (!item.origem || item.origem.toLowerCase() === 'nÃ£o identificado' || item.origem === 'null') ? 'Contato Direto WhatsApp' : item.origem,
                    estimated_ticket: 0
                };
            }) as unknown as Lead[];
    },

    async getLeadsManos(consultantId?: string, leadId?: string) {
        let query = supabase
            .from('leads_manos_crm')
            .select('*, consultants_manos_crm(name)')
            .order('created_at', { ascending: false });

        if (consultantId) {
            query = query.eq('assigned_consultant_id', consultantId);
        }

        if (leadId) {
            const realId = leadId.replace('main_', '');
            query = query.eq('id', realId);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Error on leads_manos_crm:", error);
            return [];
        }

        return (data || []).map(item => ({
            ...item,
            id: `main_${item.id}`,
            consultants_manos_crm: item.consultants_manos_crm || { name: 'Pendente' }
        })) as unknown as Lead[];
    },

    async autoDistributePendingCRM26() {
        if (isDistributingLeads) return;
        isDistributingLeads = true;

        try {
            // Find leads without a vendedor
            const { data: unassigned } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('id, nome')
                .is('vendedor', null)
                .limit(10);

            if (!unassigned || unassigned.length === 0) return;

            for (const lead of unassigned) {
                const nextConsultant = await this.pickNextConsultant(lead.nome);
                if (nextConsultant) {
                    // Update distribution table
                    await supabase
                        .from('leads_distribuicao_crm_26')
                        .update({ vendedor: nextConsultant.name })
                        .eq('id', lead.id);

                    // Update consultant assignment timestamp
                    await supabase
                        .from('consultants_manos_crm')
                        .update({ last_lead_assigned_at: new Date().toISOString() })
                        .eq('id', nextConsultant.id);
                }
            }
        } finally {
            isDistributingLeads = false;
        }
    },

    async pickNextConsultant(leadName?: string) {
        // Special Rules
        if (leadName) {
            const name = leadName.toLowerCase();
            if (name.includes('wilson')) {
                const { data: sergio } = await supabase
                    .from('consultants_manos_crm')
                    .select('*')
                    .ilike('name', '%Sergio%')
                    .single();
                if (sergio) return sergio;
            }
            if (name.includes('rodrigo')) {
                const { data: victor } = await supabase
                    .from('consultants_manos_crm')
                    .select('*')
                    .ilike('name', '%Victor%')
                    .single();
                if (victor) return victor;
            }
        }

        // Round Robin: Active, oldest assignment
        const { data: consultants } = await supabase
            .from('consultants_manos_crm')
            .select('*')
            .eq('is_active', true)
            .order('last_lead_assigned_at', { ascending: true, nullsFirst: true })
            .limit(1);

        if (!consultants || consultants.length === 0) {
            return null;
        }

        return consultants[0];
    },

    async getOldLeads(consultantId?: string) {
        let query = supabase
            .from('leads_manos_crm')
            .select('*, consultants_manos_crm(name)')
            .in('status', ['closed', 'lost'])
            .order('created_at', { ascending: false });

        if (consultantId) {
            query = query.eq('assigned_consultant_id', consultantId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async getDistributedLeads(consultantId?: string) {
        let consultantName = undefined;
        if (consultantId && consultantId.length > 30) { // Likely a UUID/Auth ID
            const { data: consultant } = await supabase
                .from('consultants_manos_crm')
                .select('name')
                .eq('auth_id', consultantId)
                .maybeSingle();
            consultantName = consultant?.name;
        }

        // 2. Fetch from leads_distribuicao (vendedor is name)
        let queryArchive = supabase
            .from('leads_distribuicao')
            .select('*');
        if (consultantId) {
            if (consultantName) {
                queryArchive = queryArchive.or(`vendedor.ilike.%${consultantName.split(' ')[0]}%,vendedor.eq.${consultantId}`);
            } else {
                queryArchive = queryArchive.eq('vendedor', consultantId);
            }
        }

        // 3. Fetch from main CRM (closed/lost/perca)
        // We include common variations of lost status used historically
        let queryMain = supabase
            .from('leads_manos_crm')
            .select('*')
            .or('status.in.(closed,lost,post_sale,lost_redistributed),status.ilike.%perca%,status.ilike.%perdido%,status.ilike.%contato%');

        if (consultantId) {
            queryMain = queryMain.eq('assigned_consultant_id', consultantId);
        }

        // 4. Fetch from secondary CRM (closed/lost)
        let queryCrm26 = supabase
            .from('leads_distribuicao_crm_26')
            .select('*')
            .or('status.in.(closed,lost,post_sale,lost_redistributed),status.ilike.%perca%,status.ilike.%perdido%,status.ilike.%contato%');

        if (consultantId) {
            if (consultantName) {
                queryCrm26 = queryCrm26.or(`vendedor.ilike.%${consultantName.split(' ')[0]}%,vendedor.eq.${consultantId}`);
            } else {
                queryCrm26 = queryCrm26.eq('vendedor', consultantId);
            }
        }

        const [resArchive, resMain, resCrm26] = await Promise.all([
            queryArchive,
            queryMain,
            queryCrm26
        ]);

        // Virtual IDs to prevent React Key Collisions (prefix-table-id)
        const archiveLeads = (resArchive.data || []).map((l: any) => ({
            ...l,
            id: `dist_${l.id}`,
            real_id: l.id,
            source_table: 'leads_distribuicao'
        }));

        const mainLeads = (resMain.data || []).map((l: any) => ({
            id: `main_${l.id}`,
            real_id: l.id,
            nome: l.name,
            telefone: l.phone,
            vendedor: l.assigned_consultant_id,
            origem: l.source || l.origem,
            interesse: l.vehicle_interest,
            resumo: l.ai_summary || l.observacoes,
            ai_score: l.ai_score,
            ai_classification: l.ai_classification,
            ai_reason: l.ai_reason,
            status: l.status,
            enviado: true,
            criado_em: l.created_at,
            atualizado_em: l.updated_at,
            source_table: 'leads_manos_crm'
        }));

        const crm26Leads = (resCrm26.data || []).map((l: any) => ({
            ...l,
            id: `crm26_${l.id}`,
            real_id: l.id,
            source_table: 'leads_distribuicao_crm_26'
        }));

        // Deduplicate: If same phone/name exists in multiple tables, prefer the archive one or most recent
        const allLeadsRaw = [...archiveLeads, ...mainLeads, ...crm26Leads];
        const seen = new Set();
        const deduplicated = allLeadsRaw.filter(lead => {
            const key = `${lead.telefone}_${lead.nome?.toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return deduplicated.map((lead: any) => {
            let ai_classification = lead.ai_classification;
            let ai_reason = lead.ai_reason;
            let resumo = lead.resumo;

            if (resumo && resumo.includes('||IA_DATA||')) {
                const parts = resumo.split('||IA_DATA||');
                resumo = parts[0].trim();
                try {
                    const iaData = JSON.parse(parts[1].trim());
                    if (!ai_classification) ai_classification = iaData.classification;
                    if (!ai_reason) ai_reason = iaData.reason;
                } catch (e) {
                    console.warn("Error parsing IA_DATA for lead", lead.id, e);
                }
            }

            return {
                ...lead,
                ai_classification: (ai_classification || 'warm') as AIClassification,
                ai_reason: ai_reason || '',
                resumo: resumo || ''
            };
        });
    },

    async updateDistributedLeadAI(id: any, aiData: any, sourceTable: string = 'leads_distribuicao') {
        // First, get the current lead to preserve the original resumo/summary
        const resumoColumn = sourceTable === 'leads_manos_crm' ? 'ai_summary' : 'resumo';

        const { data: currentLead, error: fetchError } = await supabase
            .from(sourceTable)
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // Clean resumo (remove old legacy metadata if exists)
        let cleanResumo = currentLead?.[resumoColumn] || '';
        if (cleanResumo.includes('||IA_DATA||')) {
            cleanResumo = cleanResumo.split('||IA_DATA||')[0].trim();
        }

        // Prepare new data structure for fallback
        const iaMetadataStr = JSON.stringify({
            classification: aiData.ai_classification,
            reason: aiData.ai_reason,
            nivel_interesse: aiData.nivel_interesse,
            momento_compra: aiData.momento_compra
        });

        // Final fallback string
        const finalResumo = `${cleanResumo} ||IA_DATA|| ${iaMetadataStr}`.trim();

        // Prepare update data mapping for different tables
        const updateData: any = {
            ai_score: aiData.ai_score,
            ai_classification: aiData.ai_classification,
            ai_reason: aiData.ai_reason,
            atualizado_em: new Date().toISOString(),
            [resumoColumn]: finalResumo
        };

        // Add additional fields if they exist in the target table
        if (aiData.nivel_interesse) updateData.nivel_interesse = aiData.nivel_interesse;
        if (aiData.momento_compra) updateData.momento_compra = aiData.momento_compra;
        if (aiData.resumo_consultor) updateData.resumo_consultor = aiData.resumo_consultor;
        if (aiData.proxima_acao) updateData.proxima_acao = aiData.proxima_acao;

        const { error } = await supabase
            .from(sourceTable)
            .update(updateData)
            .eq('id', id);

        if (error) {
            console.error(`Error updating lead AI in ${sourceTable}:`, error);
            // Fallback: strictly update only the resumo if everything else fails (legacy schema)
            await supabase.from(sourceTable).update({ [resumoColumn]: finalResumo }).eq('id', id);
        }
    },

    // Legacy alias to maintain compatibility during development
    async updateDistributedLeadClassification(id: number, ai_classification: string, ai_reason?: string) {
        return this.updateDistributedLeadAI(id, { ai_classification, ai_reason });
    },

    async distributeOldLeads(leadIds: number[], vendedores: string[]) {
        if (vendedores.length === 0) throw new Error("Nenhum consultor disponÃ­vel para distribuiÃ§Ã£o.");

        const timestamp = new Date().toISOString();
        const updates = leadIds.map((id, index) => {
            const vendedor = vendedores[index % vendedores.length];
            return supabase
                .from('leads_distribuicao')
                .update({
                    vendedor,
                    enviado: true,
                    atualizado_em: timestamp
                })
                .eq('id', id);
        });

        const results = await Promise.all(updates);
        const firstError = results.find(r => r.error)?.error;

        // Retry without atualizado_em if it fails (graceful degradation)
        if (firstError && (firstError.code === '42703' || firstError.message?.toLowerCase().includes('atualizado_em'))) {
            console.warn("âš ï¸ Column 'atualizado_em' missing in leads_distribuicao. Retrying distribution without it.");
            const retryUpdates = leadIds.map((id, index) => {
                const vendedor = vendedores[index % vendedores.length];
                return supabase
                    .from('leads_distribuicao')
                    .update({ vendedor, enviado: true })
                    .eq('id', id);
            });
            const retryResults = await Promise.all(retryUpdates);
            const retryError = retryResults.find(r => r.error)?.error;
            if (retryError) throw retryError;
            return retryResults;
        }

        if (firstError) throw firstError;
        return results;
    },

    async getConsultants() {
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
    },

    async assignConsultant(leadId: string, consultantId: string) {
        let table = 'leads_distribuicao';
        let realId: any = leadId;

        if (leadId.startsWith('crm26_')) {
            table = 'leads_distribuicao_crm_26';
            realId = leadId.replace('crm26_', '');
        } else if (leadId.startsWith('main_')) {
            table = 'leads_manos_crm';
            realId = leadId.replace('main_', '');
        } else if (leadId.startsWith('dist_')) {
            table = 'leads_distribuicao';
            realId = leadId.replace('dist_', '');
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
            await this.logHistory(realId, 'contacted', undefined, `Lead ${consultantId ? 'atribuído para ' + consultantName : 'desatribuído'} manualmente.`);
        }
    },

    async updateLeadStatus(leadId: string, status: LeadStatus, oldStatus?: LeadStatus, notes?: string, motivo_perda?: string, resumo_fechamento?: string) {
        let table = 'leads_manos_crm';
        let realId: any = leadId;

        if (leadId.startsWith('crm26_')) {
            table = 'leads_distribuicao_crm_26';
            realId = leadId.replace('crm26_', '');
        } else if (leadId.startsWith('main_')) {
            table = 'leads_manos_crm';
            realId = leadId.replace('main_', '');
        } else if (leadId.startsWith('dist_')) {
            table = 'leads_distribuicao';
            realId = leadId.replace('dist_', '');
        }

        // REDISTRIBUTION LOGIC
        // Target consultants: Victor, Sergio, Wilson
        // Rules: 
        // 1. Status is 'lost' or 'post_sale' (Sem Contato)
        // 2. Redistribute among the 3, excluding current one
        // 3. Status changes to 'lost_redistributed' to hide from main Kanban

        let targetStatus = status;
        const isRedistributionStatus = status === 'lost' || status === 'post_sale' || (status as any) === 'Sem Contato';
        const isRedistributionReason = motivo_perda === 'Sem contato/Frio' || motivo_perda === 'Perda Total' || resumo_fechamento?.includes('Perda Total');

        if (isRedistributionStatus && isRedistributionReason) {
            targetStatus = 'lost_redistributed' as any;

            try {
                // Get current lead to know current consultant
                const { data: currentLead } = await supabase.from(table).select('*').eq('id', realId).single();
                const currentConsultantName = currentLead?.vendedor || '';
                const currentConsultantId = currentLead?.assigned_consultant_id || '';

                // Get target consultants
                const { data: allConsultants } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, name')
                    .eq('is_active', true);

                const participants = ['Victor', 'Sergio', 'Wilson'];
                const filteredConsultants = allConsultants?.filter(c =>
                    participants.some(p => c.name.toLowerCase().includes(p.toLowerCase())) &&
                    c.id !== currentConsultantId &&
                    !currentConsultantName.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
                ) || [];

                if (filteredConsultants.length > 0) {
                    const next = filteredConsultants[Math.floor(Math.random() * filteredConsultants.length)];


                    const redistributionPayload: any = {
                        status: targetStatus,
                        atualizado_em: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    if (table === 'leads_manos_crm') {
                        redistributionPayload.assigned_consultant_id = next.id;
                    } else {
                        redistributionPayload.vendedor = next.name;
                        redistributionPayload.enviado = true;
                    }

                    if (motivo_perda) redistributionPayload.motivo_perda = motivo_perda;
                    if (resumo_fechamento) redistributionPayload.resumo_fechamento = resumo_fechamento;

                    const { error: redError } = await supabase
                        .from(table)
                        .update(redistributionPayload)
                        .eq('id', realId);

                    if (redError) throw redError;

                    // Log the redistribution
                    if (table === 'leads_manos_crm') {
                        await this.logHistory(realId, targetStatus, oldStatus, `Lead redistribuÃ­do para ${next.name} (${motivo_perda})`);
                    }

                    return; // Exit after redistribution
                }
            } catch (err) {
                console.error("Critical error in redistribution logic:", err);
                // Fallback to normal status update if redistribution fails
            }
        }

        const now = new Date().toISOString();
        const updatePayload: any = {
            status: targetStatus
        };

        // Table-specific timestamp columns
        if (table === 'leads_manos_crm') {
            updatePayload.updated_at = now;
        } else {
            updatePayload.atualizado_em = now;
        }

        if (motivo_perda) updatePayload.motivo_perda = motivo_perda;
        if (resumo_fechamento) updatePayload.resumo_fechamento = resumo_fechamento;
        if (notes) updatePayload.notas = notes;

        const { error } = await supabase
            .from(table)
            .update(updatePayload)
            .eq('id', realId);

        if (error) {
            console.warn(`Error updating status in ${table}, trying fallback:`, error);
            // Fallback for legacy schemas or missing timestamp columns
            if (table === 'leads_distribuicao_crm_26') {
                const { data } = await supabase.from(table).select('resumo').eq('id', realId).single();
                let resumo = data?.resumo || '';
                const statusMarker = `[STATUS:${targetStatus}]`;
                if (!resumo.includes('[STATUS:')) resumo += ` ${statusMarker}`;
                else resumo = resumo.replace(/\[STATUS:.*?\]/, statusMarker);

                // CRITICAL: Also update the status column if it exists, to prevent reverts on load
                const { error: fallbackError } = await supabase.from(table).update({ resumo, status: targetStatus }).eq('id', realId);
                if (fallbackError) throw fallbackError;
            } else {
                // Secondary fallback for other tables, try updating just the status
                const { error: fallbackError } = await supabase.from(table).update({ status: targetStatus }).eq('id', realId);
                if (fallbackError) throw fallbackError;
            }
        }

        if (table === 'leads_manos_crm') {
            await this.logHistory(realId, targetStatus, oldStatus, notes);

            // Meta CAPI sync
            const { data: lead } = await supabase.from('leads_manos_crm').select('phone').eq('id', realId).single();
            if (lead?.phone) {
                await this.enviarEventoLeadMeta(lead);
            }
        }

        // PERF: Invalidate leads cache after status mutation
        cacheInvalidate('leads_');
    },

    /**
     * Envia evento de Lead para a Meta Conversions API via server-side route.
     */
    async enviarEventoLeadMeta(lead: { phone: string }) {
        if (!lead.phone) return;

        try {
            // ImportaÃ§Ã£o dinÃ¢mica do utility para preparar o payload (roda no client mas a API Ã© server-side)
            const { prepareMetaLeadPayload } = await import('./meta-capi');
            const payload = prepareMetaLeadPayload(lead.phone);


            const response = await fetch('/api/meta-capi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Erro desconhecido na Meta CAPI');
            }

            return result;
        } catch (err) {
            console.error("âŒ Failed to send lead event to Meta:", err);
            throw err;
        }
    },

    async reactivateLead(leadId: string) {
        return this.updateLeadStatus(leadId, 'received' as LeadStatus, undefined, 'Lead reativado manualmente da Ã¡rea de reativaÃ§Ã£o.');
    },

    async updateLeadAI(leadId: string, aiData: { ai_score: number, ai_classification: string, ai_reason: string }) {
        if (leadId.startsWith('crm26_')) {
            const realId = leadId.replace('crm26_', '');
            const { data, error } = await supabase
                .from('leads_distribuicao_crm_26')
                .update({
                    ai_score: aiData.ai_score,
                    ai_classification: aiData.ai_classification,
                    ai_reason: aiData.ai_reason,
                    // Keep old behavior just in case someone relies on this format before schema rebuild cache
                    resumo: `[${aiData.ai_classification.toUpperCase()}] ${aiData.ai_reason}`
                })
                .eq('id', realId);

            if (error) throw error;
            return data;
        }

        const { data, error } = await supabase
            .from('leads_manos_crm')
            .update({
                ...aiData,
                updated_at: new Date().toISOString()
            })
            .eq('id', leadId);

        if (error) throw error;
        return data;
    },

    async updateLeadDetails(leadId: string, details: Partial<Lead>) {
        const isCRM26 = leadId.startsWith('crm26_');
        const isLegacy = leadId.startsWith('dist_');
        const isMain = leadId.startsWith('main_');

        let table = 'leads_manos_crm'; // Default to main
        if (isCRM26) table = 'leads_distribuicao_crm_26';
        else if (isLegacy) table = 'leads_distribuicao';
        else if (isMain) table = 'leads_manos_crm';

        const realId = leadId.replace(/crm26_|main_|dist_/, '');

        const updateObj: any = {};

        if (isCRM26) {
            // CRM26 Table (nome, telefone, interesse, troca, cidade, etc)
            if (details.name !== undefined) updateObj.nome = details.name;
            if (details.phone !== undefined) updateObj.telefone = details.phone.replace(/\D/g, '');
            if (details.vehicle_interest !== undefined) updateObj.interesse = details.vehicle_interest;
            if (details.carro_troca !== undefined) updateObj.troca = details.carro_troca;
            if (details.region !== undefined) updateObj.cidade = details.region;
            if (details.status !== undefined) updateObj.status = details.status;

            // AI Fields
            if (details.ai_score !== undefined) updateObj.ai_score = details.ai_score;
            if (details.ai_classification !== undefined) updateObj.ai_classification = details.ai_classification;
            if (details.ai_reason !== undefined) updateObj.ai_reason = details.ai_reason;
            if (details.ai_summary !== undefined) updateObj.resumo = details.ai_summary;
            if (details.nivel_interesse !== undefined) updateObj.nivel_interesse = details.nivel_interesse;
            if (details.momento_compra !== undefined) updateObj.momento_compra = details.momento_compra;
            if (details.resumo_consultor !== undefined) updateObj.resumo_consultor = details.resumo_consultor;
            if (details.proxima_acao !== undefined) updateObj.proxima_acao = details.proxima_acao;
            if (details.valor_investimento !== undefined) updateObj.valor_investimento = details.valor_investimento;
            if (details.metodo_compra !== undefined) updateObj.metodo_compra = details.metodo_compra;
            if (details.prazo_troca !== undefined) updateObj.prazo_troca = details.prazo_troca;

            updateObj.atualizado_em = new Date().toISOString();
        } else {
            // Standard / Main Table
            if (details.name !== undefined) updateObj.name = details.name;
            if (details.phone !== undefined) updateObj.phone = details.phone;
            if (details.email !== undefined) updateObj.email = details.email;
            if (details.vehicle_interest !== undefined) updateObj.vehicle_interest = details.vehicle_interest;
            if (details.carro_troca !== undefined) updateObj.carro_troca = details.carro_troca;
            if (details.valor_investimento !== undefined) updateObj.valor_investimento = details.valor_investimento;
            if (details.status !== undefined) updateObj.status = details.status;
            if (details.ai_score !== undefined) updateObj.ai_score = details.ai_score;
            if (details.ai_classification !== undefined) updateObj.ai_classification = details.ai_classification;
            if (details.ai_reason !== undefined) updateObj.ai_reason = details.ai_reason;
            if (details.ai_summary !== undefined) updateObj.ai_summary = details.ai_summary;
            if (details.scheduled_at !== undefined) updateObj.scheduled_at = details.scheduled_at;

            updateObj.updated_at = new Date().toISOString();
        }

        if (Object.keys(updateObj).length === 0) return null;

        const { data, error } = await supabase
            .from(table)
            .update(updateObj)
            .eq('id', realId);

        if (error) {
            console.error(`Error updating ${table} (ID: ${realId}):`, error);
            throw error;
        }

        cacheInvalidate('leads_');
        return data;
    },

    async logHistory(leadId: string, newStatus: LeadStatus, oldStatus?: LeadStatus, notes?: string) {
        if (leadId.startsWith('crm26_')) {
            // HistÃ³rico nativo no resumo ou tabela dedicada no futuro
            return;
        }

        const realId = leadId.replace(/crm26_|main_|dist_/, '');

        const { error } = await supabase
            .from('interactions_manos_crm')
            .insert([{
                lead_id: realId,
                old_status: oldStatus,
                new_status: newStatus,
                notes: notes,
                created_at: new Date().toISOString()
            }]);
        if (error) {
            // Using warn instead of error to avoid UI-blocking overlays in Next.js development mode
            // the root cause is usually RLS policies missing for this table
            console.warn("History log skipped (RLS/Database):", error.message || error);
        }
    },

    async createLead(leadData: Partial<Lead>) {
        // 1. Duplicate Detection (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: existingLead } = await supabase
            .from('leads_manos_crm')
            .select('id')
            .eq('phone', leadData.phone)
            .gt('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // 2. Insert Lead
        const { data: newLead, error } = await supabase
            .from('leads_manos_crm')
            .insert([{
                ...leadData,
                status: 'received', // Match 'leads_distribuicao_crm_26' default status for consistency
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // 3. Automatic Distribution (Round Robin)
        if (newLead) {
            await this.distributeLead(newLead.id);
            await this.logHistory(newLead.id, 'received', undefined, 'Lead capturado e em processamento de distribuiÃ§Ã£o.');
            return { ...newLead, id: `main_${newLead.id}` };
        }

        return newLead;
    },

    async distributeLead(leadId: string, leadName?: string) {
        const next = await this.pickNextConsultant(leadName);

        if (!next) {
            console.warn("No consultants on duty to receive lead:", leadId);
            return null;
        }

        // Assign to main table
        await supabase
            .from('leads_manos_crm')
            .update({
                assigned_consultant_id: next.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', leadId);

        // Update consultant timestamp
        await supabase
            .from('consultants_manos_crm')
            .update({ last_lead_assigned_at: new Date().toISOString() })
            .eq('id', next.id);

        return next;
    },

    // ROI & Financials
    async getFinancialMetrics(period: string = 'this_month') {
        const cacheKey = `metrics_${period}`;
        const cached = cacheGet<any>(cacheKey);
        if (cached) return cached;

        const now = new Date();
        let startDate: string;

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                break;
            case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
                break;
            case 'this_week':
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
                startDate = new Date(now.setDate(diff)).toISOString();
                break;
            case 'this_month':
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                break;
        }

        // PERF: Fetch all 3 data sources in parallel
        const [campaignsRes, salesRes, leadsCountRes] = await Promise.all([
            supabase.from('campaigns_manos_crm').select('total_spend'),
            supabase.from('sales_manos_crm').select('sale_value, profit_margin').gte('created_at', startDate),
            supabase.from('leads_distribuicao_crm_26').select('*', { count: 'exact', head: true }).gte('criado_em', startDate)
        ]);

        const campaigns = campaignsRes.data;
        const salesPeriod = salesRes.data;
        const totalLeadsPeriod = leadsCountRes.count;

        // Calculate metrics
        const totalSpend = (campaigns as any[])?.reduce((acc: number, c: any) => acc + (Number(c.total_spend) || 0), 0) || 0;
        const totalRevenue = (salesPeriod as any[])?.reduce((acc: number, s: any) => acc + (Number(s.sale_value) || 0), 0) || 0;
        const totalProfit = (salesPeriod as any[])?.reduce((acc: number, s: any) => acc + (Number(s.profit_margin) || 0), 0) || 0;

        const salesCount = salesPeriod?.length || 0;
        const cac = salesCount > 0 ? totalSpend / salesCount : 0;
        const cpl = (totalLeadsPeriod || 0) > 0 ? totalSpend / (totalLeadsPeriod || 1) : 0;
        const roi = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;

        const result = {
            totalSpend,
            totalRevenue,
            totalProfit,
            monthlyRevenue: totalRevenue,
            monthlyProfit: totalProfit,
            salesCount,
            salesCountMonth: salesCount,
            cac,
            cpl,
            roi,
            leadCount: totalLeadsPeriod || 0,
            leadCountMonth: totalLeadsPeriod || 0
        };
        cacheSet(cacheKey, result, TTL.METRICS);
        return result;
    },

    // Consultant Performance
    async getConsultantMetrics(consultantId: string) {
        // Get start of current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // Fetch consultant name for CRM 26 search
        const { data: consultant } = await supabase
            .from('consultants_manos_crm')
            .select('name')
            .eq('id', consultantId)
            .single();

        // Lead counts ONLY from CRM 26 (WhatsApp)
        let totalLeads = 0;
        let statusCounts: Record<string, number> = {};

        if (consultant?.name) {
            const firstName = consultant.name.trim().split(' ')[0];
            const { data: leads26 } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('status, resumo, nome, telefone')
                .ilike('vendedor', `%${firstName}%`);

            if (leads26) {
                // Filter invalid records to match the Central de Leads logic
                const validLeads = leads26.filter(l => l.nome && l.nome.trim() !== '' && l.telefone && l.telefone.trim() !== '');
                totalLeads = validLeads.length;
                validLeads.forEach(l => {
                    let status = l.status || (l.resumo?.match(/\[STATUS:(.*?)\]/)?.[1]) || 'received';
                    statusCounts[status] = (statusCounts[status] || 0) + 1;
                });
            }
        }

        // Sales for the current month
        const { data: salesMonth } = await supabase
            .from('sales_manos_crm')
            .select('sale_value, profit_margin')
            .eq('consultant_id', consultantId)
            .gte('created_at', startOfMonth);

        // All-time sales (total history)
        const { data: salesAll } = await supabase
            .from('sales_manos_crm')
            .select('sale_value, profit_margin')
            .eq('consultant_id', consultantId);

        const salesCount = salesMonth?.length || 0;
        const totalRevenue = salesAll?.reduce((acc, s) => acc + (Number(s.sale_value) || 0), 0) || 0;
        const monthlyRevenue = salesMonth?.reduce((acc, s) => acc + (Number(s.sale_value) || 0), 0) || 0;

        const conversionRate = totalLeads > 0 ? (salesCount / totalLeads) * 100 : 0;

        // Find leads scheduled for today or upcoming (Using CRM26)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let scheduledLeads: any[] = [];
        if (consultant?.name) {
            const firstName = consultant.name.trim().split(' ')[0];
            const { data: crm26Scheduled } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('*')
                .ilike('vendedor', `%${firstName}%`)
                .neq('resumo', null)
                .ilike('resumo', '%STATUS:scheduled%');

            if (crm26Scheduled) {
                // Fast map para o formato esperado pelo frontend
                scheduledLeads = crm26Scheduled.map(item => ({
                    id: `crm26_${item.id}`,
                    name: item.nome,
                    phone: item.telefone,
                    vehicle_interest: item.interesse || '',
                    status: 'scheduled' as LeadStatus,
                    ai_summary: (item.resumo || '').split('||IA_DATA||')[0].replace(/\[STATUS:.*?\]\s*/g, ''),
                    scheduled_at: new Date().toISOString() // Fallback temporÃ¡rio
                }));
            }
        }

        return {
            leadCount: totalLeads,
            salesCount, // Monthly count
            totalRevenue,
            monthlyRevenue,
            conversionRate,
            statusCounts,
            scheduledLeads: scheduledLeads || []
        };
    },

    async getConsultantPerformance() {
        const { data: consultants, error } = await supabase
            .from('consultants_manos_crm')
            .select('*, sales_manos_crm(count)')
            .eq('is_active', true);

        if (error) throw error;

        // Fetch counts EXCLUSIVAMENTE from CRM 26 (WhatsApp) for each consultant
        const performance = await Promise.all((consultants || []).map(async (c: any) => {
            const firstName = c.name ? c.name.trim().split(' ')[0] : '';
            const { count: count26 } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('*', { count: 'exact', head: true })
                .ilike('vendedor', `%${firstName}%`);

            return {
                ...c,
                leads_total_count: (count26 || 0),
                leads_manos_crm: [{ count: (count26 || 0) }] // Maintain backward compatibility for UI props
            };
        }));

        return performance;
    },

    // Inventory
    async getInventory() {
        const cacheKey = 'inventory_all';
        const cached = cacheGet<InventoryItem[]>(cacheKey);
        if (cached) return cached;

        const { data, error } = await supabase
            .from('estoque_manos_crm')
            .select('*');

        if (error) {
            console.error("Supabase error fetching inventory:", error);
            throw error;
        }
        cacheSet(cacheKey, data, TTL.INVENTORY);
        return data as InventoryItem[];
    },

    // Campaigns
    async getCampaigns() {
        const cacheKey = 'campaigns_all';
        const cached = cacheGet<any[]>(cacheKey);
        if (cached) return cached;

        const { data, error } = await supabase
            .from('campaigns_manos_crm')
            .select('*, leads_manos_crm(count)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        cacheSet(cacheKey, data, TTL.CAMPAIGNS);
        return data;
    },

    async getLeadsCountByDateForCampaigns(datePreset: string) {
        let startDate = new Date();
        let endDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        const today = new Date();

        switch (datePreset) {
            case 'today':
                break;
            case 'yesterday':
                startDate.setDate(today.getDate() - 1);
                endDate.setDate(today.getDate() - 1);
                break;
            case 'last_3d':
                startDate.setDate(today.getDate() - 3);
                break;
            case 'last_7d':
                startDate.setDate(today.getDate() - 7);
                break;
            case 'last_14d':
                startDate.setDate(today.getDate() - 14);
                break;
            case 'last_30d':
                startDate.setDate(today.getDate() - 30);
                break;
            case 'this_week': {
                const day = today.getDay();
                const diff = today.getDate() - day + (day == 0 ? -6 : 1);
                startDate.setDate(diff);
                break;
            }
            case 'this_month':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                break;
            case 'maximum':
            default:
                startDate = new Date(2000, 0, 1);
                break;
        }

        // Query leads from leads_manos_crm (legacy table with campaign_id)
        const { data } = await supabase
            .from('leads_manos_crm')
            .select('campaign_id, id')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        // Query leads from CRM26 distribution table
        const { data: data26 } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('origem, id, id_meta, criado_em')
            .gte('criado_em', startDate.toISOString())
            .lte('criado_em', endDate.toISOString());

        // Also fetch Facebook leads specifically (in case date filter misses them)
        const { data: fbLeads } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('id, id_meta, criado_em')
            .not('id_meta', 'is', null);

        // Filter Facebook leads by date in JavaScript (more reliable than DB filter)
        const fbLeadsInRange = (fbLeads || []).filter(l => {
            const d = new Date(l.criado_em);
            return d >= startDate && d <= endDate;
        });

        // Get all campaigns
        const { data: allCampaigns } = await supabase.from('campaigns_manos_crm').select('id, name, platform');

        const countsByCampaign: Record<string, number> = {};
        const countedIds = new Set<string>();

        // Count from leads_manos_crm (direct campaign_id match)
        data?.forEach(lead => {
            if (lead.campaign_id) {
                countsByCampaign[lead.campaign_id] = (countsByCampaign[lead.campaign_id] || 0) + 1;
            }
        });

        // Count Facebook leads from dedicated query (more reliable)
        if (fbLeadsInRange.length > 0 && allCampaigns) {
            const metaCampaign = allCampaigns.find(c =>
                (c.platform || '').toLowerCase().includes('meta')
            );
            if (metaCampaign) {
                countsByCampaign[metaCampaign.id] = (countsByCampaign[metaCampaign.id] || 0) + fbLeadsInRange.length;
                fbLeadsInRange.forEach(l => countedIds.add(l.id));
            }
        }

        // Count remaining leads from data26 (non-Facebook, name-based matching)
        data26?.forEach(lead => {
            if (!allCampaigns || countedIds.has(lead.id)) return;

            const origem = (lead.origem || '').toLowerCase();

            // Skip if it's a Facebook lead (already counted above)
            if (!!lead.id_meta || origem.includes('facebook') || origem.includes('leads facebook')) return;

            // Name-based matching for other leads
            if (lead.origem) {
                const normalize = (s: string) => s.toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[\[\]\-\(\)\.]/g, '')
                    .replace(/\s+/g, ' ').trim();

                const lOrigemNorm = normalize(lead.origem);
                const matchedCampaign = allCampaigns.find(c => {
                    const cNameNorm = normalize(c.name);
                    return lOrigemNorm.includes(cNameNorm) || cNameNorm.includes(lOrigemNorm) ||
                        lead.origem.toLowerCase().includes(c.name.toLowerCase()) ||
                        c.name.toLowerCase().includes(lead.origem.toLowerCase());
                });
                if (matchedCampaign) {
                    countsByCampaign[matchedCampaign.id] = (countsByCampaign[matchedCampaign.id] || 0) + 1;
                }
            }
        });

        return countsByCampaign;
    },

    // AI Daily Marketing Report
    async getDailyMarketingReport() {
        try {
            const { data, error } = await supabase
                .from('marketing_daily_reports_manos_crm')
                .select('*')
                .order('report_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.warn("Marketing report fetch error (likely table missing):", error.message);
                return null;
            }
            return data;
        } catch (err) {
            console.warn("Marketing report catch error:", err);
            return null;
        }
    },

    // Sync Meta Campaigns with advanced analytics (Clicks, Reach, CPC, etc.)
    async syncMetaCampaigns(token: string, adAccountId: string) {


        try {
            // Usando status da campanha mestre para evitar campanhas ocultas por adsets pausados, com limite de 150
            const response = await fetch(`https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?limit=150&fields=name,status,effective_status,objective,insights{spend,inline_link_clicks,reach,impressions,cpc,ctr,cpm,frequency}&access_token=${token}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Meta API error response:", errorText);
                throw new Error(`Meta API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            if (result.error) throw new Error(result.error.message);

            const metaCampaigns = result.data || [];


            const upsertData = metaCampaigns.map((c: { name?: string; status?: string; effective_status?: string; insights?: { data?: Record<string, unknown>[] } }) => {
                const insights = c.insights?.data?.[0] || {};

                // Prioriza o status mestre da campanha, pois se um adset pausar, o effective_status pausa a campanha inteira na API
                const status = (c.status || c.effective_status || '').toLowerCase();



                return {
                    name: c.name || 'Sem Nome',
                    platform: 'Meta Ads',
                    status: status === 'active' ? 'active' : 'paused',
                    total_spend: Number(insights.spend || 0),
                    link_clicks: Number(insights.inline_link_clicks || 0),
                    reach: Number(insights.reach || 0),
                    impressions: Number(insights.impressions || 0),
                    cpc: Number(insights.cpc || 0),
                    ctr: Number(insights.ctr || 0),
                    cpm: Number(insights.cpm || 0),
                    frequency: Number(insights.frequency || 0),
                    updated_at: new Date().toISOString()
                };
            });

            if (upsertData.length > 0) {
                const { error } = await supabase
                    .from('campaigns_manos_crm')
                    .upsert(upsertData, { onConflict: 'name' });

                if (error) {
                    // Fallback: If cpc/ctr/reach columns are missing, try a simpler upsert
                    if (error.code === '42703' || error.message.includes('column') || error.message.includes('not find')) {
                        console.warn("âš ï¸ Advanced analytics columns missing in campaigns_manos_crm. Retrying with basic fields...");
                        const basicUpsertData = upsertData.map((d: any) => ({
                            name: d.name as string,
                            platform: d.platform as string,
                            status: d.status as string,
                            total_spend: d.total_spend as number,
                            updated_at: d.updated_at as string
                        }));
                        const { error: retryError } = await supabase
                            .from('campaigns_manos_crm')
                            .upsert(basicUpsertData, { onConflict: 'name' });

                        if (retryError) throw new Error(`Supabase Upsert Fallback: ${retryError.message}`);
                    } else {
                        throw new Error(`Supabase Upsert: ${error.message}`);
                    }
                }
            }

            // Tentar sicronizar leads reais do Meta se for solicitaÃ§Ã£o geral
            try {
                await this.syncMetaLeads(token, adAccountId);
            } catch (le) {
                console.error("Warning: Lead Gen sync failed but campaign sync continued:", le);
            }

            return upsertData.length;
        } catch (err) {
            console.error("Sync Error:", err);
            throw err;
        }
    },

    // Sincroniza Leads reais do Meta Lead Ads para a tabela de distribuição
    // Fluxo correto da Graph API: Campaigns → Ads → /{ad_id}/leads
    async syncMetaLeads(token: string, adAccountId: string) {
        try {
            let totalImported = 0;

            // 1. Buscar campanhas com objetivo de lead_generation
            const campaignsUrl = `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?fields=id,name,status,objective&limit=50&access_token=${token}`;
            const campaignsRes = await fetch(campaignsUrl);
            if (!campaignsRes.ok) {
                console.error("Meta Campaigns fetch failed:", await campaignsRes.text());
                return 0;
            }
            const campaignsData = await campaignsRes.json();
            const campaigns = campaignsData.data || [];

            // 2. Para cada campanha, buscar os ads
            for (const campaign of campaigns) {
                try {
                    const adsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/ads?fields=id,name,status&limit=100&access_token=${token}`;
                    const adsRes = await fetch(adsUrl);
                    if (!adsRes.ok) continue;

                    const adsData = await adsRes.json();
                    const ads = adsData.data || [];

                    // 3. Para cada ad, buscar leads gerados
                    for (const ad of ads) {
                        try {
                            const leadsUrl = `https://graph.facebook.com/v19.0/${ad.id}/leads?fields=id,created_time,field_data,campaign_id,ad_id,form_id&limit=500&access_token=${token}`;
                            const leadsRes = await fetch(leadsUrl);
                            if (!leadsRes.ok) continue;

                            const leadsData = await leadsRes.json();
                            const rawLeads = leadsData.data || [];

                            if (rawLeads.length === 0) continue;

                            // 4. Buscar IDs de leads já importados para evitar duplicatas
                            const metaIds = rawLeads.map((l: any) => l.id);
                            const { data: existing } = await supabase
                                .from('leads_distribuicao_crm_26')
                                .select('id_meta')
                                .in('id_meta', metaIds);

                            const existingMetaIds = new Set((existing || []).map((e: any) => e.id_meta));

                            // 5. Mapear leads para inserção
                            const leadsToInsert = rawLeads
                                .filter((ml: any) => !existingMetaIds.has(ml.id))
                                .map((ml: any) => {
                                    let phone = '';
                                    let name = '';
                                    let email = '';
                                    let city = '';
                                    let interest = '';

                                    let urgency = '';
                                    let tradeIn = '';

                                    if (ml.field_data) {
                                        ml.field_data.forEach((field: any) => {
                                            const n = (field.name || '').toLowerCase();
                                            const v = field.values?.[0] || '';
                                            const vClean = v.replace(/_/g, ' ').replace(/\./g, '');
                                            if (n.includes('phone') || n.includes('tel') || n === 'phone_number') phone = v;
                                            else if (n.includes('full_name') || n.includes('nome') || n === 'name') name = v;
                                            else if (n.includes('email')) email = v;
                                            else if (n.includes('city') || n.includes('cidade')) city = v;
                                            else if (n.includes('tipo') || n.includes('vehicle') || n.includes('veiculo') || n.includes('buscando')) interest = vClean;
                                            else if (n.includes('urg') || n.includes('fechar')) urgency = vClean;
                                            else if (n.includes('troca') || n.includes('incluir') || n.includes('negocia')) tradeIn = vClean;
                                        });
                                    }

                                    // Build specific interest description
                                    const interestParts: string[] = [];
                                    if (interest) interestParts.push(interest);
                                    if (urgency) interestParts.push(`Urgência: ${urgency}`);
                                    if (tradeIn) interestParts.push(`Troca: ${tradeIn}`);
                                    const specificInterest = interestParts.length > 0 ? interestParts.join(' | ') : 'Busca veículo (via formulário)';

                                    // Limpar telefone
                                    const cleanPhone = phone.replace(/\D/g, '');

                                    return {
                                        nome: name || 'Lead Meta Form',
                                        telefone: cleanPhone,
                                        origem: 'Leads Facebook',
                                        interesse: specificInterest,
                                        cidade: city || '',
                                        status: 'received',
                                        criado_em: ml.created_time || new Date().toISOString(),
                                        vendedor: null,
                                        enviado: false,
                                        id_meta: ml.id,
                                        resumo: `[LEAD FB] Capturado via formulário | Campanha: ${campaign.name} | Ad: ${ad.name}`
                                    };
                                })
                                .filter((l: any) => l.telefone && l.telefone.length >= 8);

                            if (leadsToInsert.length > 0) {
                                // Insert one by one to handle telefone unique constraint
                                for (const lead of leadsToInsert) {
                                    const { error: insertError } = await supabase
                                        .from('leads_distribuicao_crm_26')
                                        .upsert(lead, { onConflict: 'telefone' });

                                    if (insertError) {
                                        // If upsert fails, try to just update id_meta on existing lead
                                        await supabase
                                            .from('leads_distribuicao_crm_26')
                                            .update({ id_meta: lead.id_meta, origem: lead.origem })
                                            .eq('telefone', lead.telefone);
                                    }
                                    totalImported++;
                                }
                            }
                        } catch (adErr) {
                            // Continua para o próximo ad se um falhar
                            continue;
                        }
                    }
                } catch (campaignErr) {
                    // Continua para a próxima campanha se uma falhar
                    continue;
                }
            }

            // Invalidar cache de leads após importação
            if (totalImported > 0) {
                cacheInvalidate('leads_');
            }

            return totalImported;
        } catch (err) {
            console.error("syncMetaLeads error:", err);
            return 0;
        }
    },

    // Sync Google Ads Campaigns
    async syncGoogleCampaigns(creds: any) {


        try {
            const { fetchGoogleAdsCampaigns } = await import('./google-ads');
            const googleCampaigns = await fetchGoogleAdsCampaigns(creds);



            if (googleCampaigns.length > 0) {
                const { error } = await supabase
                    .from('campaigns_manos_crm')
                    .upsert(googleCampaigns, { onConflict: 'name' });

                if (error) throw new Error(`Supabase Google Upsert: ${error.message}`);
            }

            return googleCampaigns.length;
        } catch (err) {
            console.error("Google Sync Error:", err);
            throw err;
        }
    },

    // Clear all campaigns from the database (Zerar tudo)
    async clearCampaigns() {
        const { error } = await supabase
            .from('campaigns_manos_crm')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

        if (error) throw error;
        return true;
    },


    // Sales Recording
    async recordSale(saleData: Partial<Sale>) {
        const { data, error } = await supabase
            .from('sales_manos_crm')
            .insert([{
                ...saleData,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        cacheInvalidate('leads_', 'metrics_');  // Invalidate leads & metrics cache after sale
        return data;
    },

    async recordPurchase(purchaseData: Partial<Purchase>) {
        const { data, error } = await supabase
            .from('purchases_manos_crm')
            .insert([{
                ...purchaseData,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        cacheInvalidate('leads_', 'metrics_');  // Invalidate leads & metrics cache after purchase
        return data;
    },

    async deleteLead(leadId: string) {
        if (leadId.startsWith('crm26_')) {
            const realId = leadId.replace('crm26_', '');

            // Soft delete: Apenas move o status para lost ou exclui da visualizaÃ§Ã£o atual
            // Aqui estamos marcando o status como 'lost' para simular a exclusÃ£o
            const { error } = await supabase
                .from('leads_distribuicao_crm_26')
                .delete()
                .eq('id', realId);

            if (error) throw error;
            return;
        }

        // Removida deleÃ§Ã£o da tabela main_manos_crm
    },

    // Intelligent Analysis Persistence
    async saveIntelligentAnalysis(data: {
        opportunities_of_the_day: string;
        recommended_actions: any[];
        stats: any;
        analyses: any[];
    }) {
        try {
            const { error } = await supabase
                .from('intelligent_analysis_results')
                .insert([{
                    ...data,
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;

        } catch (err) {
            console.error("Error saving intelligent analysis:", err);
            throw err;
        }
    },

    async getLastIntelligentAnalysis() {
        try {
            const { data, error } = await supabase
                .from('intelligent_analysis_results')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch (err) {
            console.error("Error fetching last intelligent analysis:", err);
            return null;
        }
    },

    // New Individual Consultant Analysis Methods
    async saveConsultantAnalysis(consultantId: string, text: string, json: any) {
        try {
            const { error } = await supabase
                .from('crm_daily_analysis')
                .insert([{
                    consultor_id: consultantId,
                    analysis_text: text,
                    analysis_json: json,
                    generated_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h expiry
                }]);

            if (error) throw error;

        } catch (err) {
            console.error("Error saving consultant analysis:", err);
            throw err;
        }
    },

    async getLatestConsultantAnalysis(consultantId: string) {
        try {
            const { data, error } = await supabase
                .from('crm_daily_analysis')
                .select('*')
                .eq('consultor_id', consultantId)
                .order('generated_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch (err: any) {
            console.error("Error fetching consultant analysis:", err.message || err);
            return null;
        }
    }
};
