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
import { StatsCard } from '@/components/StatsCard';
export default function ROIPage() {
    const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [performance, setPerformance] = useState<any[]>([]);

    useEffect(() => {
        async function loadMetrics() {
            try {
                const [metricsData, perfData] = await Promise.all([
                    dataService.getFinancialMetrics(),
                    dataService.getConsultantPerformance()
                ]);
                setMetrics(metricsData);
                setPerformance(perfData);
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
                <StatsCard
                    title="Investimento Global"
                    value={`R$ ${(metrics?.totalSpend || 0).toLocaleString()}`}
                    icon={Layers}
                    color="red"
                />
                <StatsCard
                    title="Custo de Aquisição (CAC)"
                    value={`R$ ${(metrics?.cac || 0).toFixed(0)}`}
                    icon={Target}
                    color="emerald"
                />
                <StatsCard
                    title="Lucro Bruto (Margem)"
                    value={`R$ ${(metrics?.totalProfit || 0).toLocaleString()}`}
                    icon={TrendingUp}
                    color="red"
                />
                <StatsCard
                    title="ROI Consolidado"
                    value={`${(metrics?.roi || 0).toFixed(1)}x`}
                    icon={Zap}
                    color="amber"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 glass-card rounded-[3rem] p-10 space-y-10">
                    <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                        <BarIcon size={20} className="text-red-500" />
                        Performance por Consultor (Leads Reais)
                    </h2>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] uppercase font-black tracking-widest text-white/20">
                                    <th className="pb-4">Consultor</th>
                                    <th className="pb-4">Total Leads</th>
                                    <th className="pb-4">Vendas</th>
                                    <th className="pb-4">Taxa de Conversão</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {performance.map((p, i) => {
                                    const leads = p.leads_total_count || 0;
                                    const sales = p.sales_manos_crm?.[0]?.count || 0;
                                    const rate = leads > 0 ? (sales / leads) * 100 : 0;

                                    return (
                                        <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white font-bold border border-white/5 group-hover:bg-red-500/10 group-hover:text-red-500 transition-colors">
                                                        {p.name?.[0]}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{p.name || 'Sem Nome'}</p>
                                                        <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">{p.role}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-6">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-white">{leads}</span>
                                                    <span className="text-[9px] text-white/20 font-bold uppercase">Leads Unificados</span>
                                                </div>
                                            </td>
                                            <td className="py-6">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-emerald-500">{sales}</span>
                                                    <span className="text-[9px] text-white/20 font-bold uppercase">Vendas Mês</span>
                                                </div>
                                            </td>
                                            <td className="py-6">
                                                <div className="space-y-2 max-w-[120px]">
                                                    <div className="flex justify-between text-[10px] font-bold">
                                                        <span className="text-white/40">{rate.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(rate, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
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
