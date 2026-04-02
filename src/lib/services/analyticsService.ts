import { supabase } from './supabaseClients';
import { cacheGet, cacheSet, cacheInvalidate, TTL } from './cacheLayer';

/**
 * SERVIÇO DE MÉTRICAS E ROI
 * Centraliza o cálculo de desempenho do CRM.
 */

export async function getFinancialMetrics(params?: { 
    period?: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'all',
    consultantId?: string,
    customRange?: { start: string, end: string } 
}) {
    const { period = 'this_month', consultantId, customRange } = params || {};
    const cacheKey = `metrics_v2_${period}_${consultantId || 'all'}_${customRange?.start || 'no'}_${customRange?.end || 'no'}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    let startDate: string;
    let endDate: string | undefined = undefined;

    if (customRange) {
        startDate = customRange.start;
        endDate = customRange.end;
    } else {
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                break;
            case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                break;
            case 'this_week':
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                startDate = new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).toISOString();
                break;
            case 'this_year':
                startDate = new Date(now.getFullYear(), 0, 1).toISOString();
                break;
            case 'all':
                startDate = new Date(2024, 0, 1).toISOString();
                break;
            case 'this_month':
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                break;
        }
    }

    // Chamada à RPC Cirúrgica para obter todas as métricas unificadas e deduplicadas
    const { data: metrics, error } = await supabase.rpc('get_crm_metrics_v2', {
        p_consultant_id: consultantId || null,
        p_start_date: startDate,
        p_end_date: endDate || now.toISOString()
    });

    if (error) {
        console.error("Error calling get_crm_metrics_v2:", error);
        throw error;
    }

    const { data: inventoryRes } = await supabase.from('estoque').select('id', { count: 'exact', head: true });

    const result = {
        leadCount: metrics.total_leads,
        salesCount: metrics.total_sales,
        inventoryCount: inventoryRes?.length || 0, // Fallback se necessário
        totalRevenue: metrics.total_revenue,
        totalProfit: metrics.total_profit,
        conversionRate: metrics.conversion_rate,
        funnelData: metrics.funnel_data,
        tactical: metrics.tactical,
        avgResponseTime: await getAverageResponseTime(
            // Limita a janela de cálculo a no máximo 30 dias para evitar distorção com leads antigos
            new Date(Math.max(new Date(startDate).getTime(), Date.now() - 30 * 86_400_000)).toISOString(),
            consultantId
        ),
        responseRate: metrics.total_leads > 0 ? await getResponseRate(startDate, consultantId) : 0,
        cac: 0,
        roi: 0
    };

    cacheSet(cacheKey, result, TTL.METRICS);
    return result;
}

// Fase 2: RPC server-side com fallback heurístico caso a RPC não exista
async function getAverageResponseTime(since: string, consultantId?: string) {
    try {
        // Tenta RPC otimizada (requer migration_fase2_dieta_dados.sql)
        const { data, error } = await supabase.rpc('get_avg_response_time', {
            p_since: since,
            p_consultant_id: consultantId || null
        });

        if (!error) return data ?? 0;

        // Fallback: heurística client-side (caso RPC não exista ainda)
        console.warn('[Analytics] RPC indisponível, usando fallback heurístico');
        return await getAverageResponseTimeFallback(since, consultantId);
    } catch (err) {
        return await getAverageResponseTimeFallback(since, consultantId);
    }
}

// Fallback: calcula tempo médio de resposta via query simples
async function getAverageResponseTimeFallback(since: string, consultantId?: string): Promise<number> {
    try {
        let query = supabase
            .from('leads')
            .select('created_at,first_contact_at,response_time_seconds')
            .gte('created_at', since)
            .not('first_contact_at', 'is', null);

        if (consultantId) query = query.eq('assigned_consultant_id', consultantId);

        const { data } = await query.limit(200);
        if (!data || data.length === 0) return 0;

        const times = data
            .map(l => {
                if (l.response_time_seconds) return l.response_time_seconds / 60;
                if (l.first_contact_at && l.created_at) {
                    return (new Date(l.first_contact_at).getTime() - new Date(l.created_at).getTime()) / 60_000;
                }
                return null;
            })
            .filter((t): t is number => t !== null && t > 0 && t < 1440); // Descarta outliers > 24h

        if (times.length === 0) return 0;
        return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    } catch {
        return 0;
    }
}

async function getResponseRate(since: string, consultantId?: string) {
    // Taxa de resposta = leads com status diferente de 'new'/'received'
    let query = supabase.from('leads').select('status').gte('created_at', since);
    if (consultantId) query = query.eq('assigned_consultant_id', consultantId);
    
    const { data } = await query;
    if (!data || data.length === 0) return 0;
    
    const responded = data.filter(l => !['new', 'received'].includes(l.status)).length;
    return Math.round((responded / data.length) * 100);
}

export async function getCampaigns() {
    const cacheKey = 'campaigns_all_v3';
    const cached = cacheGet<any[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
        .from('campaigns_manos_crm')
        .select('id, name, platform, status, total_spend, meta_results, impressions, link_clicks, reach, cpc, ctr, cpm, frequency, updated_at')
        .order('name');

    if (error) {
        console.error("Supabase error fetching campaigns:", error);
        throw error;
    }
    
    cacheSet(cacheKey, data, TTL.CAMPAIGNS);
    return data;
}

export async function getLeadsCountByDateForCampaigns(datePreset: string) {
    let startDate = new Date();
    let endDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    const today = new Date();

    switch (datePreset) {
        case 'today': break;
        case 'yesterday':
            startDate.setDate(today.getDate() - 1);
            endDate.setDate(today.getDate() - 1);
            break;
        case 'last_3d': startDate.setDate(today.getDate() - 3); break;
        case 'last_7d': startDate.setDate(today.getDate() - 7); break;
        case 'last_14d': startDate.setDate(today.getDate() - 14); break;
        case 'last_30d': startDate.setDate(today.getDate() - 30); break;
        case 'this_month': startDate.setDate(1); break;
        case 'last_month':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'maximum':
        default:
            startDate = new Date(2024, 0, 1); // Epoch do sistema
            break;
    }

    const { data, error } = await supabase
        .from('leads')
        .select('campaign_id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .not('campaign_id', 'is', null);

    if (error) throw error;
    
    const counts: Record<string, number> = {};
    (data || []).forEach(l => {
        if (l.campaign_id) {
            counts[l.campaign_id] = (counts[l.campaign_id] || 0) + 1;
        }
    });
    
    return counts;
}

export async function getSalesRanking(startDate?: string, endDate?: string) {
    try {
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const effectiveStart = startDate || defaultStart;
        const effectiveEnd = endDate || now.toISOString();

        // 1. Buscar Consultores Ativos
        const { data: consultants } = await supabase
            .from('consultants_manos_crm')
            .select('id, name, email')
            .eq('is_active', true);
        
        if (!consultants) return [];

        // 2. Buscar Performance Individual usando a Fonte Única da Verdade (getFinancialMetrics/RPC)
        const ranking = await Promise.all(consultants.map(async (c) => {
            const metrics = await getFinancialMetrics({
                customRange: { start: effectiveStart, end: effectiveEnd },
                consultantId: c.id
            });

            // Score de Elite baseado na saúde do funil (Leads em etapas avançadas vs total)
            // Calculado na RPC ou via funnelData
            const funnel = metrics.funnelData || {};
            const total = metrics.leadCount || 0;
            const advanced = (funnel.contacted || 0) + (funnel.scheduled || 0) + (funnel.visited || 0) + (funnel.proposed || 0) + (funnel.negotiation || 0) + (funnel.closed || 0) + (funnel.comprado || 0);
            const eliteScore = total > 0 ? (advanced / total) * 100 : 0;

            // Origem Principal (Busca simples no lead)
            const { data: sourceData } = await supabase
                .from('leads')
                .select('source, origem')
                .eq('assigned_consultant_id', c.id)
                .gte('created_at', effectiveStart)
                .lte('created_at', effectiveEnd)
                .limit(100);
            
            const sources: Record<string, number> = {};
            (sourceData || []).forEach(l => {
                const s = l.source || l.origem || 'Meta';
                sources[s] = (sources[s] || 0) + 1;
            });
            const topSource = Object.entries(sources).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Meta';

            return {
                id: c.id,
                name: c.name,
                salesCount: metrics.salesCount || 0,
                leadCount: metrics.leadCount || 0,
                conversion: metrics.conversionRate || 0,
                eliteScore: Math.round(eliteScore),
                topSource,
                avgResponseMin: metrics.avgResponseTime || 0
            };
        }));

        // 3. Garantir que a soma do ranking bate com o Total da Gestão Vendas (Admin)
        // Se houver discrepância por 'Vendedor Externo' ou 'Sem Vendedor', o admin mostra o global.
        // O ranking aqui é por consultor cadastrado.
        
        return ranking.sort((a, b) => b.salesCount - a.salesCount || b.conversion - a.conversion);
    } catch (err) {
        console.error("Error in getSalesRanking:", err);
        return [];
    }
}

export async function getRecentSales(limit: number = 5) {
    try {
        const { data, error } = await supabase
            .from('sales')
            .select('id, vehicle_name, consultant_name, sale_value, sale_date')
            .order('sale_date', { ascending: false })
            .limit(limit);

        if (error) throw error;
        
        return (data || []).map(s => ({
            id: s.id,
            lead: { name: s.vehicle_name || 'Venda Direta' },
            consultant: { name: s.consultant_name || 'Equipe' },
            sale_value: s.sale_value,
            created_at: s.sale_date,
            vehicle_interest: s.vehicle_name
        }));
    } catch (err) {
        console.error("Error in getRecentSales:", err);
        return [];
    }
}

export async function getConsultantPerformance() {
    const { data: consultants, error } = await supabase
        .from('consultants_manos_crm')
        .select('id, auth_id, name, email, role, is_active, last_lead_assigned_at');

    if (error) throw error;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const performance = await Promise.all((consultants || []).map(async (c: any) => {
        const { count } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_consultant_id', c.id)
            .gte('created_at', startOfMonth);

        return {
            ...c,
            leads_total_count: (count || 0),
            leads_manos_crm: [{ count: (count || 0) }]
        };
    }));

    return performance;
}

export async function getDailyMarketingReport() {
    try {
        const { data, error } = await supabase
            .from('marketing_daily_reports_manos_crm')
            .select('report_date, summary, recommendations')
            .order('report_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) return null;
        return data;
    } catch (err) {
        return null;
    }
}

export async function saveIntelligentAnalysis(data: any) {
    const { error } = await supabase
        .from('intelligent_analysis_results')
        .insert([{
            ...data,
            created_at: new Date().toISOString()
        }]);
    if (error) throw error;
}

export async function getLastIntelligentAnalysis() {
    const { data, error } = await supabase
        .from('intelligent_analysis_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
}

// ============ MARKETING SYNC METHODS (Migrated from legacy dataService) ============

export async function syncMetaCampaigns(token: string, adAccountId: string) {
    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?limit=250&fields=name,status,effective_status,objective,insights{spend,inline_link_clicks,reach,impressions,cpc,ctr,cpm,frequency,actions}&access_token=${token}`);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        if (result.error) throw new Error(result.error.message);

        const metaCampaigns = result.data || [];
        const upsertData = metaCampaigns.map((c: any) => {
            const insights = c.insights?.data?.[0] || {};
            const actions = insights.actions || [];
            let metaResults = 0;

            // Lógica Cirúrgica: Selecionar a métrica primária que a Meta mostra no Gestor
            const msgStarted = actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0;
            const leadsGrouped = actions.find((a: any) => a.action_type === 'onsite_conversion.lead_grouped')?.value || 0;
            const leadsDirect = actions.find((a: any) => a.action_type === 'lead')?.value || 0;

            // Prioridade: Maior valor entre início de conversa e leads agrupados (Padrão Gestor de Anúncios)
            metaResults = Math.max(Number(msgStarted), Number(leadsGrouped));
            
            // Fallback para leads diretos se as métricas agrupadas forem zero
            if (metaResults === 0) metaResults = Number(leadsDirect);

            const status = (c.status || c.effective_status || '').toLowerCase();

            return {
                meta_id: c.id,
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
                meta_results: metaResults,
                updated_at: new Date().toISOString()
            };
        });

        if (upsertData.length > 0) {
            const { error } = await supabase
                .from('campaigns_manos_crm')
                .upsert(upsertData, { onConflict: 'meta_id' });

            if (error) {
                if (error.code === '42703' || error.message.includes('column')) {
                    const basicUpsertData = upsertData.map((d: any) => ({
                        meta_id: d.meta_id,
                        name: d.name,
                        platform: d.platform,
                        status: d.status,
                        total_spend: d.total_spend,
                        updated_at: d.updated_at
                    }));
                    const { error: retryError } = await supabase
                        .from('campaigns_manos_crm')
                        .upsert(basicUpsertData, { onConflict: 'meta_id' });
                    if (retryError) throw new Error(`Supabase Upsert Fallback: ${retryError.message}`);
                } else {
                    throw new Error(`Supabase Upsert: ${error.message}`);
                }
            }
        }

        cacheInvalidate('campaigns_all');

        try {
            await syncMetaLeads(token, adAccountId);
        } catch (le) {
            console.error("Warning: Lead Gen sync failed but campaign sync continued:", le);
        }

        return upsertData.length;
    } catch (err) {
        console.error("Sync Error:", err);
        throw err;
    }
}

