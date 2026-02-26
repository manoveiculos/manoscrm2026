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
    RefreshCcw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { Campaign, MarketingReport, Recommendation } from '@/lib/types';

export default function MarketingPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [dailyReport, setDailyReport] = useState<MarketingReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

    const loadData = async () => {
        try {
            const [campaignData, reportData] = await Promise.all([
                dataService.getCampaigns(),
                dataService.getDailyMarketingReport()
            ]);
            setCampaigns(campaignData || []);
            setDailyReport(reportData);
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Error loading marketing data:", error);
            alert(`Erro ao carregar dados: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const token = process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
            const adAccountId = process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID;

            if (!token || !adAccountId) {
                throw new Error("Credenciais do Meta Ads não configuradas no .env.local");
            }

            const count = await dataService.syncMetaCampaigns(token, adAccountId);
            console.log(`Synced ${count} campaigns`);
            await loadData();
        } catch (err) {
            console.error("Sync failed:", err);
            alert("Erro na sincronização. Verifique o console.");
        } finally {
            setIsSyncing(false);
        }
    };

    const filteredCampaigns = campaigns.filter(c => {
        const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const isActive = c.status === 'active';
        return matchesSearch && isActive;
    });

    // --- MOTOR DE ANÁLISE IA (100% REAL - SEM DADOS INVENTADOS) ---
    const totalClicks = campaigns.reduce((acc, c) => acc + (Number(c.link_clicks) || 0), 0);
    const totalImpressions = campaigns.reduce((acc, c) => acc + (Number(c.impressions) || 0), 0);
    const totalLeads = campaigns.reduce((acc, c) => acc + (c.leads_manos_crm?.[0]?.count || 0), 0);
    const totalSpend = campaigns.reduce((acc, c) => acc + (Number(c.total_spend) || 0), 0);

    // Cálculos de Performance
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const clickToLeadRate = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // Saúde Geral do Funil (Baseado na conversão industrial: 1% - 5% é saudável para automotivo)
    const funnelHealthScore = Math.min((clickToLeadRate / 3) * 10, 10); // Meta de 3% para nota 10
    const healthPercentage = Math.min((funnelHealthScore / 10) * 100, 100);

    // Gerar resumo estratégico baseado nos dados sincronizados
    const dynamicAiSummary = totalClicks > 0
        ? `Sua operação de marketing gerou ${totalImpressions.toLocaleString()} views. Destas, ${totalClicks.toLocaleString()} pessoas clicaram e geraram ${totalLeads} leads reais. Sua eficiência de conversão está em ${(clickToLeadRate).toFixed(1)}%, com custo médio de R$ ${avgCpl.toFixed(2)} por contato.`
        : "Aguardando sincronização de dados reais do Meta Ads para iniciar análise estratégica.";

    // Gerar recomendações dinâmicas puramente baseadas em dados
    const dynamicRecommendations = dailyReport?.recommendations || [
        {
            title: ctr < 1 ? "⚠️ Criativo Saturado" : "✅ Atração Saudável",
            action: ctr < 1 ? "Trocar Imagens/Vídeos" : "Manter Estratégia",
            reason: ctr < 1
                ? `O CTR está em ${ctr.toFixed(1)}%. Poucas pessoas que veem o anúncio estão clicando. Sugerimos novos criativos.`
                : `Sua taxa de clique (${ctr.toFixed(1)}%) indica que o público se identifica com o anúncio.`
        },
        {
            title: avgCpl > 40 ? "💸 Alerta de Custo" : "🚀 Oportunidade de Escala",
            action: avgCpl > 40 ? "Refinar Segmentação" : "Aumentar Verba",
            reason: avgCpl > 40
                ? "O custo por lead está acima da média sugerida. Tente restringir o público alvo."
                : "Custo por contato excelente. Verba pode ser escalada para gerar mais volume."
        }
    ];

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 w-fit text-[10px] font-bold uppercase tracking-wider border border-blue-500/10">
                        <Sparkles size={12} className="animate-pulse" />
                        Relatório de Inteligência Diária
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white font-outfit">
                        Campaigns <span className="gradient-text">& Analytics</span>
                    </h1>
                    <p className="text-white/40 font-medium italic">
                        {filteredCampaigns.length} campanhas ativas em análise estratégica.
                        Última sincronização realizada.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`px-6 py-3.5 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all ${isSyncing
                            ? 'bg-white/5 text-white/20 cursor-not-allowed'
                            : 'bg-red-600 text-white hover:bg-red-700 shadow-[0_8px_20px_rgba(220,38,38,0.3)] hover:scale-105 active:scale-95'
                            }`}
                    >
                        <RefreshCcw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? 'Sincronizando...' : 'Sincronizar Dados Reais'}
                    </button>
                    <div className="relative group flex-1 md:flex-none">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar campanha..."
                            className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-3.5 text-sm w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium text-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="glass-card p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 group hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                            <TrendingUp size={24} />
                        </div>
                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg uppercase tracking-wider">Ativo</span>
                    </div>
                    <p className="text-[10px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Visualização Total (Meta)</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl lg:text-4xl font-black text-white font-outfit tracking-tighter">
                            {totalImpressions.toLocaleString()}
                        </h4>
                        <span className="text-[10px] font-bold text-white/20 uppercase">Vistas</span>
                    </div>
                </div>

                <div className="glass-card p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 group hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                            <Users size={24} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Leads no CRM (Manos)</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-4xl font-black text-white font-outfit tracking-tighter">
                            {totalLeads}
                        </h4>
                        <span className="text-xs font-bold text-white/20 uppercase">Leads</span>
                    </div>
                </div>

                <div className="glass-card p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 group hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                            <Target size={24} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Custo por Lead Médio</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-4xl font-black text-white font-outfit tracking-tighter">
                            R$ {avgCpl.toFixed(2)}
                        </h4>
                    </div>
                </div>

                <div className="glass-card p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 group hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                            <ArrowUpRight size={24} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Total Investido (Meta)</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-4xl font-black text-white font-outfit tracking-tighter text-emerald-400">
                            R$ {totalSpend.toLocaleString()}
                        </h4>
                    </div>
                </div>
            </div>

            {/* IA Daily Insight Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 glass-card p-10 bg-gradient-to-br from-blue-600/5 to-transparent border-blue-500/10 rounded-[3rem] relative overflow-hidden group border border-white/5">
                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/50">
                                <Sparkles size={24} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white font-outfit tracking-tight">Análise Estratégica da IA</h2>
                                <p className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mt-0.5">Relatório das últimas 24h</p>
                            </div>
                        </div>

                        <p className="text-lg font-medium text-white/70 leading-relaxed italic border-l-2 border-blue-500 pl-6">
                            &quot;{dailyReport?.summary || dynamicAiSummary}&quot;
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            {dynamicRecommendations.map((rec: Recommendation, i: number) => (
                                <div key={i} className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-all cursor-pointer group/item">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-white group-hover/item:text-blue-400 transition-colors uppercase text-[10px] tracking-widest">{rec.title}</h4>
                                        <ArrowUpRight size={16} className="text-white/20 group-hover/item:text-blue-500 transition-colors" />
                                    </div>
                                    <p className="text-xs font-black text-blue-500 uppercase tracking-widest mb-2">{rec.action}</p>
                                    <p className="text-[11px] text-white/40 leading-relaxed">{rec.reason}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="glass-card p-8 rounded-[2rem] lg:rounded-[2.5rem] bg-emerald-500/5 border border-emerald-500/10 h-full flex flex-col justify-center">
                        <p className="text-[10px] font-black uppercase text-emerald-500 tracking-[0.3em] mb-4">Saúde do Funil</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl lg:text-6xl font-black text-white font-outfit tracking-tighter">
                                {funnelHealthScore.toFixed(1)}
                            </span>
                            <span className="text-xl lg:text-2xl font-black text-emerald-500 tracking-tighter italic">/10</span>
                        </div>
                        <p className="text-xs font-bold text-white/40 mt-4 leading-relaxed">
                            Pontuação baseada na taxa de conversão real entre visualizações e leads.
                        </p>
                        <div className="mt-6 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000"
                                style={{ width: `${healthPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Campaign Table */}
            <div className="glass-card rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
                <div className="p-10 border-b border-white/5 bg-white/[0.01]">
                    <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-3 font-outfit">
                        <Target size={22} className="text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]" />
                        Performance Real por Campanha
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.25em] text-white/30 font-black">
                                <th className="px-10 py-6">Campanha</th>
                                <th className="px-6 py-6 font-outfit text-blue-400">Visualização do Anúncio</th>
                                <th className="px-6 py-6 font-outfit text-emerald-500">Sucesso (Leads CRM)</th>
                                <th className="px-6 py-6">Investimento</th>
                                <th className="px-10 py-6 text-right">Análise Avançada</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredCampaigns.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-24 text-center text-white/10 italic font-medium">
                                        Nenhuma campanha ativa encontrada. Sincronize com o Meta Ads no botão acima.
                                    </td>
                                </tr>
                            ) : filteredCampaigns.map((camp, index) => {
                                const leadCount = camp.leads_manos_crm?.[0]?.count || 0;
                                const isGoogle = camp.platform?.toLowerCase().includes('google');

                                return (
                                    <motion.tr
                                        key={camp.id}
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className="group hover:bg-white/[0.04] transition-all cursor-pointer"
                                        onClick={() => setSelectedCampaign(camp)}
                                    >
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-5">
                                                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center border shadow-xl ${isGoogle ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-blue-600/10 border-blue-600/20 text-white'}`}>
                                                    {isGoogle ? <Chrome size={24} /> : <Facebook size={24} />}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{camp.name}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Monitoramento Ativo</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-8">
                                            <div className="flex flex-col">
                                                <span className="text-xl font-black text-blue-400 font-outfit tracking-tight">{Number(camp.impressions || 0).toLocaleString()}</span>
                                                <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">Impresões Totais</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-8">
                                            <div className="flex flex-col">
                                                <span className="text-2xl font-black text-white font-outfit tracking-tight">{leadCount}</span>
                                                <span className="text-[9px] font-bold text-emerald-500/50 uppercase tracking-widest mt-1">Leads Manos CRM</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-8 font-medium">
                                            <p className="text-sm font-black text-white/60">R$ {Number(camp.total_spend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            <button className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-blue-400 group-hover:border-blue-500/40 group-hover:bg-blue-500/5 transition-all">
                                                Dicas da IA
                                            </button>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Selected Campaign Analysis Modal */}
            {selectedCampaign && (() => {
                const sLeads = selectedCampaign.leads_manos_crm?.[0]?.count || 0;
                const sClicks = Number(selectedCampaign.link_clicks) || 0;
                const sSpend = Number(selectedCampaign.total_spend) || 0;
                const sCpl = sLeads > 0 ? sSpend / sLeads : sSpend;
                const sConv = sClicks > 0 ? (sLeads / sClicks) * 100 : 0;
                const sHealth = Math.min((sConv / 3) * 10, 10);

                return (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-black/95 backdrop-blur-xl pointer-events-auto"
                            onClick={() => setSelectedCampaign(null)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="relative w-full max-w-5xl glass-card bg-zinc-950 border border-white/10 rounded-[2rem] lg:rounded-[4rem] overflow-hidden shadow-[0_60px_120px_rgba(0,0,0,0.8)] pointer-events-auto max-h-[90vh] overflow-y-auto"
                        >
                            <div className="p-6 lg:p-10 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                                <div className="flex items-center gap-4 lg:gap-6">
                                    <div className="h-10 w-10 lg:h-14 lg:w-14 rounded-2xl bg-blue-600/20 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-lg shrink-0">
                                        <Facebook size={24} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xl lg:text-3xl font-black text-white tracking-tighter uppercase font-outfit truncate">
                                            {selectedCampaign.name}
                                        </h3>
                                        <p className="text-[8px] lg:text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">Insights Reais baseados em dados</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedCampaign(null)}
                                    className="h-10 w-10 lg:h-12 lg:w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-red-500 transition-all group/close shrink-0"
                                >
                                    <RefreshCcw size={18} className="rotate-45 group-hover/close:rotate-0 transition-transform" />
                                </button>
                            </div>

                            <div className="p-6 lg:p-12 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
                                <div className="space-y-6 lg:space-y-8">
                                    <div className="p-6 lg:p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 relative group hover:bg-white/[0.05] transition-all">
                                        <div className="absolute top-6 right-6 lg:right-8 text-blue-500/20 group-hover:text-blue-500/40 transition-colors">
                                            <Facebook size={24} />
                                        </div>
                                        <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.25em] mb-4">Vistas do Anúncio</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl lg:text-5xl font-black text-blue-400 font-outfit tracking-tighter">{Number(selectedCampaign.impressions || 0).toLocaleString()}</span>
                                        </div>
                                        <p className="text-[10px] text-white/40 mt-6 leading-relaxed font-bold italic border-l border-white/10 pl-3">
                                            Frequência: Quantas vezes seu anúncio apareceu para as pessoas.
                                        </p>
                                    </div>

                                    <div className="p-6 lg:p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 flex flex-col justify-center min-h-[120px]">
                                        <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.25em] mb-2">Engajamento (Cliques)</p>
                                        <div className="text-3xl lg:text-4xl font-black text-white font-outfit tracking-tighter">
                                            {Number(selectedCampaign.link_clicks || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6 lg:space-y-8">
                                    <div className="p-6 lg:p-8 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/10 relative group hover:bg-emerald-500/[0.08] transition-all">
                                        <div className="absolute top-6 right-6 lg:right-8 text-emerald-500/20 group-hover:text-emerald-500/40 transition-colors">
                                            <TrendingUp size={24} />
                                        </div>
                                        <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-4">Sucesso (Leads CRM)</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl lg:text-5xl font-black text-white font-outfit tracking-tighter">{sLeads}</span>
                                        </div>
                                        <p className="text-[10px] text-white/40 mt-6 leading-relaxed font-bold italic border-l border-emerald-500/30 pl-3">
                                            Conversão: Clientes reais que entraram no seu CRM para atendimento.
                                        </p>
                                    </div>

                                    <div className="p-6 lg:p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 flex flex-col justify-center min-h-[120px]">
                                        <p className="text-[11px] font-black text-purple-400 uppercase tracking-[0.25em] mb-2">Custo por Lead (CPL)</p>
                                        <div className="text-3xl lg:text-4xl font-black text-white font-outfit tracking-tighter">
                                            R$ {sCpl.toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] bg-blue-600/5 border border-blue-500/15 flex flex-col justify-between shadow-inner relative overflow-hidden group">
                                    <div className="absolute -bottom-10 -right-10 text-white/[0.02] group-hover:text-blue-500/[0.05] transition-all">
                                        <Sparkles size={150} />
                                    </div>
                                    <div className="relative z-10">
                                        <h4 className="text-base font-black text-white uppercase tracking-widest flex items-center gap-3 mb-6">
                                            <Sparkles size={20} className="text-blue-500 shrink-0" />
                                            Análise dos Dados (IA)
                                        </h4>
                                        <div className="space-y-4 lg:space-y-6">
                                            <p className="text-sm font-medium text-white/70 leading-relaxed italic border-l-2 border-blue-500 pl-4 bg-blue-500/5 py-4 rounded-r-xl">
                                                {sLeads === 0
                                                    ? `Esta campanha teve ${Number(selectedCampaign.impressions).toLocaleString()} visualizações. A ausência de leads no CRM sugere uma falha técnica no link ou falta de atratividade na oferta.`
                                                    : `Com ${sLeads} leads gerados a um custo de R$ ${sCpl.toFixed(2)}, seu desempenho está ${sCpl < 30 ? 'excelente' : 'estável'}.`
                                                }
                                            </p>

                                            <div className="space-y-3 pt-2">
                                                <p className="text-[10px] font-black text-white uppercase tracking-wider opacity-30">Ação Recomendada:</p>
                                                <p className="text-[10px] font-bold text-white/60 bg-white/5 p-4 rounded-xl border border-white/5 leading-relaxed">
                                                    {sCpl < 35
                                                        ? "Otimizar orçamento para escala imediata. O custo está abaixo do teto operacional."
                                                        : "Aguardar mais 24h de dados para validar se o custo estabiliza abaixo da meta."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative z-10 pt-8 mt-6 lg:mt-10 border-t border-white/5">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase text-white/30 tracking-widest mb-3">
                                            <span>Performance Real</span>
                                            <span className="text-blue-400">{sHealth.toFixed(1)}/10</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-1000"
                                                style={{ width: `${sHealth * 10}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                );
            })()}
        </div>
    );
}
