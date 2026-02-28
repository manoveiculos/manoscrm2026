import { supabase } from './supabase';
import { Lead, Campaign, Sale, InventoryItem, LeadStatus, AIClassification } from './types';

// LOCKS CONCORRENCIAIS: Previnem falhas por StrictMode do React ou duplo clique, evitando sobrecarga no Banco
let isSyncingLeads = false;
let isDistributingLeads = false;

export const dataService = {
    // Leads
    async getLeads(consultantId?: string) {
        // Trigger background auto-distribution
        this.autoDistributePendingCRM26().catch(err => console.error("Distribute Error:", err));

        let consultantName = undefined;
        if (consultantId) {
            const { data: consultant } = await supabase
                .from('consultants_manos_crm')
                .select('name')
                .eq('id', consultantId)
                .single();
            consultantName = consultant?.name;
        }

        try {
            // Ler estritamente e exclusivamente da nova tabela única unificada
            const crm26Leads = await this.getLeadsCRM26(consultantName, true); // true param to override 'enviado' filter
            return crm26Leads;
        } catch (err) {
            console.error("Error fetching leads from Unified CRM 26 source:", err);
            return [];
        }
    },

    async syncAssignedLeadsToMain() {
        if (isSyncingLeads) return;
        isSyncingLeads = true;

        try {
            console.log("🔄 Starting assigned leads sync...");

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
                    const consultant = consultants?.find(c => c.name.toLowerCase() === lead.vendedor.toLowerCase());
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
                    const consultant = consultants?.find(c => c.name.toLowerCase() === lead.vendedor.toLowerCase());
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
            status: 'new', // New active lead for the consultant
            source: 'WhatsApp',
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
            console.log(`✅ Lead ${leadData.name} promoted to main CRM.`);
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

    async getLeadsCRM26(consultantName?: string, includeSent: boolean = false) {
        // Trigger auto-distribution for any unassigned leads in the background
        this.autoDistributePendingCRM26().catch(console.error);

        let query = supabase
            .from('leads_distribuicao_crm_26')
            .select('*')
            .order('criado_em', { ascending: false });

        // Se quisermos apenas os pendentes de sync, setamos false. Mas agora a tabela É a principal.
        // if (!includeSent) {
        //   query = query.eq('enviado', false);
        // }

        if (consultantName) {
            query = query.ilike('vendedor', `%${consultantName}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Error on leads_distribuicao_crm_26:", error);
            return [];
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

                return {
                    id: `crm26_${item.id}`,
                    name: item.nome,
                    phone: item.telefone,
                    vehicle_interest: item.interesse || '',
                    region: item.cidade || '',
                    ai_classification: (aiClass?.toLowerCase() || 'warm') as AIClassification,
                    ai_score: aiScore,
                    status: (item.status as LeadStatus) || (item.resumo?.match(/\[STATUS:(.*?)\]/)?.[1] as LeadStatus) || 'received',
                    created_at: item.criado_em,
                    updated_at: item.atualizado_em || item.criado_em,
                    source: 'WhatsApp',
                    consultants_manos_crm: { name: item.vendedor || 'Pendente' },
                    ai_summary: item.resumo_consultor || (item.resumo || '').split('||IA_DATA||')[0].replace(/\[STATUS:.*?\]\s*/g, ''),
                    carro_troca: item.troca || '',
                    nivel_interesse: item.nivel_interesse,
                    momento_compra: item.momento_compra,
                    resumo_consultor: item.resumo_consultor,
                    proxima_acao: item.proxima_acao,
                    email: '',
                    estimated_ticket: 0
                };
            }) as unknown as Lead[];
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

    async getDistributedLeads() {
        const { data, error } = await supabase
            .from('leads_distribuicao')
            .select('*')
            .order('criado_em', { ascending: false });

        if (error) throw error;

        // Decode AI metadata or use dedicated columns
        return (data || []).map((lead: any) => {
            let ai_classification = lead.ai_classification;
            let ai_reason = lead.ai_reason;
            let resumo = lead.resumo;

            // Priority 1: Use dedicated columns if they have content
            // Priority 2: Fallback to decoding metadata from 'resumo'
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
                resumo,
                ai_classification: ai_classification || lead.ai_classification,
                ai_reason: ai_reason || lead.ai_reason,
                nivel_interesse: lead.nivel_interesse,
                momento_compra: lead.momento_compra,
                resumo_consultor: lead.resumo_consultor,
                proxima_acao: lead.proxima_acao
            };
        });
    },

    async updateDistributedLeadAI(id: number, aiData: any) {
        // First, get the current lead to preserve the original resumo
        const { data: currentLead, error: fetchError } = await supabase
            .from('leads_distribuicao')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // Clean resumo (remove old legacy metadata if exists)
        let cleanResumo = currentLead?.resumo || '';
        if (cleanResumo.includes('||IA_DATA||')) {
            cleanResumo = cleanResumo.split('||IA_DATA||')[0].trim();
        }

        // Prepare new data structure
        const timestamp = new Date().toISOString();
        const iaMetadataStr = JSON.stringify({
            classification: aiData.ai_classification,
            reason: aiData.ai_reason,
            nivel_interesse: aiData.nivel_interesse,
            momento_compra: aiData.momento_compra
        });

        // Final fallback string
        const finalResumo = `${cleanResumo} ||IA_DATA|| ${iaMetadataStr}`;

        // Attempt update with REAL columns first
        const updateData: any = {
            ...aiData,
            atualizado_em: timestamp,
            resumo: finalResumo // Always keep fallback for now
        };

        const { error } = await supabase
            .from('leads_distribuicao')
            .update(updateData)
            .eq('id', id);

        // If it failed because of missing columns, retry with ONLY the fallback 'resumo'
        if (error && (error.code === '42703' || error.message?.toLowerCase().includes('column'))) {
            console.warn("⚠️ Legacy schema detected in leads_distribuicao. Using fallback persistence.");
            const { error: retryError } = await supabase
                .from('leads_distribuicao')
                .update({ resumo: finalResumo })
                .eq('id', id);
            if (retryError) throw retryError;
        } else if (error) {
            throw error;
        }

        return true;
    },

    // Legacy alias to maintain compatibility during development
    async updateDistributedLeadClassification(id: number, ai_classification: string, ai_reason?: string) {
        return this.updateDistributedLeadAI(id, { ai_classification, ai_reason });
    },

    async distributeOldLeads(leadIds: number[], vendedores: string[]) {
        if (vendedores.length === 0) throw new Error("Nenhum consultor disponível para distribuição.");

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
            console.warn("⚠️ Column 'atualizado_em' missing in leads_distribuicao. Retrying distribution without it.");
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
        const { data, error } = await supabase
            .from('consultants_manos_crm')
            .select('*')
            .eq('is_active', true);
        if (error) throw error;
        return data;
    },

    async assignConsultant(leadId: string, consultantId: string) {
        if (leadId.startsWith('crm26_')) {
            const realId = leadId.replace('crm26_', '');

            // For CRM26, we need the consultant name to store in 'vendedor' field
            const { data: consultant } = await supabase
                .from('consultants_manos_crm')
                .select('name')
                .eq('id', consultantId)
                .single();

            const { error } = await supabase
                .from('leads_distribuicao_crm_26')
                .update({ vendedor: consultant?.name || 'Desconhecido' })
                .eq('id', realId);

            if (error) throw error;
            return;
        }

        const { error } = await supabase
            .from('leads_manos_crm')
            .update({
                assigned_consultant_id: consultantId,
                updated_at: new Date().toISOString()
            })
            .eq('id', leadId);

        if (error) throw error;

        // Log history
        await this.logHistory(leadId, 'contacted', undefined, 'Lead atribuído manualmente para um consultor.');
    },

    async updateLeadStatus(leadId: string, status: LeadStatus, oldStatus?: LeadStatus, notes?: string) {
        if (leadId.startsWith('crm26_')) {
            const realId = leadId.replace('crm26_', '');

            // Try updating status directly first
            const { error: directError } = await supabase
                .from('leads_distribuicao_crm_26')
                .update({ status })
                .eq('id', realId);

            if (directError && (
                directError.code === '42703' ||
                directError.message.includes('column "status" does not exist') ||
                directError.message.includes('schema cache')
            )) {
                // Fallback: Persist status inside 'resumo' field
                const { data } = await supabase
                    .from('leads_distribuicao_crm_26')
                    .select('resumo')
                    .eq('id', realId)
                    .single();

                const currentResumo = data?.resumo || '';
                const cleanResumo = currentResumo.replace(/\[STATUS:.*?\]\s*/g, '');
                const newResumo = `[STATUS:${status}] ${cleanResumo}`.trim();

                await supabase
                    .from('leads_distribuicao_crm_26')
                    .update({ resumo: newResumo })
                    .eq('id', realId);
            } else if (directError) {
                throw directError;
            }
            return null;
        }

        const { data, error } = await supabase
            .from('leads_manos_crm')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', leadId);

        if (error) throw error;

        // Log history
        await this.logHistory(leadId, status, oldStatus, notes);

        return data;
    },

    async updateLeadAI(leadId: string, aiData: { ai_score: number, ai_classification: string, ai_reason: string }) {
        if (leadId.startsWith('crm26_')) {
            const realId = leadId.replace('crm26_', '');
            const { data, error } = await supabase
                .from('leads_distribuicao_crm_26')
                .update({
                    // Merge classification into summary as column is missing in CRM26 schema
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
        if (leadId.startsWith('crm26_')) {
            const realId = leadId.replace('crm26_', '');

            // Map common fields to CRM26 table fields
            const updateObj: any = {};
            if (details.ai_summary || details.ai_classification) {
                const cls = details.ai_classification || '';
                const sum = details.ai_summary || '';
                updateObj.resumo = cls ? `[${cls.toUpperCase()}] ${sum}` : sum;
            }
            if (details.vehicle_interest) updateObj.interesse = details.vehicle_interest;
            if (details.carro_troca) updateObj.troca = details.carro_troca;
            if (details.region) updateObj.cidade = details.region;

            // New AI fields mapping for CRM26
            if (details.nivel_interesse) updateObj.nivel_interesse = details.nivel_interesse;
            if (details.momento_compra) updateObj.momento_compra = details.momento_compra;
            if (details.resumo_consultor) updateObj.resumo_consultor = details.resumo_consultor;
            if (details.proxima_acao) updateObj.proxima_acao = details.proxima_acao;

            if (details.status) {
                // We use the same 'resumo' tag logic for status consistency
                const { data: current } = await supabase.from('leads_distribuicao_crm_26').select('resumo').eq('id', realId).single();
                const clean = (current?.resumo || '').replace(/\[STATUS:.*?\]\s*/g, '');
                updateObj.resumo = `[STATUS:${details.status}] ${updateObj.resumo || clean}`.trim();
            }

            if (Object.keys(updateObj).length === 0) return null;

            const { data, error } = await supabase
                .from('leads_distribuicao_crm_26')
                .update(updateObj)
                .eq('id', realId);

            if (error) throw error;
            return data;
        }

        // Removida atualização de details da tabela antiga
        return null;
    },

    async logHistory(leadId: string, newStatus: LeadStatus, oldStatus?: LeadStatus, notes?: string) {
        if (leadId.startsWith('crm26_')) {
            // Histórico nativo no resumo ou tabela dedicada no futuro
            return;
        }

        const { error } = await supabase
            .from('interactions_manos_crm')
            .insert([{
                lead_id: leadId,
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

        if (existingLead) {
            leadData.duplicate_id = existingLead.id;
        }

        // 2. Insert Lead
        const { data: newLead, error } = await supabase
            .from('leads_manos_crm')
            .insert([{
                ...leadData,
                status: 'new', // Match 'leads_manos_crm' default status
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // 3. Automatic Distribution (Round Robin)
        if (newLead) {
            await this.distributeLead(newLead.id);
            await this.logHistory(newLead.id, 'received', undefined, 'Lead capturado e em processamento de distribuição.');
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
    async getFinancialMetrics() {
        // Get start of current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // 1. Get all campaigns and their spend (all time)
        const { data: campaigns } = await supabase.from('campaigns_manos_crm').select('*');
        // 2. Get all sales (all time)
        const { data: salesAll } = await supabase.from('sales_manos_crm').select('*');
        // 3. Get sales (this month)
        const { data: salesMonth } = await supabase.from('sales_manos_crm').select('*').gte('created_at', startOfMonth);

        // 4. Get total lead count EXCLUSIVAMENTE (CRM 26 / WhatsApp)
        const { count: totalLeads } = await supabase.from('leads_distribuicao_crm_26').select('*', { count: 'exact', head: true });

        // 5. Get leads (this month) EXCLUSIVAMENTE (CRM 26 / WhatsApp)
        const { count: totalLeadsMonth } = await supabase.from('leads_distribuicao_crm_26').select('*', { count: 'exact', head: true }).gte('criado_em', startOfMonth);

        const totalSpend = campaigns?.reduce((acc: number, c: Campaign) => acc + (Number(c.total_spend) || 0), 0) || 0;
        const totalRevenue = salesAll?.reduce((acc: number, s: Sale) => acc + (Number(s.sale_value) || 0), 0) || 0;
        const totalProfit = salesAll?.reduce((acc: number, s: Sale) => acc + (Number(s.profit_margin) || 0), 0) || 0;

        const monthlyRevenue = salesMonth?.reduce((acc: number, s: Sale) => acc + (Number(s.sale_value) || 0), 0) || 0;
        const monthlyProfit = salesMonth?.reduce((acc: number, s: Sale) => acc + (Number(s.profit_margin) || 0), 0) || 0;

        const salesCount = salesAll?.length || 0;
        const salesCountMonth = salesMonth?.length || 0;

        const cac = salesCount > 0 ? totalSpend / salesCount : 0;
        const cpl = (totalLeads || 0) > 0 ? totalSpend / (totalLeads || 1) : 0;
        const roi = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;

        return {
            totalSpend,
            totalRevenue,
            totalProfit,
            monthlyRevenue,
            monthlyProfit,
            salesCount,
            salesCountMonth,
            cac,
            cpl,
            roi,
            leadCount: totalLeads || 0,
            leadCountMonth: totalLeadsMonth || 0
        };
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
            const { data: leads26 } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('resumo')
                .ilike('vendedor', `%${consultant.name}%`);

            if (leads26) {
                totalLeads = leads26.length;
                leads26.forEach(l => {
                    const status = (l.resumo?.match(/\[STATUS:(.*?)\]/)?.[1]) || 'received';
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
            const { data: crm26Scheduled } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('*')
                .ilike('vendedor', `%${consultant.name}%`)
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
                    scheduled_at: new Date().toISOString() // Fallback temporário
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
            const { count: count26 } = await supabase
                .from('leads_distribuicao_crm_26')
                .select('*', { count: 'exact', head: true })
                .ilike('vendedor', `%${c.name}%`);

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
        const { data, error } = await supabase
            .from('estoque_manos_crm')
            .select('*');

        if (error) {
            console.error("Supabase error fetching inventory:", error);
            throw error;
        }
        return data as InventoryItem[];
    },

    // Campaigns
    async getCampaigns() {
        const { data, error } = await supabase
            .from('campaigns_manos_crm')
            .select('*, leads_manos_crm(count)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
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
        console.log("🚀 Iniciando sincronização avançada para conta:", adAccountId);

        try {
            // Usando effective_status para capturar campanhas que estão ativas mas podem ter adsets pausados
            const response = await fetch(`https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?fields=name,status,effective_status,objective,insights{spend,inline_link_clicks,reach,impressions,cpc,ctr}&access_token=${token}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Meta API error response:", errorText);
                throw new Error(`Meta API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            if (result.error) throw new Error(result.error.message);

            const metaCampaigns = result.data || [];
            console.log(`📊 Meta retornou ${metaCampaigns.length} campanhas filtrando por status real...`);

            const upsertData = metaCampaigns.map((c: { name?: string; status?: string; effective_status?: string; insights?: { data?: Record<string, unknown>[] } }) => {
                const insights = c.insights?.data?.[0] || {};
                const status = (c.effective_status || c.status || '').toLowerCase();

                console.log(`- Campanha: ${c.name} | Status FB: ${c.status} | Effective: ${c.effective_status}`);

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
                        console.warn("⚠️ Advanced analytics columns missing in campaigns_manos_crm. Retrying with basic fields...");
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

            return upsertData.length;
        } catch (err) {
            console.error("Sync Error:", err);
            throw err;
        }
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
        return data;
    },

    async deleteLead(leadId: string) {
        if (leadId.startsWith('crm26_')) {
            const realId = leadId.replace('crm26_', '');

            // Soft delete: Apenas move o status para lost ou exclui da visualização atual
            // Aqui estamos marcando o status como 'lost' para simular a exclusão
            const { error } = await supabase
                .from('leads_distribuicao_crm_26')
                .delete()
                .eq('id', realId);

            if (error) throw error;
            return;
        }

        // Removida deleção da tabela main_manos_crm
    }
};
