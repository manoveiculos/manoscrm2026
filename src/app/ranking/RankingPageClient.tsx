'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
    Trophy, 
    Award,
    Zap,
    Crown,
    X,
    BarChart3
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getSalesRanking, getFinancialMetrics } from '@/lib/services/analyticsService';

const supabase = createClient();

interface ConsultantRanking {
    id: string;
    name: string;
    salesCount: number;
    leadCount: number;
    conversion: number;
    avgResponseMin: number;
    eliteScore: number;
    topSource: string;
    trend: 'up' | 'down' | 'stable';
}

const container = {
    hidden: { opacity: 0 },
    show: { 
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 25, stiffness: 200 } }
};

export function RankingPageClient() {
    const [ranking, setRanking] = useState<ConsultantRanking[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
    const [selectedConsultant, setSelectedConsultant] = useState<ConsultantRanking | null>(null);
    const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
    const [funnelData, setFunnelData] = useState<any>(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    const loadRanking = async () => {
        setLoading(true);
        try {
            const now = new Date();
            let startDate: Date | null = null;
            if (period === 'today') { startDate = new Date(now); startDate.setHours(0,0,0,0); }
            else if (period === 'week') { startDate = new Date(now); startDate.setDate(now.getDate() - 7); }
            else if (period === 'month') { startDate = new Date(now); startDate.setDate(now.getDate() - 30); }

            const startDateISO = startDate?.toISOString();
            const rankingData = await getSalesRanking(startDateISO);

            const processed: ConsultantRanking[] = rankingData.map((r: any) => ({
                id: r.id,
                name: r.name,
                salesCount: r.salesCount || 0,
                leadCount: r.leadCount || 0,
                conversion: r.conversion || 0,
                avgResponseMin: r.avgResponseMin || 0,
                eliteScore: r.eliteScore || 0,
                topSource: r.topSource || 'Meta',
                trend: 'up' as const
            }));

            setRanking(processed);
        } catch (error) {
            console.error('Error loading ranking:', error);
        } finally {
            setLoading(false);
        }
    };

    const openAnalysis = async (consultant: ConsultantRanking) => {
        setSelectedConsultant(consultant);
        setIsAnalysisOpen(true);
        setLoadingAnalysis(true);
        try {
            const metrics = await getFinancialMetrics({
                period: period === 'today' ? 'today' : period === 'week' ? 'this_week' : 'this_month',
                consultantId: consultant.id
            });
            setFunnelData(metrics.funnelData);
        } catch (error) {
            console.error("Error loading analysis data:", error);
        } finally {
            setLoadingAnalysis(false);
        }
    };

    useEffect(() => {
        loadRanking();
    }, [period]);

    if (loading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-6">
                <div className="relative">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                        className="h-20 w-20 border-[3px] border-t-red-600 border-r-transparent border-b-white/5 border-l-transparent rounded-full shadow-[0_0_40px_rgba(239,68,68,0.2)]"
                    />
                    <Trophy className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20" size={24} />
                </div>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.5em] animate-pulse">Consultando Podium...</p>
            </div>
        );
    }

    return (
        <div className="w-full space-y-8 pb-32">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-0">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                            <Trophy size={18} />
                        </div>
                        <h1 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase">
                            Ranking <span className="text-red-500">de Vendas</span>
                        </h1>
                    </div>
                    <p className="text-[10px] md:text-11px text-white/30 font-bold uppercase tracking-[0.3em] max-w-lg leading-relaxed">
                        Performance consolidada dos consultores Manos Veículos.
                        <span className="text-white/50"> Competitividade, transparência e meritocracia.</span>
                    </p>
                </div>

                <div className="flex items-center bg-white/[0.03] border border-white/10 p-1.5 rounded-2xl shadow-xl backdrop-blur-md self-start md:self-auto">
                    {(['today', 'week', 'month', 'all'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                                period === p 
                                ? 'bg-red-600 text-white shadow-[0_8px_20px_rgba(239,68,68,0.3)]' 
                                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                            }`}
                        >
                            {p === 'today' ? 'Hoje' : p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : 'Geral'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Podium Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4 md:px-0">
                {ranking.slice(0, 3).map((consultant, idx) => {
                    const isFirst = idx === 0;
                    const isSecond = idx === 1;
                    return (
                        <motion.div
                            key={consultant.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`relative overflow-hidden rounded-[2.5rem] border p-8 flex flex-col items-center text-center transition-all group ${
                                isFirst 
                                ? 'bg-gradient-to-b from-amber-500/10 via-transparent to-transparent border-amber-500/30 md:scale-105 z-10 shadow-[0_20px_50px_rgba(245,158,11,0.1)]' 
                                : isSecond
                                ? 'bg-gradient-to-b from-slate-400/10 via-transparent to-transparent border-slate-400/20'
                                : 'bg-gradient-to-b from-orange-800/10 via-transparent to-transparent border-orange-800/20'
                            }`}
                        >
                            <div className={`absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 blur-[80px] pointer-events-none opacity-30 ${
                                isFirst ? 'bg-amber-500' : isSecond ? 'bg-slate-400' : 'bg-orange-800'
                            }`} />

                            <div className="relative mb-6">
                                <div className={`h-24 w-24 rounded-3xl flex items-center justify-center text-3xl font-black uppercase border-2 shadow-2xl ${
                                    isFirst ? 'bg-[#1A1A20] border-amber-500 text-amber-500' :
                                    isSecond ? 'bg-[#1A1A20] border-slate-400 text-slate-400' :
                                    'bg-[#1A1A20] border-orange-800 text-orange-800'
                                }`}>
                                    {consultant.name[0]}
                                </div>
                                <div className={`absolute -top-3 -right-3 h-10 w-10 rounded-2xl flex items-center justify-center shadow-lg ${
                                    isFirst ? 'bg-amber-500 text-black' :
                                    isSecond ? 'bg-slate-400 text-black' :
                                    'bg-orange-800 text-white'
                                }`}>
                                    {isFirst ? <Crown size={20} /> : <span className="font-black text-xs">{idx + 1}º</span>}
                                </div>
                            </div>

                            <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1 group-hover:text-amber-500 transition-colors">
                                {consultant.name.split(' ').slice(0, 2).join(' ')}
                            </h3>
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-6">Foco: {consultant.topSource}</p>
                            
                            <div className="flex items-center gap-4 mb-8">
                                <div className="text-center px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-3xl font-black text-white tabular-nums">{consultant.salesCount}</p>
                                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Vendas</p>
                                </div>
                                <div className="h-10 w-px bg-white/10" />
                                <div className="text-center">
                                    <p className="text-lg font-black text-emerald-400 tabular-nums">{consultant.conversion.toFixed(1)}%</p>
                                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Conv.</p>
                                </div>
                            </div>

                            {/* Progress to Goal */}
                            <div className="w-full space-y-2 mb-8">
                                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-white/30">
                                    <span>Progresso Meta</span>
                                    <span className="text-white/60">{consultant.salesCount}/15</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, (consultant.salesCount / 15) * 100)}%` }}
                                        className={`h-full ${isFirst ? 'bg-amber-500' : 'bg-red-600'}`}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 w-full">
                                <div className="bg-white/5 p-3 rounded-2xl text-left border border-white/5">
                                    <p className="text-[14px] font-black text-white/80">{consultant.eliteScore}%</p>
                                    <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Score Elite</p>
                                </div>
                                <div className="bg-white/5 p-3 rounded-2xl text-left border border-white/5">
                                    <p className="text-[14px] font-black text-white/80">{consultant.avgResponseMin}m</p>
                                    <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Resp.</p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* List View for other consultants */}
            {ranking.length > 3 && (
                <motion.div 
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="mx-4 md:mx-0 space-y-3"
                >
                    <div className="px-6 mb-4 flex items-center justify-between">
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Restante da Equipe</p>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Performance</p>
                    </div>

                    <div className="bg-[#0d0d10]/50 border border-white/[0.04] rounded-[2rem] overflow-hidden backdrop-blur-md">
                        {ranking.slice(3).map((consultant, i) => (
                            <motion.div
                                key={consultant.id}
                                variants={item}
                                className="flex items-center gap-6 px-8 py-5 hover:bg-white/[0.03] transition-all group border-b border-white/[0.03] last:border-0"
                            >
                                <span className="text-sm font-black text-white/10 w-6 shrink-0">{i + 4}º</span>
                                
                                <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center font-black text-white/40 shrink-0 group-hover:border-white/20 transition-all">
                                    {consultant.name[0]}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-black text-white/90 group-hover:text-red-500 transition-colors uppercase tracking-tight">{consultant.name}</p>
                                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">{consultant.leadCount} leads atendidos</p>
                                </div>

                                <div className="flex items-center gap-8 shrink-0">
                                    <div className="text-right">
                                        <div className="flex items-center gap-2 justify-end mb-0.5">
                                            <Zap size={10} className="text-amber-500" />
                                            <p className="text-lg font-black text-white tabular-nums">{consultant.salesCount}</p>
                                        </div>
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Vendas</p>
                                    </div>
                                    <div className="text-right w-16">
                                        <p className="text-[14px] font-black text-emerald-400 tabular-nums">{consultant.conversion.toFixed(1)}%</p>
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Conv.</p>
                                    </div>
                                    <div className="text-right w-16 hidden sm:block">
                                        <p className="text-[14px] font-black text-white/40 tabular-nums">{consultant.avgResponseMin}m</p>
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Espera</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Footer Summary */}
            <div className="mx-4 md:mx-0 p-8 rounded-[3rem] bg-gradient-to-r from-red-600/10 to-transparent border border-red-500/10 mt-12 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                    <div className="h-16 w-16 rounded-[2rem] bg-red-600/20 flex items-center justify-center text-red-500 shadow-2xl shadow-red-600/10 border border-red-500/20">
                        <Award size={32} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-widest mb-1">Cultura de Resultado</h4>
                        <p className="text-xs text-white/40 font-medium leading-relaxed max-w-sm">
                            O ranking é atualizado em tempo real. Cada "Marcado como Vendido" no CRM reflete instantaneamente aqui.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => window.location.href = '/pulse'}
                        className="px-8 py-3.5 rounded-2xl bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all"
                    >
                        Puxar Novo Lead
                    </button>
                    <button 
                        onClick={() => ranking[0] && openAnalysis(ranking[0])}
                        className="px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all font-outfit"
                    >
                        Análise Full (1º Lugar)
                    </button>
                </div>
            </div>

            {/* Analysis Full Modal */}
            {isAnalysisOpen && selectedConsultant && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsAnalysisOpen(false)}
                        className="absolute inset-0 bg-black/90 backdrop-blur-xl" 
                    />
                    
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="relative w-full max-w-4xl bg-[#0F0F12] border border-white/10 rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(239,68,68,0.1)] p-8 md:p-12"
                    >
                        <button 
                            onClick={() => setIsAnalysisOpen(false)}
                            className="absolute top-8 right-8 h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex flex-col md:flex-row items-start gap-12">
                            <div className="w-full md:w-1/3 space-y-8">
                                <div className="space-y-4">
                                    <div className="h-20 w-20 rounded-[2rem] bg-red-600/20 flex items-center justify-center text-red-500 border border-red-500/20 font-black text-3xl">
                                        {selectedConsultant.name[0]}
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{selectedConsultant.name}</h2>
                                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Performance Individual</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
                                        <div className="flex justify-between items-end mb-4">
                                            <div>
                                                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1">Score Elite</p>
                                                <p className="text-4xl font-black text-white tabular-nums">{selectedConsultant.eliteScore}%</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1">Canal Top</p>
                                                <p className="text-sm font-black text-red-500 uppercase">{selectedConsultant.topSource}</p>
                                            </div>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${selectedConsultant.eliteScore}%` }}
                                                className="h-full bg-gradient-to-r from-red-600 to-rose-400"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Vendas</p>
                                            <p className="text-2xl font-black text-white">{selectedConsultant.salesCount}</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Conv.</p>
                                            <p className="text-2xl font-black text-emerald-400">{selectedConsultant.conversion.toFixed(1)}%</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 w-full space-y-8">
                                <div className="flex items-center gap-3">
                                    <BarChart3 className="text-red-500" size={20} />
                                    <h3 className="font-black text-white uppercase tracking-widest text-sm">Saúde do Funil (Espelho Admin)</h3>
                                </div>

                                {loadingAnalysis ? (
                                    <div className="h-64 flex items-center justify-center">
                                        <div className="h-8 w-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {funnelData ? (
                                            Object.entries(funnelData).map(([status, count]: [any, any], i) => {
                                                const maxVal = Math.max(...Object.values(funnelData) as number[]);
                                                const percentage = Math.round((count / maxVal) * 100);
                                                const statusMap: Record<string, string> = {
                                                    'new': 'Novos',
                                                    'received': 'Recebidos',
                                                    'contacted': 'Contatados',
                                                    'scheduled': 'Agendados',
                                                    'visited': 'Visitas',
                                                    'proposal': 'Propostas',
                                                    'closed': 'Vendidos',
                                                    'sold': 'Vendidos'
                                                };
                                                if (count === 0 && !['new', 'closed', 'sold'].includes(status)) return null;

                                                return (
                                                    <div key={status} className="space-y-2">
                                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                                            <span className="text-white/40">{statusMap[status] || status}</span>
                                                            <span className="text-white">{count}</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <motion.div 
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${percentage}%` }}
                                                                className={`h-full ${status === 'closed' || status === 'sold' ? 'bg-emerald-500' : status === 'new' ? 'bg-blue-500' : 'bg-red-600/50'}`}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-white/20 text-xs italic">Sem dados de funil para este consultor no período.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
