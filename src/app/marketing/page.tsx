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
    Chrome,
    RefreshCcw,
    BarChart3,
    Zap,
    MessageCircle,
    Globe,
    Play,
    Youtube
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { Campaign, MarketingReport, Recommendation } from '@/lib/types';

export default function MarketingPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [dailyReport, setDailyReport] = useState<MarketingReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('maximum');
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);

    const handleAnalyze = async (campaign: Campaign) => {
        setAnalyzingId(campaign.id);
        try {
            const sLeads = campaign.leads_manos_crm?.[0]?.count || 0;
            const res = await fetch('/api/analyze-campaign-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign,
                    leadsSummary: {
                        total: sLeads,
                        qualified: campaign.leads_manos_crm?.filter((l: any) => l.ai_classification === 'hot' || l.ai_classification === 'warm').length || 0,
                        statusCounts: {}
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, ai_analysis_result: data } : c));
                setSelectedCampaign(prev => prev ? { ...prev, ai_analysis_result: data } : null);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setAnalyzingId(null);
        }
    };

    const loadData = async (currentFilter: string = dateFilter) => {
        setLoading(true);
        try {
            const [campaignData, reportData] = await Promise.all([
                dataService.getCampaigns(),
                dataService.getDailyMarketingReport()
            ]);

            let finalCampaigns = campaignData || [];

            // Fetch live insights if date filter is active
            if (currentFilter !== 'maximum') {
                const res = await fetch('/api/marketing/insights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date_preset: currentFilter })
                });
                const liveData = await res.json();

                if (liveData.success && liveData.data) {
                    finalCampaigns = finalCampaigns.map((c: any) => {
                        const liveC = liveData.data.find((lc: any) => lc.name === c.name);
                        if (liveC) {
                            return {
                                ...c,
                                total_spend: liveC.total_spend,
                                link_clicks: liveC.link_clicks,
                                reach: liveC.reach,
                                impressions: liveC.impressions,
                                cpc: liveC.cpc,
                                ctr: liveC.ctr,
                                cpm: liveC.cpm,
                                frequency: liveC.frequency,
                            };
                        }
                        return c;
                    });
                }
            }

            setCampaigns(finalCampaigns);
            setDailyReport(reportData);
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Error loading marketing data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(dateFilter);
    }, [dateFilter]);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/sync-meta', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                await loadData();
            } else {
                console.error("Sync error:", data.error);
            }
        } catch (err) {
            console.error("Sync failed:", err);
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

            // Lógica flexível para bater com as categorias do usuário
            const matchesCategory = platform.includes(category);

            return matchesSearch && matchesCategory;
        })
        .sort((a, b) => {
            if (!a || !b) return 0;
            // First sort by status (Active first)
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;

            // Then sort by spend (Highest first) within the same status
            const spendA = Number(a.total_spend) || 0;
            const spendB = Number(b.total_spend) || 0;

            if (spendA !== spendB) {
                return spendB - spendA;
            }

            // Finally fallback to date
            const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
            const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
            return dateB - dateA;
        });

    // --- IA ANALYTICS CORE ---
    const totalClicks = filteredCampaigns.reduce((acc, c) => acc + (Number(c.link_clicks) || 0), 0);
    const totalImpressions = filteredCampaigns.reduce((acc, c) => acc + (Number(c.impressions) || 0), 0);
    const totalLeads = filteredCampaigns.reduce((acc, c) => acc + (c.leads_manos_crm?.[0]?.count || 0), 0);
    const totalSpend = filteredCampaigns.reduce((acc, c) => acc + (Number(c.total_spend) || 0), 0);

    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const clickToLeadRate = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    const funnelHealthScore = Math.min((clickToLeadRate / 3) * 10, 10);
    const healthPercentage = (funnelHealthScore / 10) * 100;

    const dynamicAiSummary = totalClicks > 0
        ? `Sua operação de marketing gerou ${totalImpressions.toLocaleString()} visualizações. Destas, ${totalClicks.toLocaleString()} pessoas se engajaram e geraram ${totalLeads} leads reais no CRM. Eficiência de ${(clickToLeadRate).toFixed(1)}%, com custo de R$ ${avgCpl.toFixed(2)} por lead.`
        : "Aguardando sincronização de dados reais do Meta e Google para iniciar análise estratégica completa.";

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
            {/* Header Performance */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 mb-2"
                >
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400/80">Monitoramento em Tempo Real</span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <h1 className="text-2xl font-semibold tracking-tight text-[#f0f6fc]">
                        Performance de Marketing
                    </h1>
                    <p className="text-[#8b949e] mt-1 text-sm">
                        Dashboard consolidado de campanhas e análise preditiva.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap items-center gap-3"
                >
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar campanha..."
                            className="bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-4 py-2 text-sm w-full md:w-64 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all text-[#c9d1d9] placeholder:text-[#484f58]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all text-[#c9d1d9] cursor-pointer"
                    >
                        <option value="today">Hoje</option>
                        <option value="yesterday">Ontem</option>
                        <option value="this_week">Esta Semana</option>
                        <option value="last_7d">Últimos 7 Dias</option>
                        <option value="this_month">Este Mês</option>
                        <option value="maximum">Máximo (Tudo)</option>
                    </select>

                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${isSyncing
                            ? 'bg-[#21262d] text-[#484f58] border border-[#30363d]'
                            : 'bg-[#238636] hover:bg-[#2ea043] text-white'
                            }`}
                    >
                        <RefreshCcw size={14} className={isSyncing ? 'animate-spin' : ''} />
                        <span>{isSyncing ? 'Sincronizando' : 'Sincronizar'}</span>
                    </button>
                </motion.div>
            </header>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: "Visualização Total (Meta)", value: totalImpressions.toLocaleString(), unit: "VISTAS", icon: <TrendingUp size={28} className="text-blue-400" />, status: "ATIVO", color: "blue" },
                    { label: "Leads no CRM (Manos)", value: totalLeads.toString(), unit: "LEADS", icon: <Users size={28} className="text-purple-400" />, color: "purple" },
                    { label: "Custo por Lead Médio", value: `R$ ${avgCpl.toFixed(2)}`, unit: "MÉDIA", icon: <Target size={28} className="text-red-400" />, color: "red" },
                    { label: "Total Investido (Meta)", value: `R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, unit: "REAL", icon: <ArrowUpRight size={28} className="text-emerald-400" />, color: "emerald" }
                ].map((kpi, idx) => (
                    <motion.div
                        key={kpi.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + (idx * 0.1) }}
                        className="relative p-5 rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-[#8b949e]/30 transition-all shadow-sm"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-[#8b949e]">
                                {kpi.icon}
                            </div>
                            {kpi.status && (
                                <span className="text-[10px] font-medium text-[#3fb950] bg-[#3fb950]/10 px-2 py-0.5 rounded-full border border-[#3fb950]/20">
                                    {kpi.status}
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-medium text-[#8b949e] mb-1">{kpi.label}</p>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-2xl font-semibold text-[#f0f6fc] tracking-tight">
                                {kpi.value}
                            </h4>
                            <span className="text-[10px] font-medium text-[#484f58] uppercase tracking-wider">{kpi.unit}</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* AI Strategic Analysis Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="lg:col-span-8 p-6 rounded-xl bg-[#0d1117] border border-[#30363d] flex flex-col justify-between"
                >
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                <Sparkles size={18} className="text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-[#f0f6fc]">Análise de IA</h2>
                                <p className="text-[10px] text-[#8b949e] uppercase tracking-wider">Metadados Processados • 24h</p>
                            </div>
                        </div>

                        <blockquote className="text-lg font-medium text-[#c9d1d9] leading-relaxed border-l-2 border-blue-500 pl-4 mb-8">
                            &quot;{dailyReport?.summary || dynamicAiSummary}&quot;
                        </blockquote>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {recommendations.map((rec, i) => (
                                <div key={i} className="p-4 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-blue-500/50 transition-all group/item">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">{rec.title}</h4>
                                        <ArrowUpRight size={14} className="text-[#484f58] group-hover/item:text-blue-500 transition-colors" />
                                    </div>
                                    <p className="text-sm font-semibold text-blue-400 mb-1">{rec.action}</p>
                                    <p className="text-[12px] text-[#8b949e] leading-normal">{rec.reason}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 }}
                    className="lg:col-span-4 p-6 rounded-xl bg-[#0d1117] border border-[#30363d] flex flex-col justify-between"
                >
                    <div>
                        <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-6">Eficiência Global</p>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-5xl font-bold text-[#f0f6fc] tracking-tight">
                                {funnelHealthScore.toFixed(1)}
                            </span>
                            <span className="text-lg font-semibold text-[#3fb950]">/10</span>
                        </div>
                        <p className="text-[12px] text-[#484f58] leading-tight">
                            Score de conversão processado via IA.
                        </p>
                    </div>

                    <div className="space-y-4 mt-8">
                        <div className="h-2 w-full bg-[#161b22] rounded-full overflow-hidden border border-[#30363d]">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${healthPercentage}%` }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="h-full bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                            />
                        </div>
                        <div className="flex justify-between text-[10px] font-bold text-[#484f58] tracking-widest uppercase">
                            <span>Otimizar</span>
                            <span>Escalar</span>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Campaigns Table / List */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="flex flex-wrap gap-2 mb-6"
            >
                {['Todas', 'Meta Ads', 'Google Ads', 'TikTok', 'Youtube', 'Whatsapp'].map((plat) => (
                    <button
                        key={plat}
                        onClick={() => setSelectedCategory(plat)}
                        className={`px-4 py-2 rounded-lg text-xs font-medium transition-all border ${selectedCategory === plat
                            ? 'bg-[#21262d] border-[#8b949e] text-[#f0f6fc]'
                            : 'bg-transparent border-[#30363d] text-[#8b949e] hover:bg-[#161b22] hover:border-[#484f58]'
                            }`}
                    >
                        {plat}
                    </button>
                ))}
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden shadow-sm"
            >
                <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]/50 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#f0f6fc] flex items-center gap-2">
                        <BarChart3 size={16} className="text-[#8b949e]" />
                        Inventário de Campanhas
                    </h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[#30363d] text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold bg-[#161b22]/30">
                                <th className="px-6 py-3">Campanha</th>
                                <th className="px-4 py-3">Custo / Orçamento</th>
                                <th className="px-4 py-3">Performance (CTR/CPC)</th>
                                <th className="px-4 py-3">Conversão CRM</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredCampaigns.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-12 py-32 text-center">
                                        <div className="flex flex-col items-center gap-4 text-white/10 italic">
                                            <Zap size={48} />
                                            <p className="text-xl font-medium">Nenhuma campanha ativa detectada no momento.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredCampaigns.map((camp, index) => {
                                const leadCount = camp.leads_manos_crm?.[0]?.count || 0;
                                const plat = (camp.platform || '').toLowerCase();
                                const isGoogle = plat.includes('google');
                                const isWhatsApp = plat.includes('whatsapp');
                                const status = camp.status === 'active' ? 'active' : 'paused';

                                const showSeparator = index === 0 || filteredCampaigns[index - 1].status !== camp.status;

                                return (
                                    <React.Fragment key={camp.id}>
                                        {showSeparator && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-2 bg-[#161b22]/20 border-b border-[#30363d]">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-[#3fb950]' : 'bg-[#484f58]'}`} />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">
                                                            {status === 'active' ? 'Ativas' : 'Pausadas'}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        <motion.tr
                                            key={camp.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 1 + (index * 0.05) }}
                                            className="group hover:bg-[#161b22]/50 transition-all cursor-pointer border-b border-[#30363d]/50"
                                            onClick={() => setSelectedCampaign(camp)}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${isGoogle ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                                        isWhatsApp ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                                            plat.includes('tiktok') ? 'bg-[#161b22] border-[#30363d] text-[#f0f6fc]' :
                                                                plat.includes('youtube') ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                                                    'bg-blue-600/10 border-blue-600/20 text-blue-600'
                                                        }`}>
                                                        {isGoogle ? <Globe size={14} /> :
                                                            isWhatsApp ? <MessageCircle size={14} /> :
                                                                plat.includes('tiktok') ? <Play size={14} /> :
                                                                    plat.includes('youtube') ? <Youtube size={14} /> :
                                                                        <Facebook size={14} />}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-sm text-[#c9d1d9] group-hover:text-blue-400 transition-colors tracking-tight">{camp.name}</p>
                                                        <p className="text-[10px] text-[#8b949e] uppercase tracking-wider">{camp.platform}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-[#f0f6fc]">R$ {Number(camp.total_spend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                    <span className="text-[10px] text-[#8b949e] uppercase tracking-wider">INVESTIDO</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-[#f0f6fc]">{Number(camp.ctr || 0).toFixed(2)}%</span>
                                                    <span className="text-[10px] text-[#8b949e] uppercase tracking-wider">CTR | R$ {Number(camp.cpc || 0).toFixed(2)} CPC</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-[#3fb950]">{leadCount}</span>
                                                    <span className="text-[10px] text-[#8b949e] uppercase tracking-wider">LEADS GERADOS</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="px-3 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[10px] font-bold uppercase tracking-wider text-[#8b949e] hover:border-blue-500 hover:text-blue-500 transition-all">
                                                    ANALISAR
                                                </button>
                                            </td>
                                        </motion.tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* Full Analysis Modal */}
            <AnimatePresence>
                {selectedCampaign && (() => {
                    const sLeads = selectedCampaign.leads_manos_crm?.[0]?.count || 0;
                    const sClicks = Number(selectedCampaign.link_clicks) || 0;
                    const sSpend = Number(selectedCampaign.total_spend) || 0;
                    const sCpl = sLeads > 0 ? sSpend / sLeads : sSpend;
                    const sConv = sClicks > 0 ? (sLeads / sClicks) * 100 : 0;
                    const sHealth = Math.min((sConv / 3) * 10, 10);
                    const isGoogle = selectedCampaign.platform?.toLowerCase().includes('google');
                    const isWhatsApp = selectedCampaign.platform?.toLowerCase().includes('whatsapp');

                    const aiInsights = selectedCampaign.ai_analysis_result ? [
                        { label: 'Saúde', value: selectedCampaign.ai_analysis_result.saude_campanha, type: selectedCampaign.ai_analysis_result.saude_campanha === 'CRÍTICA' ? 'negative' : selectedCampaign.ai_analysis_result.saude_campanha === 'EXCELENTE' ? 'positive' : 'neutral' },
                        { label: 'Gargalo', value: selectedCampaign.ai_analysis_result.gargalo_identificado, type: 'negative' },
                        { label: 'Ação Recomendada 1', value: selectedCampaign.ai_analysis_result.proximos_passos[0], type: 'neutral' },
                        { label: 'Ação Recomendada 2', value: selectedCampaign.ai_analysis_result.proximos_passos[1], type: 'neutral' },
                        { label: 'Ação Recomendada 3', value: selectedCampaign.ai_analysis_result.proximos_passos[2], type: 'neutral' },
                        { label: 'Resumo Técnico', value: selectedCampaign.ai_analysis_result.analise_critica, type: 'neutral' }
                    ].filter(i => i.value) : [
                        { label: 'Status', value: 'Aguardando processamento de dados do CRM...', type: 'neutral' }
                    ];

                    return (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 lg:p-20">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/98 backdrop-blur-3xl"
                                onClick={() => setSelectedCampaign(null)}
                            />
                            <motion.div
                                initial={{ scale: 0.98, opacity: 0, y: 10 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.98, opacity: 0, y: 10 }}
                                className="relative w-full max-w-6xl h-full max-h-[90vh] bg-[#010409] border border-[#30363d] rounded-xl overflow-hidden shadow-2xl flex flex-col font-sans"
                            >
                                <div className="px-8 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
                                    <div className="flex items-center gap-4">
                                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center border ${isGoogle ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                            isWhatsApp ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                                'bg-[#161b22] border-[#30363d] text-[#f0f6fc]'
                                            }`}>
                                            {isGoogle ? <Globe size={18} /> :
                                                isWhatsApp ? <MessageCircle size={18} /> :
                                                    <Facebook size={18} />}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-[#f0f6fc] tracking-tight">
                                                {selectedCampaign.name}
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Monitoramento Enterprise</p>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedCampaign(null)}
                                        className="h-8 w-8 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#30363d] transition-all"
                                    >
                                        <RefreshCcw size={14} className="rotate-45" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-4 gap-8 bg-[#0d1117]/30">
                                    <div className="space-y-6">
                                        <div className="p-6 rounded-lg bg-[#0d1117] border border-[#30363d] relative overflow-hidden">
                                            <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-6">Volume de Alcance</p>
                                            <h4 className="text-4xl font-bold text-[#f0f6fc] tracking-tight">
                                                {Number(selectedCampaign.impressions || 0).toLocaleString()}
                                            </h4>
                                            <p className="text-[11px] text-[#484f58] mt-4 border-t border-[#30363d] pt-4">
                                                Impressões totais processadas via API.
                                            </p>
                                        </div>
                                        <div className="p-6 rounded-lg bg-[#0d1117] border border-[#30363d]">
                                            <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-4">Pessoas Únicas (Reach)</p>
                                            <h4 className="text-3xl font-bold text-[#f0f6fc] tracking-tight">
                                                {Number(selectedCampaign.reach || 0).toLocaleString()}
                                            </h4>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="p-6 rounded-lg bg-[#0d1117] border border-[#30363d] relative overflow-hidden">
                                            <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-6">CLIQUES TOTAIS</p>
                                            <h4 className="text-4xl font-bold text-[#f0f6fc] tracking-tight">
                                                {Number(selectedCampaign.link_clicks || 0).toLocaleString()}
                                            </h4>
                                            <p className="text-[11px] text-[#484f58] mt-4 border-t border-[#30363d] pt-4">
                                                Cliques no link da campanha.
                                            </p>
                                        </div>
                                        <div className="p-6 rounded-lg bg-[#0d1117] border border-[#30363d] flex justify-between items-center gap-4">
                                            <div>
                                                <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2">CPM</p>
                                                <h4 className="text-xl font-bold text-[#f0f6fc] tracking-tight">
                                                    R$ {Number(selectedCampaign.cpm || 0).toFixed(2)}
                                                </h4>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2">Frequência</p>
                                                <h4 className="text-xl font-bold text-[#f0f6fc] tracking-tight">
                                                    {Number(selectedCampaign.frequency || 0).toFixed(2)}x
                                                </h4>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="p-6 rounded-lg bg-[#0d1117] border border-[#3fb950]/20 relative overflow-hidden">
                                            <div className="absolute top-4 right-4 text-[#3fb950]/10">
                                                <TrendingUp size={24} />
                                            </div>
                                            <p className="text-[10px] font-bold text-[#3fb950] uppercase tracking-wider mb-6">Conversões CRM</p>
                                            <h4 className="text-4xl font-bold text-[#f0f6fc] tracking-tight">
                                                {sLeads}
                                            </h4>
                                            <p className="text-[11px] text-[#484f58] mt-4 border-t border-[#30363d] pt-4">
                                                Contatos qualificados confirmados.
                                            </p>
                                        </div>
                                        <div className="p-6 rounded-lg bg-[#0d1117] border border-[#30363d]">
                                            <p className="text-[10px] font-bold text-[#d29922] uppercase tracking-wider mb-4">CPL Médio</p>
                                            <h4 className="text-3xl font-bold text-[#f0f6fc] tracking-tight text-emerald-400">
                                                R$ {sCpl.toFixed(2)}
                                            </h4>
                                        </div>
                                    </div>

                                    <div className="flex flex-col h-full rounded-lg bg-[#0d1117] border border-[#30363d] p-6 overflow-hidden relative max-h-[80vh]">
                                        <div className="relative z-10 flex flex-col h-full">
                                            <div className="flex items-center gap-3 mb-8 shrink-0">
                                                <Sparkles size={16} className="text-blue-400" />
                                                <h4 className="text-[10px] font-bold text-[#f0f6fc] uppercase tracking-wider">Otimização AI</h4>
                                            </div>
                                            <div className="flex-1 space-y-4 text-left overflow-y-auto pr-2 pb-4">
                                                {aiInsights.map((insight: any, i: number) => (
                                                    <div key={i} className={`group/insight p-3 rounded-lg border ${insight.type === 'positive' ? 'bg-[#3fb950]/5 border-[#3fb950]/20' :
                                                        insight.type === 'neutral' ? 'bg-[#d29922]/5 border-[#d29922]/20' : 'bg-[#f85149]/5 border-[#f85149]/20'
                                                        }`}>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className={`h-1.5 w-1.5 rounded-full ${insight.type === 'positive' ? 'bg-[#3fb950]' :
                                                                insight.type === 'neutral' ? 'bg-[#d29922]' : 'bg-[#f85149]'
                                                                }`} />
                                                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#f0f6fc]">{insight.label}</span>
                                                        </div>
                                                        <p className={`text-[13px] leading-relaxed ${insight.type === 'positive' ? 'text-[#3fb950]' :
                                                            insight.type === 'neutral' ? 'text-[#d29922]' : 'text-[#f85149]'
                                                            }`}>
                                                            {insight.value}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAnalyze(selectedCampaign);
                                                }}
                                                disabled={analyzingId === selectedCampaign.id}
                                                className="mt-8 w-full py-2.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:bg-[#21262d] disabled:text-[#484f58]"
                                            >
                                                {analyzingId === selectedCampaign.id ? (
                                                    <>
                                                        <RefreshCcw size={14} className="animate-spin" />
                                                        Processando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Zap size={14} />
                                                        Gerar Nova Análise
                                                    </>
                                                )}
                                            </button>
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
