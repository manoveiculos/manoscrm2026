import { supabase } from './supabase';
import { Lead, Campaign, Sale, InventoryItem, LeadStatus } from './types';

export const dataService = {
    // Leads
    async getLeads(consultantId?: string) {
        // 1. Fetch from main table
        let query = supabase
            .from('leads_manos_crm')
            .select('*, consultants_manos_crm(name)')
            .not('status', 'in', '("closed","lost")')
            .order('created_at', { ascending: false });

        if (consultantId) {
            query = query.eq('assigned_consultant_id', consultantId);
        }

        const { data: mainLeads, error: mainError } = await query;
        if (mainError) throw mainError;

        // 2. Fetch from CRM 26 table
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
            const crm26Leads = await this.getLeadsCRM26(consultantName);
            // Merge and sort
            const merged = [...(mainLeads || []), ...crm26Leads].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            return merged;
        } catch (err) {
            console.warn("Error fetching leads from CRM 26 source:", err);
            return mainLeads || [];
        }
    },

    async getLeadsCRM26(consultantName?: string) {
        let query = supabase
            .from('leads_distribuicao_crm_26')
            .select('*')
            .order('criado_em', { ascending: false });

        if (consultantName) {
            query = query.ilike('vendedor', `%${consultantName}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Error on leads_distribuicao_crm_26:", error);
            return [];
        }

        // Filter: name and phone are mandatory
        // Map to Lead type
        return (data || [])
            .filter(item => item.nome && item.nome.trim() !== '' && item.telefone && item.telefone.trim() !== '')
            .map(item => ({
                id: `crm26_${item.id}`,
                name: item.nome,
                phone: item.telefone,
                vehicle_interest: item.interesse || '',
                region: item.cidade || '',
                ai_classification: item.ai_classification || 'warm',
                status: (item.status as LeadStatus) || (item.resumo?.match(/\[STATUS:(.*?)\]/)?.[1] as LeadStatus) || 'received',
                created_at: item.criado_em,
                updated_at: item.criado_em,
                source: 'WhatsApp',
                consultants_manos_crm: { name: item.vendedor || 'Pendente' },
                ai_summary: (item.resumo || '').replace(/\[STATUS:.*?\]\s*/g, ''),
                carro_troca: item.troca || '',
                // Additional fields for compatibility
                ai_score: 50,
                email: '',
                estimated_ticket: 0
            })) as unknown as Lead[];
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
        return data;
    },

    async updateDistributedLeadClassification(id: number, ai_classification: string) {
        const { data, error } = await supabase
            .from('leads_distribuicao')
            .update({ ai_classification })
            .eq('id', id);

        if (error) throw error;
        return data;
    },

    async getConsultants() {
        const { data, error } = await supabase
            .from('consultants_manos_crm')
            .select('*')
            .eq('status', 'active');
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

        const { data, error } = await supabase
            .from('leads_manos_crm')
            .update({
                ...details,
                updated_at: new Date().toISOString()
            })
            .eq('id', leadId);

        if (error) throw error;
        return data;
    },

    async logHistory(leadId: string, newStatus: LeadStatus, oldStatus?: LeadStatus, notes?: string) {
        if (leadId.startsWith('crm26_')) {
            // Skip history logging for CRM26 leads as it requires a UUID lead_id
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

    async distributeLead(leadId: string) {
        // Find next consultant: active, with oldest assignment
        const { data: consultants } = await supabase
            .from('consultants_manos_crm')
            .select('*')
            .eq('is_active', true)
            .order('last_lead_assigned_at', { ascending: true, nullsFirst: true })
            .limit(1);

        if (!consultants || consultants.length === 0) {
            console.warn("No consultants on duty to receive lead:", leadId);
            return null;
        }

        const next = consultants[0];

        // Assign
        await supabase
            .from('leads_manos_crm')
            .update({
                assigned_consultant_id: next.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', leadId);

        // Update consultant
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
        // 4. Get total lead count (all time)
        const { count: leadCount } = await supabase.from('leads_manos_crm').select('*', { count: 'exact', head: true });
        // 5. Get leads (this month)
        const { count: leadCountMonth } = await supabase.from('leads_manos_crm').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth);

        const totalSpend = campaigns?.reduce((acc: number, c: Campaign) => acc + (Number(c.total_spend) || 0), 0) || 0;
        const totalRevenue = salesAll?.reduce((acc: number, s: Sale) => acc + (Number(s.sale_value) || 0), 0) || 0;
        const totalProfit = salesAll?.reduce((acc: number, s: Sale) => acc + (Number(s.profit_margin) || 0), 0) || 0;

        const monthlyRevenue = salesMonth?.reduce((acc: number, s: Sale) => acc + (Number(s.sale_value) || 0), 0) || 0;
        const monthlyProfit = salesMonth?.reduce((acc: number, s: Sale) => acc + (Number(s.profit_margin) || 0), 0) || 0;

        const salesCount = salesAll?.length || 0;
        const salesCountMonth = salesMonth?.length || 0;

        const cac = salesCount > 0 ? totalSpend / salesCount : 0;
        const cpl = (leadCount || 0) > 0 ? totalSpend / (leadCount || 0) : 0;
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
            leadCount: leadCount || 0,
            leadCountMonth: leadCountMonth || 0
        };
    },

    // Consultant Performance
    async getConsultantMetrics(consultantId: string) {
        // Get start of current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // All-time leads
        const { data: leads } = await supabase
            .from('leads_manos_crm')
            .select('status, created_at')
            .eq('assigned_consultant_id', consultantId);

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

        const leadCount = leads?.length || 0;
        const salesCount = salesMonth?.length || 0;
        const totalRevenue = salesAll?.reduce((acc, s) => acc + (Number(s.sale_value) || 0), 0) || 0;
        const monthlyRevenue = salesMonth?.reduce((acc, s) => acc + (Number(s.sale_value) || 0), 0) || 0;

        const conversionRate = leadCount > 0 ? ((salesMonth?.length || 0) / leadCount) * 100 : 0;

        const statusCounts = leads?.reduce((acc: Record<string, number>, l) => {
            acc[l.status] = (acc[l.status] || 0) + 1;
            return acc;
        }, {}) || {};

        // Find leads scheduled for today or upcoming
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: scheduled } = await supabase
            .from('leads_manos_crm')
            .select('*')
            .eq('assigned_consultant_id', consultantId)
            .is('scheduled_at', 'not.null')
            .gte('scheduled_at', today.toISOString())
            .order('scheduled_at', { ascending: true });

        return {
            leadCount,
            salesCount, // Monthly count
            totalRevenue,
            monthlyRevenue,
            conversionRate,
            statusCounts,
            scheduledLeads: scheduled || []
        };
    },

    async getConsultantPerformance() {
        const { data, error } = await supabase
            .from('consultants_manos_crm')
            .select('*, leads_manos_crm(count), sales_manos_crm(count)')
            .eq('is_active', true);

        if (error) throw error;
        return data;
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
        console.log("🚀 Starting advanced analytics sync for account:", adAccountId);

        try {
            const response = await fetch(`https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?fields=name,status,objective,insights{spend,inline_link_clicks,reach,impressions,cpc,ctr}&access_token=${token}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Meta API error response:", errorText);
                throw new Error(`Meta API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            if (result.error) throw new Error(result.error.message);

            const metaCampaigns = result.data || [];

            const upsertData = metaCampaigns.map((c: { name?: string; status?: string; insights?: { data?: Record<string, unknown>[] } }) => {
                const insights = c.insights?.data?.[0] || {};
                return {
                    name: c.name || 'Sem Nome',
                    platform: 'Meta Ads',
                    status: c.status?.toLowerCase() === 'active' ? 'active' : 'paused',
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
            const { error } = await supabase
                .from('leads_distribuicao_crm_26')
                .delete()
                .eq('id', realId);

            if (error) throw error;
            return;
        }

        const { error } = await supabase
            .from('leads_manos_crm')
            .delete()
            .eq('id', leadId);

        if (error) throw error;
    }
};
