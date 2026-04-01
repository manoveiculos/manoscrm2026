'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
    BarChart3, 
    PieChart, 
    TrendingUp, 
    Users, 
    Target, 
    DollarSign,
    ArrowUpRight,
    ArrowDownRight,
    Briefcase,
    Zap,
    MessageCircle,
    Globe,
    Instagram,
    Facebook,
    Calendar,
    ChevronRight,
    ShieldCheck,
    Edit3,
    Trash2,
    X,
    Filter,
    Search
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { normalizeStatus } from '@/constants/status';

const supabase = createClient();

const SOURCE_ICONS: Record<string, any> = {
    facebook: Facebook,
    instagram: Instagram,
    whatsapp: MessageCircle,
    google: Globe,
    site: Globe,
};

const SOURCE_COLORS: Record<string, string> = {
    facebook: '#1877f2',
    instagram: '#e1306c',
    whatsapp: '#25d366',
    google: '#ea4335',
    site: '#ef4444',
};

export function SalesManagementDashboard() {
    const [leads, setLeads] = useState<any[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [consultants, setConsultants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [period, setPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom' | 'all'>('month');
    const [startDateCustom, setStartDateCustom] = useState('');
    const [endDateCustom, setEndDateCustom] = useState('');
    const [editingSale, setEditingSale] = useState<any>(null);

    const loadManagementData = async (currentPeriod: string = period) => {
        setLoading(true);
        try {
            const now = new Date();
            let startDate: Date | null = null;
            let endDate: Date | null = null;

            if (currentPeriod === 'today') {
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
            } else if (currentPeriod === 'yesterday') {
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setDate(now.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
            } else if (currentPeriod === 'week') {
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
            } else if (currentPeriod === 'month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                startDate.setHours(0, 0, 0, 0);
            } else if (currentPeriod === 'lastMonth') {
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            } else if (currentPeriod === 'custom') {
                if (startDateCustom) {
                    startDate = new Date(startDateCustom);
                    startDate.setHours(0, 0, 0, 0);
                }
                if (endDateCustom) {
                    endDate = new Date(endDateCustom);
                    endDate.setHours(23, 59, 59, 999);
                }
            } else if (currentPeriod === 'all') {
                startDate = new Date(2024, 0, 1);
            }

            const startDateISO = startDate?.toISOString();
            const endDateISO = endDate?.toISOString() || now.toISOString();

            const [
                { data: leadsData },
                { data: consultantsData }
            ] = await Promise.all([
                supabase
                    .from('leads')
                    .select('*')
                    .gte('created_at', startDateISO)
                    .lte('created_at', endDateISO)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('consultants_manos_crm')
                    .select('id, name')
                    .eq('is_active', true)
            ]);

            setLeads(leadsData || []);
            setConsultants(consultantsData || []);

            // 1. Fetch sales from all sources within range
            const manualSalesResponse = await supabase.from('cadastro_venda_veiculo')
                .select('*')
                .gte('data_cadastro', startDateISO)
                .lte('data_cadastro', endDateISO);

            const detailedSalesResponse = await supabase.from('sales_manos_crm')
                .select('id, lead_id, vehicle_name, consultant_id, sale_date, client_name, phone')
                .gte('sale_date', startDateISO)
                .lte('sale_date', endDateISO);

            const manualSalesDataList = manualSalesResponse.data || [];
            const detailedSalesDataList = detailedSalesResponse.data || [];

            // 2. Fetch leads for lookup - EXHAUSTIVE FETCH (bypass view limits/distinct)
            const [masterLeads, manosLeads, crm26Leads] = await Promise.all([
                supabase.from('leads_master').select('id, name, phone, vehicle_interest, assigned_consultant_id, status, created_at').eq('status', 'vendido'),
                supabase.from('leads_manos_crm').select('id, name, phone, vehicle_interest, assigned_consultant_id, status, created_at').eq('status', 'vendido'),
                supabase.from('leads_distribuicao_crm_26').select('id, nome, telefone, interesse, assigned_consultant_id, status, created_at').eq('status', 'vendido')
            ]);

            const allVendidoLeads: any[] = [
                ...(masterLeads.data || []).map(l => ({ ...l, source_table: 'leads_master' })),
                ...(manosLeads.data || []).map(l => ({ ...l, id: `main_${l.id}`, source_table: 'leads_manos_crm' })),
                ...(crm26Leads.data || []).map(l => ({ 
                    id: `crm26_${l.id}`, 
                    name: l.nome, 
                    phone: l.telefone, 
                    vehicle_interest: l.interesse, 
                    assigned_consultant_id: l.assigned_consultant_id,
                    created_at: l.created_at,
                    source_table: 'leads_distribuicao_crm_26' 
                }))
            ];

            // Consolidate Sales
            const consolidatedSales: any[] = [];
            
            // From All Vendido Leads (the reliable source for general sales)
            allVendidoLeads.forEach(l => {
                consolidatedSales.push({
                    id: l.id,
                    date: l.created_at || new Date().toISOString(),
                    client_name: l.name || 'Sem Nome',
                    phone: l.phone || 'N/A',
                    vehicle: l.vehicle_interest || 'N/A',
                    consultant_id: l.assigned_consultant_id,
                    source_table: 'leads',
                    lead_id: l.id
                });
            });

            // From Manual Registry (Legacy/Manual)
            manualSalesDataList.forEach(s => {
                consolidatedSales.push({
                    id: s.id,
                    date: s.data_venda || new Date().toISOString(),
                    client_name: s.nome_cliente || 'Sem Nome',
                    phone: s.cpf_cliente || 'Manual',
                    vehicle: `${s.marca} ${s.modelo}`.trim(),
                    consultant_id: s.assigned_consultant_id,
                    source_table: 'cadastro_venda_veiculo',
                    source: 'manual'
                });
            });

            // From Detailed Sales (New Sales Table)
            detailedSalesDataList.forEach(s => {
                // Priority: value from sales_manos_crm columns (editable overrides)
                // Fallback: lookup in allVendidoLeads using the lead_id
                let realName = s.client_name || '';
                let realPhone = s.phone || '';
                
                // If not in sale record, try lookup
                if (!realName || realName.includes('-')) {
                    const linkedLead = allVendidoLeads.find(l => 
                        l.id === s.lead_id || 
                        l.id === `main_${s.lead_id}` || 
                        l.id === `crm26_${s.lead_id}` ||
                        (typeof l.id === 'string' && l.id.endsWith(s.lead_id))
                    );
                    if (linkedLead) {
                        realName = linkedLead.name || realName;
                        realPhone = linkedLead.phone || realPhone;
                    }
                }

                consolidatedSales.push({
                    id: s.id,
                    date: s.sale_date,
                    client_name: realName || s.lead_id || 'Registro Detalhado',
                    phone: realPhone || 'N/A',
                    vehicle: s.vehicle_name || 'Desconhecido',
                    consultant_id: s.consultant_id,
                    source_table: 'sales_manos_crm',
                    lead_id: s.lead_id
                });
            });

            // Deduplicate: If we have a detailed sale and a lead with same lead_id, prioritize detailed sale
            const finalSales: any[] = [];
            const seenLeadIds = new Set();
            
            // First pass: Detailed Sales
            consolidatedSales.filter(s => s.source_table === 'sales_manos_crm').forEach(s => {
                finalSales.push(s);
                if (s.lead_id) seenLeadIds.add(s.lead_id);
            });

            // Second pass: Leads that aren't in detailed sales
            consolidatedSales.filter(s => s.source_table === 'leads').forEach(s => {
                if (!seenLeadIds.has(s.id)) {
                    finalSales.push(s);
                }
            });

            // Third pass: Manual Registry (usually don't have lead_id)
            consolidatedSales.filter(s => s.source_table === 'cadastro_venda_veiculo').forEach(s => {
                finalSales.push(s);
            });

            setSales(finalSales.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } catch (error) {
            console.error('Error loading management stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadManagementData();
    }, [period, startDateCustom, endDateCustom]);

    const stats = useMemo(() => {
        const totalLeads = leads.length;
        const soldCount = sales.length; // Uses unified sales count
        const lost = leads.filter(l => normalizeStatus(l.status) === 'perdido').length;
        const conversion = totalLeads > 0 ? (soldCount / totalLeads) * 100 : 0;
        
        // Group by source (using leads and manual sales)
        const sourceMap: Record<string, number> = {};
        leads.forEach(l => {
            const raw = (l.source || l.origem || 'whatsapp').toLowerCase();
            let src = 'whatsapp';
            if (raw.includes('fb') || raw.includes('facebook') || raw.includes('meta')) src = 'facebook';
            else if (raw.includes('ig') || raw.includes('instagram')) src = 'instagram';
            else if (raw.includes('google')) src = 'google';
            
            sourceMap[src] = (sourceMap[src] || 0) + 1;
        });

        // Add manual sales as a source
        sourceMap['manual'] = sales.filter(s => s.source === 'manual').length;

        const sources = Object.entries(sourceMap).map(([name, count]) => ({
            name,
            count,
            pct: totalLeads > 0 ? (count / totalLeads) * 100 : 0
        })).sort((a,b) => b.count - a.count);

        return { total: totalLeads, sold: soldCount, lost, conversion, sources };
    }, [leads, sales]);

    const handleUpdateSale = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSale) return;
        setLoading(true);

        try {
            const { source_table, id, client_name, vehicle, phone, consultant_id, lead_id } = editingSale;
            let totalUpdated = 0;

            // 1. Update Detailed Sale Record if applicable
            if (source_table === 'sales_manos_crm') {
                const { error: saleError, count } = await supabase
                    .from('sales_manos_crm')
                    .update({
                        vehicle_name: vehicle,
                        client_name: client_name, // Now exists in DB
                        phone: phone, // Now exists in DB
                        consultant_id: consultant_id
                    }, { count: 'exact' })
                    .eq('id', id);

                if (saleError) {
                    console.error("Sale update error:", saleError);
                } else if (count && count > 0) {
                    totalUpdated++;
                }
            } else if (source_table === 'cadastro_venda_veiculo') {
                const [marca, ...modeloParts] = (vehicle || '').split(' ');
                const { error: registryError, count } = await supabase
                    .from('cadastro_venda_veiculo')
                    .update({
                        nome_cliente: client_name,
                        marca: marca || '',
                        modelo: modeloParts.join(' '),
                        assigned_consultant_id: consultant_id
                    }, { count: 'exact' })
                    .eq('id', parseInt(id));

                if (!registryError && count && count > 0) totalUpdated++;
            }

            // 2. Sync with Lead Tables (ALWAYS TRY SYNC for data integrity)
            const effectiveLeadId = lead_id || (source_table === 'leads' ? id : null);
            if (effectiveLeadId) {
                const leadTables = ['leads_master', 'leads_manos_crm', 'leads_distribuicao_crm_26'];
                let resolvedId: any = effectiveLeadId;

                // Handle prefixes if they exist
                if (typeof effectiveLeadId === 'string') {
                    if (effectiveLeadId.startsWith('main_')) resolvedId = effectiveLeadId.replace('main_', '');
                    else if (effectiveLeadId.startsWith('crm26_')) resolvedId = parseInt(effectiveLeadId.replace('crm26_', ''));
                }

                for (const table of leadTables) {
                    try {
                        const isCrm26 = table === 'leads_distribuicao_crm_26';
                        const finalId = isCrm26 ? parseInt(resolvedId) : resolvedId;
                        if (isCrm26 && isNaN(finalId)) continue; // Skip numeric table if ID is string
                        
                        const updateData: any = { assigned_consultant_id: consultant_id };
                        if (isCrm26) {
                            updateData.nome = client_name;
                            updateData.interesse = vehicle;
                            updateData.telefone = phone;
                        } else {
                            updateData.name = client_name;
                            updateData.vehicle_interest = vehicle;
                            updateData.phone = phone;
                        }

                        const { error: syncError, count: syncCount } = await supabase
                            .from(table)
                            .update(updateData, { count: 'exact' })
                            .eq('id', finalId);

                        if (!syncError && syncCount && syncCount > 0) totalUpdated++;
                    } catch (e) {
                        // Silent skip if ID type mismatch
                    }
                }
            }

            if (totalUpdated > 0) {
                alert('✅ Alterações salvas com sucesso em todas as fontes!');
                setIsEditModalOpen(false);
                setEditingSale(null);
                
                // Force a full refresh after a small delay to allow DB views to catch up
                setTimeout(() => {
                    loadManagementData();
                    // Optional: window.location.reload(); 
                }, 500);
            } else {
                console.warn("No rows affected for update on:", { source_table, id, client_name });
                alert('⚠️ Nenhuma linha foi alterada. Verifique se o registro ainda existe ou se você tem permissões administrativas.');
            }
        } catch (error: any) {
            console.error('Error updating sale:', error);
            alert(`❌ Erro ao salvar: ${error.message || 'Erro de conexão SQL'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSale = async (sale: any) => {
        const confirmMsg = `Confirmar exclusão da venda de ${sale.client_name}?\n\n(ID Interno: ${sale.id})`;
        if (!window.confirm(confirmMsg)) return;

        try {
            const { source_table, id, lead_id } = sale;
            let targetTable = source_table;
            let targetId: any = id;

            // Resolve real table and ID for leads
            if (source_table === 'leads' && typeof id === 'string') {
                if (id.startsWith('main_')) {
                    targetTable = 'leads_manos_crm';
                    targetId = id.replace('main_', '');
                } else if (id.startsWith('crm26_')) {
                    targetTable = 'leads_distribuicao_crm_26';
                    targetId = parseInt(id.replace('crm26_', ''));
                } else {
                    targetTable = 'leads_master';
                }
            } else if (source_table === 'cadastro_venda_veiculo') {
                targetId = parseInt(id);
                targetTable = 'cadastro_venda_veiculo';
            }

            // 1. If it's a detail record (sales_manos_crm), delete it
            let result;
            if (targetTable === 'sales_manos_crm') {
                result = await supabase.from('sales_manos_crm').delete().eq('id', targetId);
            } else if (targetTable === 'cadastro_venda_veiculo') {
                result = await supabase.from('cadastro_venda_veiculo').delete().eq('id', targetId);
            }

            // 2. IMPORTANT: If there's an associated lead, we MUST reset its status 
            // so it stops being considered a 'sale' in the leads view.
            if (lead_id) {
                const leadTables = [];
                let resolvedId: any = lead_id;

                if (typeof lead_id === 'string') {
                    if (lead_id.startsWith('main_')) {
                        leadTables.push('leads_manos_crm');
                        resolvedId = lead_id.replace('main_', '');
                    } else if (lead_id.startsWith('crm26_')) {
                        leadTables.push('leads_distribuicao_crm_26');
                        resolvedId = parseInt(lead_id.replace('crm26_', ''));
                    } else {
                        // NO PREFIX: Search everywhere
                        leadTables.push('leads_master');
                        leadTables.push('leads_manos_crm');
                        if (!isNaN(Number(lead_id))) {
                            leadTables.push('leads_distribuicao_crm_26');
                        }
                    }
                }

                for (const table of leadTables) {
                    try {
                        const finalId = table === 'leads_distribuicao_crm_26' ? parseInt(resolvedId) : resolvedId;
                        const leadResult = await supabase
                            .from(table)
                            .update({ status: 'received', assigned_consultant_id: null })
                            .eq('id', finalId);
                        
                        if (!result) result = leadResult;
                        console.log(`Synced status reset in ${table} for ID ${finalId}`);
                    } catch (e) {
                        console.warn(`Status reset failed for table ${table}:`, e);
                    }
                }
            }

            // 3. If we only have a lead record (source_table === 'leads') and no extra detail record
            if (source_table === 'leads' && !result) {
                result = await supabase
                    .from(targetTable)
                    .update({ status: 'received', assigned_consultant_id: null })
                    .eq('id', targetId);
            }

            if (result?.error) throw result.error;

            alert('✅ Registro removido com sucesso de todas as fontes!');
            loadManagementData();
        } catch (error: any) {
            console.error('Error deleting sale:', error);
            alert(`❌ Erro ao remover: ${error.message || 'Erro desconhecido'}`);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="h-12 w-12 border-2 border-red-500 border-t-transparent rounded-full shadow-lg" />
            </div>
        );
    }

    return (
        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Page Title */}
            <div className="flex items-center justify-between px-4 md:px-0">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-red-500">
                        <Briefcase size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Visão Geral de Resultados • {
                            period === 'today' ? 'Hoje' :
                            period === 'yesterday' ? 'Ontem' :
                            period === 'week' ? 'Últimos 7 Dias' :
                            period === 'month' ? 'Este Mês' :
                            period === 'lastMonth' ? 'Mês Passado' : 
                            period === 'custom' ? 'Intervalo Customizado' : 'Total Geral'
                        }</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {period === 'custom' && (
                        <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-1 bg-white/5 border border-white/10 p-1 rounded-xl"
                        >
                            <input 
                                type="date" 
                                value={startDateCustom}
                                onChange={(e) => setStartDateCustom(e.target.value)}
                                className="bg-transparent border-none text-[9px] font-black text-white/40 outline-none uppercase p-1.5"
                            />
                            <span className="text-[9px] text-white/10 font-bold">A</span>
                            <input 
                                type="date" 
                                value={endDateCustom}
                                onChange={(e) => setEndDateCustom(e.target.value)}
                                className="bg-transparent border-none text-[9px] font-black text-white/40 outline-none uppercase p-1.5"
                            />
                        </motion.div>
                    )}
                    <div className="flex items-center gap-0.5 bg-white/5 p-1 rounded-xl border border-white/10">
                        {(['today', 'yesterday', 'week', 'month', 'lastMonth', 'custom', 'all'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                    period === p
                                        ? 'bg-red-600 text-white shadow-[0_4px_10px_rgba(239,68,68,0.3)]'
                                        : 'text-white/30 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {p === 'today' ? 'Hoje' : 
                                 p === 'yesterday' ? 'Ontem' :
                                 p === 'week' ? 'Semana' :
                                 p === 'month' ? 'Mês' :
                                 p === 'lastMonth' ? 'Mês Passado' : 
                                 p === 'custom' ? 'Intervalo' : 'Tudo'}
                            </button>
                        ))}
                    </div>
                    <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Real-time Sync</span>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 md:px-0">
                {[
                    { label: 'Leads no Período', value: stats.total, icon: Users, color: '#3b82f6' },
                    { label: 'Vendas Realizadas', value: stats.sold, icon: Zap, color: '#10b981' },
                    { label: 'Conversão Média', value: `${stats.conversion.toFixed(1)}%`, icon: Target, color: '#f59e0b' },
                    { label: 'Leads Perdidos', value: stats.lost, icon: ShieldCheck, color: '#ef4444' }
                ].map((kpi, idx) => (
                    <div key={idx} className="bg-[#1A1A20] p-6 rounded-[2rem] border border-white/5 hover:border-white/10 transition-all group overflow-hidden relative">
                        <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] transition-all">
                            <kpi.icon size={100} strokeWidth={4} />
                        </div>
                        <kpi.icon size={20} style={{ color: kpi.color }} className="mb-4" />
                        <p className="text-3xl font-black text-white tabular-nums mb-1">{kpi.value}</p>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{kpi.label}</p>
                    </div>
                ))}
            </div>

            {/* Middle Section: Sources & ROI Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0">
                {/* Canal de Entrada */}
                <div className="bg-[#1A1A20] p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                        <Globe size={16} className="text-blue-500" />
                        Origem dos Leads
                    </h3>
                    <div className="space-y-5">
                        {stats.sources.map((src, idx) => {
                            const Icon = SOURCE_ICONS[src.name] || Globe;
                            const color = SOURCE_COLORS[src.name] || '#ffffff';
                            return (
                                <div key={idx} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/5" style={{ color }}>
                                                <Icon size={14} />
                                            </div>
                                            <span className="text-xs font-black text-white/70 uppercase tracking-widest">{src.name}</span>
                                        </div>
                                        <span className="text-xs font-black text-white tabular-nums">{src.count} <span className="text-white/20 font-bold">({src.pct.toFixed(0)}%)</span></span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${src.pct}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            className="h-full rounded-full" 
                                            style={{ backgroundColor: color }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Performance por Status */}
                <div className="bg-[#1A1A20] p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                        <TrendingUp size={16} className="text-emerald-500" />
                        Saúde do Funil
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {['entrada', 'triagem', 'ataque', 'fechamento', 'vendido', 'perdido'].map(status => {
                            const count = leads.filter(l => normalizeStatus(l.status) === status).length;
                            const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                            return (
                                <div key={status} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{status}</p>
                                    <div className="flex items-end justify-between gap-2">
                                        <p className="text-xl font-black text-white leading-none">{count}</p>
                                        <p className="text-[10px] font-bold text-white/40 mb-0.5">{pct.toFixed(0)}%</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Sales List Table */}
            <div className="bg-[#1A1A20] rounded-[2.5rem] border border-white/5 overflow-hidden">
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                            <ShieldCheck size={16} className="text-emerald-500" />
                            Vendas Registradas
                        </h3>
                        <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mt-1">
                            {sales.length} vendas confirmadas no sistema
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/[0.02]">
                                <th className="px-8 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Data</th>
                                <th className="px-8 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Cliente</th>
                                <th className="px-8 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Veículo</th>
                                <th className="px-8 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Consultor</th>
                                <th className="px-8 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Origem</th>
                                <th className="px-8 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.02]">
                            {sales.map((sale) => (
                                <tr key={`${sale.source_table}-${sale.id}`} className="hover:bg-white/[0.01] transition-colors group">
                                    <td className="px-8 py-5 text-xs text-white/40 tabular-nums">
                                        {new Date(sale.date).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-8 py-5">
                                        <p className="text-sm font-black text-white uppercase">{sale.client_name}</p>
                                        <p className="text-[10px] text-white/20 font-bold">{sale.phone}</p>
                                    </td>
                                    <td className="px-8 py-5 text-sm text-white/70 font-medium">
                                        {sale.vehicle}
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-md bg-white/5 flex items-center justify-center text-[10px] font-black text-white/30 capitalize">
                                                {(consultants.find(c => c.id === sale.consultant_id)?.name || '?')[0]}
                                            </div>
                                            <span className="text-xs font-black text-white/70 uppercase">
                                                {consultants.find(c => c.id === sale.consultant_id)?.name || 'NÃO ATRIBUÍDO'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter ${
                                            sale.source_table === 'cadastro_venda_veiculo' ? 'bg-amber-500/10 text-amber-500' :
                                            sale.source_table === 'leads' ? 'bg-blue-500/10 text-blue-500' :
                                            'bg-purple-500/10 text-purple-500'
                                        }`}>
                                            {sale.source_table}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => {
                                                    setEditingSale({ ...sale });
                                                    setIsEditModalOpen(true);
                                                }}
                                                className="p-2 rounded-xl bg-white/5 text-white/20 hover:text-white hover:bg-red-600 transition-all"
                                                title="Editar Venda"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteSale(sale)}
                                                className="p-2 rounded-xl bg-white/5 text-white/20 hover:text-white hover:bg-orange-600 transition-all"
                                                title="Remover Registro"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && editingSale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-[#1A1A20] border border-white/10 w-full max-w-xl rounded-[2.5rem] overflow-hidden shadow-2xl"
                    >
                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-white uppercase tracking-tight">Editar <span className="text-red-500">Venda</span></h2>
                                <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mt-1">ID: {editingSale.id}</p>
                            </div>
                            <button onClick={() => setIsEditModalOpen(false)} className="h-10 w-10 rounded-xl hover:bg-white/5 flex items-center justify-center text-white/30 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateSale} className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">Nome do Cliente</label>
                                    <input 
                                        type="text" 
                                        value={editingSale.client_name}
                                        onChange={e => setEditingSale({...editingSale, client_name: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">Telefone (ID)</label>
                                    <input 
                                        type="text" 
                                        value={editingSale.phone || ''}
                                        onChange={(e) => setEditingSale({ ...editingSale, phone: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">Veículo / Interesse</label>
                                    <input 
                                        type="text" 
                                        value={editingSale.vehicle}
                                        onChange={e => setEditingSale({...editingSale, vehicle: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">Consultor Responsável</label>
                                    <select 
                                        value={editingSale.consultant_id || ''}
                                        onChange={e => setEditingSale({...editingSale, consultant_id: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium"
                                    >
                                        <option value="">Selecione um Consultor</option>
                                        {consultants.map(c => (
                                            <option key={c.id} value={c.id} className="bg-[#1A1A20]">{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="pt-6 flex items-center justify-end gap-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-8 py-3.5 rounded-2xl text-[11px] font-black text-white/30 uppercase tracking-widest hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    className="px-10 py-3.5 rounded-2xl bg-red-600 text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-red-600/20 hover:scale-105 active:scale-95 transition-all"
                                >
                                    Salvar Alterações
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
