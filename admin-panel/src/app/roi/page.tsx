'use client';

import React, { useEffect, useState } from 'react';
import {
    TrendingUp,
    ArrowUpRight,
    DollarSign,
    BarChart as BarIcon,
    Download,
    Target,
    Zap,
    Layers,
    Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { FinancialMetrics } from '@/lib/types';

export default function ROIPage() {
    const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadMetrics() {
            try {
                const data = await dataService.getFinancialMetrics();
                setMetrics(data);
            } catch (err) {
                console.error("Error loading ROI metrics:", err);
            } finally {
                setLoading(false);
            }
        }
        loadMetrics();
    }, []);

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 w-fit text-[10px] font-bold uppercase tracking-wider border border-emerald-500/10">
                        <DollarSign size={12} />
                        Gestão Atômica de Capital
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white font-outfit">
                        ROI <span className="gradient-text">& Financeiro</span>
                    </h1>
                    <p className="text-white/40 font-medium">Análise granular de investimento e lucratividade por venda.</p>
                </div>

                <button className="h-14 px-8 rounded-2xl glass-card flex items-center gap-3 text-sm font-black text-white hover:bg-white/5 transition-all">
                    <Download size={18} className="text-red-500" /> Baixar DRE Gerencial
                </button>
            </header>

            {/* Financial Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Investimento Global', value: `R$ ${(metrics?.totalSpend || 0).toLocaleString()}`, trend: 12, icon: Layers, color: 'red' },
                    { label: 'Custo de Aquisição (CAC)', value: `R$ ${(metrics?.cac || 0).toFixed(0)}`, trend: -8, icon: Target, color: 'emerald' },
                    { label: 'Lucro Bruto (Margem)', value: `R$ ${(metrics?.totalProfit || 0).toLocaleString()}`, trend: 15, icon: TrendingUp, color: 'red-accent' },
                    { label: 'ROI Consolodidado', value: `${(metrics?.roi || 0).toFixed(1)}x`, trend: 5, icon: Zap, color: 'amber' },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass-card group p-8 space-y-4 relative overflow-hidden"
                    >
                        <div className="flex justify-between items-center">
                            <div className="h-12 w-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 text-white">
                                <stat.icon size={22} />
                            </div>
                            <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${stat.trend > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {stat.trend > 0 ? '+' : ''}{stat.trend}%
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-white/30 uppercase tracking-widest">{stat.label}</p>
                            <h3 className="text-4xl font-black text-white mt-1 font-outfit tracking-tighter">{stat.value}</h3>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 glass-card rounded-[3rem] p-10 space-y-10">
                    <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                        <BarIcon size={20} className="text-red-500" />
                        Resumo de Performance Financeira
                    </h2>
                    <div className="p-20 text-center text-white/20 font-bold border-2 border-dashed border-white/5 rounded-[2rem]">
                        Gráficos e Detalhes por Campanha serão carregados conforme novos dados entrem.
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    <div className="glass-card rounded-[2.5rem] p-10 bg-gradient-to-br from-red-600/10 to-red-900/10 border-red-500/20">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="h-10 w-10 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
                                <Sparkles size={20} className="text-white" />
                            </div>
                            <h3 className="font-bold text-lg text-white font-outfit">Sugestão de IA</h3>
                        </div>

                        <div className="space-y-6 text-white/70 text-sm leading-relaxed">
                            <p>
                                &quot;Com base no ROI atual de <b>{(metrics?.roi || 0).toFixed(1)}x</b>, recomendamos manter a estratégia atual e focar na conversão dos Leads Hot identificados.&quot;
                            </p>
                            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
                                <p className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
                                    <ArrowUpRight size={14} /> Recomendação
                                </p>
                                <p className="text-sm font-medium text-white">
                                    Aumentar follow-up em leads com score &gt; 85% para acelerar o fechamento.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
