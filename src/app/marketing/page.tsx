'use client';

import React, { useEffect, useState } from 'react';
import { 
    Search, 
    RefreshCcw, 
    Sparkles, 
    Target,
    Activity,
    Facebook,
    Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { Campaign, MarketingReport } from '@/lib/types';

// Components
import { KPISectionV2 } from './components/KPISectionV2';
import { CampaignsTableV2 } from './components/CampaignsTableV2';
import { CampaignReportModalV2 } from './components/CampaignReportModalV2';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

export default function MarketingPageV2() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [dailyReport, setDailyReport] = useState<MarketingReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('this_month');
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [crmLeadsByCampaign, setCrmLeadsByCampaign] = useState<Record<string, number>>({});
    const [selectedCategory, setSelectedCategory] = useState('Todas');

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
                if (selectedCampaign?.id === campaign.id) {
                    setSelectedCampaign({ ...campaign, ai_analysis_result: data });
                }
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
                        const liveC = liveData.data.find((lc: any) => lc.id === c.meta_id || lc.name === c.name);
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

    const handleSync = async (platform: 'meta' | 'google') => {
        setIsSyncing(true);
        const endpoint = platform === 'meta' ? '/api/sync-meta' : '/api/sync-google';
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                await loadData();
                alert(`Sincronização ${platform === 'meta' ? 'Meta' : 'Google'} concluída!`);
            } else {
                alert("Erro: " + data.error);
            }
        } catch (err) {
            alert("Falha na rede ao sincronizar.");
        } finally {
            setIsSyncing(false);
        }
    };

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
            return spendB - spendA;
        });

    const totalClicks = filteredCampaigns.reduce((acc, c) => acc + (Number(c.link_clicks) || 0), 0);
    const totalImpressions = filteredCampaigns.reduce((acc, c) => acc + (Number(c.impressions) || 0), 0);
    const totalLeads = filteredCampaigns.reduce((acc, c) => acc + (Number(c.meta_results) || 0), 0);
    const totalSpend = filteredCampaigns.reduce((acc, c) => acc + (Number(c.total_spend) || 0), 0);

    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const clickToLeadRate = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    const funnelHealthScore = Math.min((clickToLeadRate / 3) * 10, 10);
    const healthPercentage = (funnelHealthScore / 10) * 100;

    const dynamicAiSummary = totalClicks > 0
        ? `Sua operação gerou ${totalImpressions.toLocaleString()} visualizações. Foram ${totalClicks.toLocaleString()} cliques e ${totalLeads} leads no CRM. Eficiência de ${(clickToLeadRate).toFixed(1)}%, com custo de R$ ${avgCpl.toFixed(2)} por lead.`
        : "Aguardando sincronização de dados.";

    const rawRecs = dailyReport?.recommendations;
    let parsedRecs = Array.isArray(rawRecs) ? rawRecs : [];
    if (typeof rawRecs === 'string') {
        try { parsedRecs = JSON.parse(rawRecs); } catch (e) { parsedRecs = []; }
    }

    const recommendations = (parsedRecs.length > 0 && typeof parsedRecs[0] === 'object') ? parsedRecs : [
        {
            title: ctr < 1 ? "⚠️ CRIATIVO SATURADO" : "✅ ATRAÇÃO SAUDÁVEL",
            action: ctr < 1 ? "TROCAR CRIATIVOS" : "MANTER ESTRATÉGIA",
            reason: `Taxa de clique de ${ctr.toFixed(1)}% detectada.`
        },
        {
            title: avgCpl < 35 ? "🚀 OPORTUNIDADE" : "💸 ALERTA DE CUSTO",
            action: avgCpl < 35 ? "ESCALAR VERBA" : "REFINAR PÚBLICO",
            reason: `CPL médio em R$ ${avgCpl.toFixed(2)}.`
        }
    ];

    if (loading) {
        return (
            <div className="flex h-[80vh] w-full items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(239,68,68,0.2)]" />
            </div>
        );
    }

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="w-full space-y-6 pb-32 pt-0 px-2 md:px-0"
        >
            {/* HUD HEADER */}
            <header className="border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 px-6 py-3 -mx-2 md:-mx-0 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                {/* Left: identity + live indicator */}
                <div className="flex items-center gap-5">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <Activity size={14} className="text-red-600 animate-pulse" />
                            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/90">
                                Campanhas <span className="text-red-500">& Marketing</span>
                            </h1>
                        </div>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-0.5">V2.5 // Marketing Intelligence</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-1">
                        <div className="h-6 w-[1px] bg-white/5 mr-3" />
                        <span className="text-xs font-black text-white/70 tabular-nums">{totalImpressions.toLocaleString('pt-BR')}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">views</span>
                        <span className="w-px h-3 bg-white/10 mx-2" />
                        <span className="text-xs font-black text-red-400 tabular-nums">{totalLeads}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">leads</span>
                    </div>
                </div>

                {/* Right: controls */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative group/s">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within/s:text-red-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="BUSCAR..."
                            className="bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-[10px] font-black uppercase tracking-widest w-36 focus:w-52 focus:bg-white/10 focus:border-red-500/30 outline-none transition-all text-white placeholder:text-white/10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white cursor-pointer hover:bg-white/10 transition-all focus:outline-none focus:border-red-500/30"
                    >
                        <option value="today">Hoje</option>
                        <option value="yesterday">Ontem</option>
                        <option value="last_7d">7 Dias</option>
                        <option value="this_month">Este Mês</option>
                        <option value="last_month">Mês Passado</option>
                        <option value="maximum">Tudo</option>
                    </select>

                    <div className="flex gap-1">
                        <button
                            onClick={() => handleSync('meta')}
                            disabled={isSyncing}
                            className="h-9 w-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:bg-red-600/20 hover:text-red-500 hover:border-red-500/30 transition-all active:scale-95 disabled:opacity-50"
                            title="Sync Meta Ads"
                        >
                            <Facebook size={15} className={isSyncing ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={() => handleSync('google')}
                            disabled={isSyncing}
                            className="h-9 w-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:bg-red-600/20 hover:text-red-500 hover:border-red-500/30 transition-all active:scale-95 disabled:opacity-50"
                            title="Sync Google Ads"
                        >
                            <Globe size={15} className={isSyncing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </header>

            {/* KPI Section */}
            <KPISectionV2 
                totalImpressions={totalImpressions}
                totalLeads={totalLeads}
                avgCpl={avgCpl}
                totalSpend={totalSpend}
            />

            {/* AI Strategic Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <motion.div 
                    variants={container}
                    className="lg:col-span-8 p-10 rounded-[2.5rem] bg-[#0C0C0F] border border-white/5 shadow-2xl relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[80px] -mr-32 -mt-32 opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    <div className="flex items-center gap-4 mb-8">
                        <div className="h-10 w-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-500">
                            <Sparkles size={20} />
                        </div>
                        <h2 className="text-xl font-black text-white tracking-tight uppercase">Análise Estratégica IA</h2>
                    </div>

                    <div className="mb-10 p-8 rounded-3xl bg-white/[0.03] border-l-4 border-red-600 relative overflow-hidden">
                        <Target className="absolute -right-8 -bottom-8 w-48 h-48 text-white/[0.02] -rotate-12" />
                        <p className="text-xl text-white/80 leading-relaxed font-medium italic relative z-10">&quot;{dynamicAiSummary}&quot;</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {recommendations.slice(0, 2).map((rec: any, i: number) => (
                            <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-red-600/20 transition-all group/item">
                                <p className="text-[10px] font-black text-red-500/50 uppercase tracking-[0.3em] mb-2">{rec?.title}</p>
                                <p className="text-base font-black text-white mb-2">{rec?.action}</p>
                                <p className="text-xs text-white/30 font-medium leading-relaxed">{rec?.reason}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.div 
                    variants={container}
                    className="lg:col-span-4 p-10 rounded-[2.5rem] bg-[#0C0C0F] border border-white/5 shadow-2xl flex flex-col justify-center relative overflow-hidden group"
                >
                    <div className="absolute bottom-0 right-0 w-32 h-32 bg-red-600/5 blur-[50px] -mr-16 -mb-16 pointer-events-none" />
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] mb-6">CRM Efficiency Score</p>
                    
                    <div className="flex items-baseline gap-2 mb-6">
                        <span className="text-7xl font-black text-white tracking-tighter tabular-nums">{funnelHealthScore.toFixed(1)}</span>
                        <span className="text-xl font-black text-red-600">/10</span>
                    </div>

                    <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${healthPercentage}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-red-800 to-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.4)]" 
                        />
                    </div>
                    
                    <p className="mt-6 text-[11px] text-white/20 font-bold uppercase tracking-widest text-center">Saúde da Operação</p>
                </motion.div>
            </div>

            {/* Campaign Filtering & Table */}
            <div className="space-y-6">
                <div className="flex flex-wrap gap-3">
                    {['Todas', 'Meta Ads', 'Google Ads'].map((plat) => (
                        <button
                            key={plat}
                            onClick={() => setSelectedCategory(plat)}
                            className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                selectedCategory === plat 
                                    ? 'bg-red-600 border-red-500 text-white shadow-[0_5px_15px_rgba(220,38,38,0.3)] scale-105' 
                                    : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            {plat}
                        </button>
                    ))}
                </div>

                <CampaignsTableV2 
                    campaigns={filteredCampaigns}
                    leadsCount={crmLeadsByCampaign}
                    onSelect={(camp) => setSelectedCampaign(camp)}
                />
            </div>

            {/* Detail Modal */}
            <CampaignReportModalV2 
                campaign={selectedCampaign}
                onClose={() => setSelectedCampaign(null)}
                leadsCount={selectedCampaign ? (Number(selectedCampaign.meta_results) || 0) : 0}
                onAnalyze={handleAnalyze}
                analyzingId={analyzingId}
            />
        </motion.div>
    );
}