export async function syncMetaLeads(token: string, adAccountId: string) {
    try {
        let totalImported = 0;
        const campaignsUrl = `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?fields=id,name,status,objective&limit=50&access_token=${token}`;
        const campaignsRes = await fetch(campaignsUrl);
        if (!campaignsRes.ok) return 0;
        
        const campaignsData = await campaignsRes.json();
        const campaigns = campaignsData.data || [];

        const { data: campaignsInDb } = await supabase
            .from('campaigns_manos_crm')
            .select('id, name');
        const campaignMap = new Map((campaignsInDb || []).map(c => [c.name, c.id]));

        // Surgical Fix: Aumentando a janela para 90 dias para garantir captura total do período ativo
        const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (86400 * 90); 

        for (const campaign of campaigns) {
            try {
                const adsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/ads?fields=id,name,status&limit=100&access_token=${token}`;
                const adsRes = await fetch(adsUrl);
                if (!adsRes.ok) {
                    console.warn(`Falha ao buscar ads para campanha ${campaign.name}: ${adsRes.status}`);
                    continue;
                }

                const adsData = await adsRes.json();
                const ads = adsData.data || [];

                for (const ad of ads) {
                    try {
                        const leadsUrl = `https://graph.facebook.com/v19.0/${ad.id}/leads?fields=id,created_time,field_data,campaign_id,ad_id,form_id,platform&limit=500&since=${ninetyDaysAgo}&access_token=${token}`;
                        const leadsRes = await fetch(leadsUrl);
                        if (!leadsRes.ok) {
                            const errBody = await leadsRes.text();
                            console.error(`Meta API Error (Leads) for Ad ${ad.name}: ${leadsRes.status} - ${errBody}`);
                            continue;
                        }

                        const leadsData = await leadsRes.json();
                        const rawLeads = leadsData.data || [];
                        if (rawLeads.length === 0) continue;

                        const metaIds = rawLeads.map((l: any) => l.id);
                        const { data: existing } = await supabase
                            .from('leads_distribuicao_crm_26')
                            .select('id_meta, telefone')
                            .or(`id_meta.in.(${metaIds.join(',')})`); // Otimizado para buscar por ID Meta

                        const existingMetaIds = new Set((existing || []).map((e: any) => e.id_meta));
                        const leadsToUpsert = rawLeads
                            .filter((ml: any) => !existingMetaIds.has(ml.id))
                            .map((ml: any) => {
                                let phone = '', name = '', email = '', city = '', interest = '', urgency = '', tradeIn = '';
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
                                const interestParts = [];
                                if (interest) interestParts.push(interest);
                                if (urgency) interestParts.push(`Urgência: ${urgency}`);
                                if (tradeIn) interestParts.push(`Troca: ${tradeIn}`);
                                const platform = ml.platform || 'facebook';
                                return {
                                    nome: name || 'Lead Meta Form',
                                    telefone: phone.replace(/\D/g, ''),
                                    origem: platform.toLowerCase() === 'instagram' ? 'Instagram' : 'Leads Facebook',
                                    plataforma_meta: platform,
                                    interesse: interestParts.join(' | ') || 'Busca veículo (via formulário)',
                                    cidade: city || '',
                                    status: 'received',
                                    criado_em: ml.created_time || new Date().toISOString(),
                                    id_meta: ml.id,
                                    lead_id: ml.id,
                                    campaign_id: campaignMap.get(campaign.name) || null,
                                    resumo: `[LEAD ${platform.toUpperCase()}] Capturado via formulário | Campanha: ${campaign.name} | Ad: ${ad.name}`
                                };
                            })
                            .filter((l: any) => l.telefone && l.telefone.length >= 8);

                        if (leadsToUpsert.length > 0) {
                            // Realiza Upsert em Lote (Batch)
                            const { error: upsertError } = await supabase
                                .from('leads_distribuicao_crm_26')
                                .upsert(leadsToUpsert, { 
                                    onConflict: 'telefone',
                                    ignoreDuplicates: false 
                                });

                            if (upsertError) {
                                console.error(`Erro no batch upsert para Ad ${ad.name}:`, upsertError.message);
                                // Fallback para um por um se o lote falhar por algum motivo específico de dado
                                for (const lead of leadsToUpsert) {
                                    try {
                                        await supabase.from('leads_distribuicao_crm_26').upsert(lead, { onConflict: 'telefone' });
                                    } catch (e) { /* ignore single error */ }
                                }
                            }
                            totalImported += leadsToUpsert.length;
                        }
                    } catch (adErr) { 
                        console.error(`Erro processando Ad ${ad.name}:`, adErr);
                        continue; 
                    }
                }
            } catch (campaignErr) { 
                console.error(`Erro processando Campanha ${campaign.name}:`, campaignErr);
                continue; 
            }
        }
        if (totalImported > 0) cacheInvalidate('leads_');
        return totalImported;
    } catch (err) {
        console.error("syncMetaLeads error:", err);
        return 0;
    }
}

export async function syncGoogleCampaigns(creds: any) {
    try {
        const { fetchGoogleAdsCampaigns } = await import('../google-ads');
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
}

export async function clearCampaigns() {
    const { error } = await supabase
        .from('campaigns_manos_crm')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return true;
}
