'use client';

import React, { useEffect, useState } from 'react';
import {
    Search,
    TrendingUp,
    Target,
    Users,
    ArrowUpRight,
    Sparkles,
    Facebook,
    RefreshCcw,
    BarChart3,
    Zap,
    MessageCircle,
    Globe,
    Play,
    Youtube,
    Maximize2,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dataService } from '@/lib/dataService';
import { Campaign, MarketingReport } from '@/lib/types';

export default function MarketingPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [dailyReport, setDailyReport] = useState<MarketingReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('maximum');
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [showFullAnalysis, setShowFullAnalysis] = useState(false);
    const [crmLeadsByCampaign, setCrmLeadsByCampaign] = useState<Record<string, number>>({});

    const handleAnalyze = async (campaign: Campaign) => {
        setAnalyzingId(campaign.id);
        try {
            const currentLeads = crmLeadsByCampaign[campaign.id] || 0;
            const res = await fetch('/api/analyze-campaign-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign,
                    leadsSummary: {
                        total: currentLeads,
                        statusCounts: {}
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, ai_analysis_result: data } : c));
                setSelectedCampaign(prev => prev && prev.id === campaign.id ? { ...prev, ai_analysis_result: data } : prev);
            }
        } catch (err) {
            console.error("Analysis error:", err);
        } finally {
            setAnalyzingId(null);
        }
    };

    const loadData = async (currentFilter: string = dateFilter) => {
        setLoading(true);
        try {
            const [campaignData, reportData, counts] = await Promise.all([
                dataService.getCampaigns(),
                dataService.getDailyMarketingReport(),
                dataService.getLeadsCountByDateForCampaigns(currentFilter)
            ]);

            setCrmLeadsByCampaign(counts);
            setDailyReport(reportData);

            let finalCampaigns = campaignData || [];

            if (currentFilter !== 'maximum') {
                const res = await fetch('/api/marketing/insights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date_preset: currentFilter })
                });

                const liveData = await res.json();

                if (liveData.success && liveData.data) {
                    finalCampaigns = finalCampaigns.map((c: any) => {
                        const liveC = liveData.data.find((lc: any) => lc.name === c.name || lc.id === c.id);
                        const crmCount = counts[c.id] || 0;

                        if (liveC) {
                            return {
                                ...c,
                                ...liveC,
                                leads_manos_crm: [{ count: crmCount }]
                            };
                        }
                        return {
                            ...c,
                            total_spend: 0,
                            link_clicks: 0,
                            reach: 0,
                            impressions: 0,
                            leads_manos_crm: [{ count: crmCount }]
                        };
                    });
                } else {
                    finalCampaigns = finalCampaigns.map((c: any) => ({
                        ...c,
                        total_spend: 0,
                        link_clicks: 0,
                        leads_manos_crm: [{ count: counts[c.id] || 0 }]
                    }));
                }
            } else {
                finalCampaigns = finalCampaigns.map((c: any) => ({
                    ...c,
                    leads_manos_crm: [{ count: counts[c.id] || 0 }]
                }));
            }

            setCampaigns(finalCampaigns);
        } catch (err) {
            console.error("Error loading marketing data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(dateFilter);
    }, [dateFilter]);

    const handleSync = async (fullClear: boolean = false) => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/sync-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullClear })
            });
            const data = await res.json();
            if (data.success) {
                await loadData();
                alert(fullClear ? "Base zerada e sincronizada!" : `Sincronização concluída! ${data.syncedCampaigns || 0} campanhas, ${data.syncedLeads || 0} leads importados.`);
            } else {
                alert("Erro: " + data.error);
            }
        } catch (err) {
            alert("Falha na rede ao sincronizar.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleGoogleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/sync-google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                await loadData();
                alert("Sincronização Google concluída!");
            } else {
                alert("Erro Google: " + data.error);
            }
        } catch (err) {
            alert("Falha na rede ao sincronizar Google.");
        } finally {
            setIsSyncing(false);
        }
    };

    const [selectedCategory, setSelectedCategory] = useState('Todas');

    const filteredCampaigns = campaigns
        .filter(c => {
            const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase());
            if (selectedCategory === 'Todas') return matchesSearch;
            const platform = (c.platform || '').toLowerCase();
            const category = selectedCategory.toLowerCase().replace(' ads', '');
            return matchesSearch && platform.includes(category);
        })
        .sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            const spendA = Number(a.total_spend) || 0;
            const spendB = Number(b.total_spend) || 0;
            if (spendA !== spendB) return spendB - spendA;
            const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
            const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
            return dateB - dateA;
        });

    const totalClicks = filteredCampaigns.reduce((acc, c) => acc + (Number(c.link_clicks) || 0), 0);
    const totalImpressions = filteredCampaigns.reduce((acc, c) => acc + (Number(c.impressions) || 0), 0);
    const totalLeads = filteredCampaigns.reduce((acc, c) => acc + (crmLeadsByCampaign[c.id] || 0), 0);
    const totalSpend = filteredCampaigns.reduce((acc, c) => acc + (Number(c.total_spend) || 0), 0);

    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const clickToLeadRate = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    const funnelHealthScore = Math.min((clickToLeadRate / 3) * 10, 10);
    const healthPercentage = (funnelHealthScore / 10) * 100;

    const dynamicAiSummary = totalClicks > 0
        ? `Sua operação de marketing gerou ${totalImpressions.toLocaleString()} visualizações. Destas, ${totalClicks.toLocaleString()} pessoas se engajaram e geraram ${totalLeads} leads reais no CRM. Eficiência de ${(clickToLeadRate).toFixed(1)}%, com custo de R$ ${avgCpl.toFixed(2)} por lead.`
        : "Aguardando sincronização de dados reais para iniciar análise estratégica completa.";

    const recommendations = dailyReport?.recommendations || [
        {
            title: ctr < 1 ? "⚠️ CRIATIVO SATURADO" : "✅ ATRAÇÃO SAUDÁVEL",
            action: ctr < 1 ? "TROCAR IMAGENS/VÍDEOS" : "MANTER ESTRATÉGIA",
            reason: ctr < 1
                ? `O CTR de ${ctr.toFixed(1)}% está baixo. O público não está clicando nos anúncios atuais.`
                : `Taxa de clique de ${ctr.toFixed(1)}% indica que o público se identifica com os criativos.`
        },
        {
            title: avgCpl < 35 ? "🚀 OPORTUNIDADE DE ESCALA" : "💸 ALERTA DE CUSTO",
            action: avgCpl < 35 ? "AUMENTAR VERBA" : "REFINAR SEGMENTAÇÃO",
            reason: avgCpl < 35
                ? "Custo por lead excelente. Recomendamos aumentar o investimento gradualmente."
                : "O custo por lead está acima da média sugerida. Tente restringir o público alvo."
        }
    ];

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center bg-[#060606]">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#010409] text-[#e6edf3] p-4 lg:p-8 space-y-8 pb-32 font-sans">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400/80">Monitoramento em Tempo Real</span>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-[#f0f6fc]">Performance de Marketing</h1>
                    <p className="text-[#8b949e] mt-1 text-sm">Dashboard consolidado e análise preditiva.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar campanha..."
                            className="bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-4 py-2 text-sm w-full md:w-64 focus:outline-none focus:ring-1 focus:ring-blue-500 text-[#c9d1d9]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2 text-sm text-[#c9d1d9] cursor-pointer"
                    >
                        <option value="today">Hoje</option>
                        <option value="yesterday">Ontem</option>
                        <option value="last_7d">Últimos 7 dias</option>
                        <option value="this_month">Este Mês</option>
                        <option value="maximum">Máximo (Tudo)</option>
                    </select>

                    <button onClick={() => handleSync()} disabled={isSyncing} className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-sm flex items-center gap-2 hover:bg-blue-500 hover:text-white transition-all">
                        <RefreshCcw size={14} className={isSyncing ? 'animate-spin' : ''} />
                        Sync Meta
                    </button>

                    <button onClick={() => handleGoogleSync()} disabled={isSyncing} className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm flex items-center gap-2 hover:bg-emerald-500 hover:text-white transition-all">
                        <RefreshCcw size={14} className={isSyncing ? 'animate-spin' : ''} />
                        Sync Google
                    </button>
                </div>
            </header>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: "Visualização Total", value: totalImpressions.toLocaleString(), unit: "VISTAS", icon: <TrendingUp size={24} className="text-blue-400" /> },
                    { label: "Leads no CRM", value: totalLeads.toString(), unit: "LEADS", icon: <Users size={24} className="text-purple-400" /> },
                    { label: "CPL Médio", value: `R$ ${avgCpl.toFixed(2)}`, unit: "MÉDIA", icon: <Target size={24} className="text-red-400" /> },
                    { label: "Total Investido", value: `R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, unit: "REAL", icon: <ArrowUpRight size={24} className="text-emerald-400" /> }
                ].map((kpi, idx) => (
                    <div key={idx} className="p-5 rounded-xl bg-[#0d1117] border border-[#30363d] shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-[#8b949e]">{kpi.icon}</div>
                        </div>
                        <p className="text-xs font-medium text-[#8b949e] mb-1">{kpi.label}</p>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-2xl font-semibold text-[#f0f6fc] tracking-tight">{kpi.value}</h4>
                            <span className="text-[10px] text-[#484f58] uppercase">{kpi.unit}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* AI Strategic Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 p-6 rounded-xl bg-[#0d1117] border border-[#30363d]">
                    <div className="flex items-center gap-3 mb-6">
                        <Sparkles size={20} className="text-blue-400" />
                        <h2 className="text-xl font-bold text-[#f0f6fc]">Análise Estratégica IA</h2>
                    </div>
                    <div className="mb-8 p-5 rounded-xl bg-blue-500/5 border-l-4 border-blue-500">
                        <p className="text-lg text-[#c9d1d9] leading-relaxed italic">&quot;{dynamicAiSummary}&quot;</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {recommendations.slice(0, 3).map((rec, i) => (
                            <div key={i} className="p-5 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-blue-500/50 transition-all">
                                <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-1">{rec.title}</p>
                                <p className="text-sm font-bold text-white mb-2">{rec.action}</p>
                                <p className="text-xs text-[#8b949e] leading-snug">{rec.reason}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-4 p-6 rounded-xl bg-[#0d1117] border border-[#30363d] flex flex-col justify-center">
                    <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-4">Score de Eficiência</p>
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-5xl font-bold text-[#f0f6fc]">{funnelHealthScore.toFixed(1)}</span>
                        <span className="text-lg font-semibold text-[#3fb950]">/10</span>
                    </div>
                    <div className="h-2 w-full bg-[#161b22] rounded-full overflow-hidden border border-[#30363d]">
                        <div className="h-full bg-blue-500" style={{ width: `${healthPercentage}%` }} />
                    </div>
                </div>
            </div>

            {/* Campaigns Table */}
            <div className="flex flex-wrap gap-2 mb-6">
                {['Todas', 'Meta Ads', 'Google Ads', 'Whatsapp'].map((plat) => (
                    <button
                        key={plat}
                        onClick={() => setSelectedCategory(plat)}
                        className={`px-4 py-2 rounded-lg text-xs font-medium border ${selectedCategory === plat ? 'bg-[#21262d] border-[#8b949e] text-white' : 'bg-transparent border-[#30363d] text-[#8b949e]'}`}
                    >
                        {plat}
                    </button>
                ))}
            </div>

            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-[#161b22]/50 text-[10px] uppercase text-[#8b949e] font-semibold border-b border-[#30363d]">
                            <th className="px-6 py-4">Campanha</th>
                            <th className="px-6 py-4">Custo</th>
                            <th className="px-6 py-4 hidden md:table-cell">Impressões</th>
                            <th className="px-6 py-4 hidden lg:table-cell">Leads CRM</th>
                            <th className="px-6 py-4 text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363d]">
                        {filteredCampaigns.map((camp) => (
                            <tr key={camp.id} className="hover:bg-[#161b22]/50 transition-all cursor-pointer" onClick={() => setSelectedCampaign(camp)}>
                                <td className="px-6 py-4">
                                    <p className="font-semibold text-sm text-[#c9d1d9]">{camp.name}</p>
                                    <p className="text-[9px] text-[#8b949e] uppercase">{camp.platform}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-semibold text-[#f0f6fc]">R$ {Number(camp.total_spend || 0).toFixed(2)}</p>
                                </td>
                                <td className="px-6 py-4 hidden md:table-cell text-[#c9d1d9]">{Number(camp.impressions || 0).toLocaleString()}</td>
                                <td className="px-6 py-4 hidden lg:table-cell text-[#3fb950] font-bold">{crmLeadsByCampaign[camp.id] || 0}</td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-xs font-bold text-blue-400 hover:text-blue-300">DETALHES</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Campaign Report Modal */}
            <AnimatePresence>
                {selectedCampaign && (() => {
                    const campLeads = crmLeadsByCampaign[selectedCampaign.id] || 0;
                    const campSpend = Number(selectedCampaign.total_spend || 0);
                    const campClicks = Number(selectedCampaign.link_clicks || 0);
                    const campReach = Number(selectedCampaign.reach || 0);
                    const campImps = Number(selectedCampaign.impressions || 0);
                    const campCpc = Number(selectedCampaign.cpc || 0);
                    const campCtr = Number(selectedCampaign.ctr || 0);
                    const campCpm = Number(selectedCampaign.cpm || 0);
                    const campFreq = Number(selectedCampaign.frequency || 0);
                    const campCpl = campLeads > 0 ? campSpend / campLeads : 0;
                    const clickToLead = campClicks > 0 ? (campLeads / campClicks * 100) : 0;
                    const impToClick = campImps > 0 ? (campClicks / campImps * 100) : 0;
                    const efficiency = Math.min(
                        ((campLeads > 0 ? 3 : 0) + (campCpl < 30 ? 3 : campCpl < 60 ? 1.5 : 0) + (campCtr > 1 ? 2 : campCtr > 0.5 ? 1 : 0) + (clickToLead > 5 ? 2 : clickToLead > 1 ? 1 : 0)),
                        10
                    );

                    return (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/95" onClick={() => setSelectedCampaign(null)} />
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="relative w-full max-w-6xl h-full max-h-[92vh] bg-[#010409] border border-[#30363d] rounded-2xl overflow-hidden flex flex-col"
                            >
                                {/* Header */}
                                <div className="px-8 py-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            {(selectedCampaign.platform || '').toLowerCase().includes('meta') ? <Facebook size={20} className="text-blue-400" /> : <Globe size={20} className="text-emerald-400" />}
                                            <h3 className="text-lg font-bold text-white">{selectedCampaign.name}</h3>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${selectedCampaign.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                                            {selectedCampaign.status === 'active' ? '● ATIVA' : '● PAUSADA'}
                                        </span>
                                    </div>
                                    <button onClick={() => setSelectedCampaign(null)} className="text-[#8b949e] hover:text-white transition-colors">
                                        <X size={24} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {/* KPI Grid - Main Metrics */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-5 rounded-xl bg-[#0d1117] border border-[#30363d]">
                                            <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-1">Leads no CRM</p>
                                            <h4 className="text-3xl font-bold text-[#3fb950]">{campLeads}</h4>
                                            <p className="text-[10px] text-[#484f58] mt-1">Capturados do formulário</p>
                                        </div>
                                        <div className="p-5 rounded-xl bg-[#0d1117] border border-[#30363d]">
                                            <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-1">Custo por Lead</p>
                                            <h4 className={`text-3xl font-bold ${campCpl < 30 ? 'text-[#3fb950]' : campCpl < 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {campCpl > 0 ? `R$ ${campCpl.toFixed(2)}` : '—'}
                                            </h4>
                                            <p className="text-[10px] text-[#484f58] mt-1">{campCpl < 30 ? 'Excelente' : campCpl < 60 ? 'Aceitável' : 'Acima do ideal'}</p>
                                        </div>
                                        <div className="p-5 rounded-xl bg-[#0d1117] border border-[#30363d]">
                                            <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-1">Investimento</p>
                                            <h4 className="text-3xl font-bold text-white">R$ {campSpend.toFixed(2)}</h4>
                                            <p className="text-[10px] text-[#484f58] mt-1">Valor gasto total</p>
                                        </div>
                                        <div className="p-5 rounded-xl bg-[#0d1117] border border-[#30363d]">
                                            <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-1">Score Eficiência</p>
                                            <div className="flex items-baseline gap-1">
                                                <h4 className={`text-3xl font-bold ${efficiency >= 6 ? 'text-[#3fb950]' : efficiency >= 3 ? 'text-yellow-400' : 'text-red-400'}`}>{efficiency.toFixed(1)}</h4>
                                                <span className="text-sm text-[#484f58]">/10</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-[#161b22] rounded-full overflow-hidden mt-2">
                                                <div className={`h-full rounded-full ${efficiency >= 6 ? 'bg-[#3fb950]' : efficiency >= 3 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${efficiency * 10}%` }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detailed Metrics */}
                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                        {[
                                            { label: 'Impressões', value: campImps.toLocaleString(), sub: 'visualizações' },
                                            { label: 'Alcance', value: campReach.toLocaleString(), sub: 'pessoas únicas' },
                                            { label: 'Cliques', value: campClicks.toLocaleString(), sub: 'no link' },
                                            { label: 'CTR', value: `${campCtr.toFixed(2)}%`, sub: campCtr >= 1 ? 'Bom' : 'Baixo' },
                                            { label: 'CPC', value: `R$ ${campCpc.toFixed(2)}`, sub: 'custo/clique' },
                                            { label: 'Frequência', value: campFreq.toFixed(1), sub: campFreq > 3 ? 'Saturado!' : 'Normal' },
                                        ].map((m, i) => (
                                            <div key={i} className="p-4 rounded-lg bg-[#0d1117] border border-[#21262d]">
                                                <p className="text-[9px] font-bold text-[#8b949e] uppercase">{m.label}</p>
                                                <p className="text-lg font-bold text-[#e6edf3] mt-1">{m.value}</p>
                                                <p className="text-[9px] text-[#484f58]">{m.sub}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Conversion Funnel */}
                                    <div className="p-6 rounded-xl bg-[#0d1117] border border-[#30363d]">
                                        <h4 className="text-xs font-bold text-[#8b949e] uppercase mb-5 flex items-center gap-2">
                                            <BarChart3 size={14} className="text-blue-400" />
                                            Funil de Conversão
                                        </h4>
                                        <div className="flex items-end gap-3 h-32">
                                            {[
                                                { label: 'Impressões', value: campImps, color: 'bg-blue-500/60' },
                                                { label: 'Alcance', value: campReach, color: 'bg-blue-500/80' },
                                                { label: 'Cliques', value: campClicks, color: 'bg-purple-500' },
                                                { label: 'Leads', value: campLeads, color: 'bg-[#3fb950]' },
                                            ].map((step, i) => {
                                                const maxVal = Math.max(campImps, 1);
                                                const height = Math.max((step.value / maxVal) * 100, 4);
                                                return (
                                                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                                        <p className="text-xs font-bold text-white">{step.value.toLocaleString()}</p>
                                                        <div className="w-full rounded-t-lg relative" style={{ height: `${height}%` }}>
                                                            <div className={`absolute inset-0 ${step.color} rounded-t-lg`} />
                                                        </div>
                                                        <p className="text-[9px] text-[#8b949e] text-center">{step.label}</p>
                                                        {i < 3 && (
                                                            <p className="text-[9px] text-[#484f58]">
                                                                {i === 0 && campImps > 0 ? `${impToClick.toFixed(1)}% →` : ''}
                                                                {i === 1 ? '' : ''}
                                                                {i === 2 && campClicks > 0 ? `${clickToLead.toFixed(1)}% →` : ''}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* AI Analysis Section */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        <div className="flex flex-col gap-4">
                                            <button
                                                onClick={() => handleAnalyze(selectedCampaign)}
                                                disabled={!!analyzingId}
                                                className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                            >
                                                {analyzingId ? <RefreshCcw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                                {analyzingId ? 'ANALISANDO...' : 'ANÁLISE COMPLETA IA'}
                                            </button>

                                            {/* Quick Intel */}
                                            <div className="p-5 rounded-xl bg-[#0d1117] border border-[#30363d] space-y-3">
                                                <h5 className="text-[10px] font-black text-[#8b949e] uppercase">Resumo Rápido</h5>
                                                <div className="space-y-2 text-xs text-[#c9d1d9]">
                                                    <p>• {campLeads > 0 ? `${campLeads} leads capturados com CPL de R$ ${campCpl.toFixed(2)}` : 'Nenhum lead capturado ainda'}</p>
                                                    <p>• {campCtr >= 1 ? `CTR de ${campCtr.toFixed(2)}% indica boa atração` : `CTR de ${campCtr.toFixed(2)}% — criativos precisam melhorar`}</p>
                                                    <p>• {campFreq > 3 ? `Frequência ${campFreq.toFixed(1)} — público saturado, ampliar` : `Frequência ${campFreq.toFixed(1)} — dentro do normal`}</p>
                                                    <p>• {clickToLead > 5 ? `Conversão click→lead de ${clickToLead.toFixed(1)}% é excelente` : campClicks > 0 ? `Conversão click→lead de ${clickToLead.toFixed(1)}% — formulário pode melhorar` : 'Sem cliques no período'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* AI Full Analysis */}
                                        <div className="lg:col-span-2 p-6 rounded-xl bg-[#0d1117] border border-[#30363d] min-h-[300px]">
                                            {selectedCampaign.ai_analysis_result ? (() => {
                                                const ai = selectedCampaign.ai_analysis_result.current_analysis || selectedCampaign.ai_analysis_result;
                                                return (
                                                    <div className="space-y-6">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2 text-blue-400">
                                                                <Sparkles size={18} />
                                                                <span className="text-xs font-black uppercase tracking-widest">Diagnóstico Estratégico</span>
                                                            </div>
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${ai.saude_campanha === 'CRÍTICA' ? 'bg-red-500/10 text-red-500 border-red-500/20' : ai.saude_campanha === 'SAUDÁVEL' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                                                                SAÚDE: {ai.saude_campanha || 'ANALISANDO'}
                                                            </span>
                                                        </div>

                                                        {ai.gargalo_identificado && (
                                                            <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10">
                                                                <h5 className="text-[10px] font-bold text-red-400 uppercase mb-2">⚠️ Gargalo Identificado</h5>
                                                                <p className="text-sm font-semibold text-red-300">{ai.gargalo_identificado}</p>
                                                            </div>
                                                        )}

                                                        {ai.analise_critica && (
                                                            <div>
                                                                <h5 className="text-[10px] font-bold text-[#8b949e] uppercase mb-2">Análise Detalhada</h5>
                                                                <p className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-line">{ai.analise_critica}</p>
                                                            </div>
                                                        )}

                                                        {ai.proximos_passos && ai.proximos_passos.length > 0 && (
                                                            <div className="pt-4 border-t border-[#21262d]">
                                                                <h5 className="text-[10px] font-bold text-blue-400 uppercase mb-3">🎯 Próximos Passos — Máquina de Vendas</h5>
                                                                <div className="space-y-2">
                                                                    {ai.proximos_passos.map((step: string, i: number) => (
                                                                        <div key={i} className="flex gap-3 p-3 rounded-lg bg-[#161b22] border border-[#21262d]">
                                                                            <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                                                                            <p className="text-xs text-[#e6edf3]">{step}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* New AI Insights Cards */}
                                                        {(ai.dica_do_dia || ai.o_que_fazer_hoje || ai.alerta_de_verba || ai.comparativo_mercado) && (
                                                            <div className="pt-4 border-t border-[#21262d] space-y-4">
                                                                {ai.o_que_fazer_hoje && (
                                                                    <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                                                                        <h5 className="text-[10px] font-bold text-emerald-400 uppercase mb-2">🚀 O Que Fazer HOJE</h5>
                                                                        <p className="text-sm text-emerald-200 font-medium">{ai.o_que_fazer_hoje}</p>
                                                                    </div>
                                                                )}

                                                                {ai.dica_do_dia && (
                                                                    <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/15">
                                                                        <h5 className="text-[10px] font-bold text-yellow-400 uppercase mb-2">💡 Dica do Dia</h5>
                                                                        <p className="text-sm text-yellow-200">{ai.dica_do_dia}</p>
                                                                    </div>
                                                                )}

                                                                {ai.alerta_de_verba && (
                                                                    <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/15">
                                                                        <h5 className="text-[10px] font-bold text-blue-400 uppercase mb-2">💰 Alerta de Verba</h5>
                                                                        <p className="text-sm text-blue-200">{ai.alerta_de_verba}</p>
                                                                    </div>
                                                                )}

                                                                {ai.comparativo_mercado && (
                                                                    <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/15">
                                                                        <h5 className="text-[10px] font-bold text-purple-400 uppercase mb-2">📊 Comparativo de Mercado</h5>
                                                                        <p className="text-sm text-purple-200">{ai.comparativo_mercado}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })() : (
                                                <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                                                    <Sparkles size={40} className="mb-3 text-[#30363d]" />
                                                    <p className="text-sm text-[#8b949e]">Clique em &quot;Análise Completa IA&quot; para gerar o diagnóstico estratégico com recomendações personalizadas para transformar esta campanha em máquina de vendas.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
}
