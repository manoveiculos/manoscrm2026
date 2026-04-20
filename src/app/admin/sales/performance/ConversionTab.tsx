'use client';

import React, { useEffect, useState } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { 
    TrendingUp, Clock, AlertTriangle, Users, ArrowUpRight, 
    ArrowDownRight, Zap, Target, MousePointer2 
} from 'lucide-react';
import { motion } from 'framer-motion';

interface MetricCardProps {
    title: string;
    value: string | number;
    subValue?: string;
    icon: React.ElementType;
    color: string;
    trend?: { value: string; positive: boolean };
}

const MetricCard = ({ title, value, subValue, icon: Icon, color, trend }: MetricCardProps) => (
    <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.03] border border-white/10 p-5 rounded-2xl backdrop-blur-sm hover:bg-white/[0.05] transition-all group"
    >
        <div className="flex justify-between items-start mb-4">
            <div className={`p-2.5 rounded-xl bg-${color}-500/10 border border-${color}-500/20 group-hover:scale-110 transition-transform`}>
                <Icon size={20} className={`text-${color}-500`} />
            </div>
            {trend && (
                <div className={`flex items-center gap-1 text-[11px] font-bold ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trend.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {trend.value}
                </div>
            )}
        </div>
        <div className="space-y-1">
            <p className="text-white/40 text-[11px] font-black uppercase tracking-widest">{title}</p>
            <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-black text-white tracking-tight">{value}</h3>
                {subValue && <span className="text-[12px] text-white/30 font-bold">{subValue}</span>}
            </div>
        </div>
    </motion.div>
);

export const ConversionTab = () => {
    const [loading, setLoading] = useState(true);
    const [funnelData, setFunnelData] = useState<any>(null);
    const [speedData, setSpeedData] = useState<any>(null);
    const [riskyLeads, setRiskyLeads] = useState<any>(null);
    const [rankingData, setRankingData] = useState<any>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [fRes, sRes, rRes, rankRes] = await Promise.all([
                    fetch('/api/admin/metrics/funnel?days=30').then(r => r.json()),
                    fetch('/api/admin/metrics/speed-to-lead?days=30').then(r => r.json()),
                    fetch('/api/admin/metrics/hot-leads-at-risk').then(r => r.json()),
                    fetch('/api/admin/metrics/ranking?days=30').then(r => r.json())
                ]);
                setFunnelData(fRes);
                setSpeedData(sRes);
                setRiskyLeads(rRes);
                setRankingData(rankRes);
            } catch (err) {
                console.error('Error fetching conversion metrics:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center h-96">
            <div className="relative h-12 w-12">
                <div className="absolute inset-0 border-2 border-red-500/20 rounded-full" />
                <div className="absolute inset-0 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* 1. Hero Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                    title="Conversão Global"
                    value={`${funnelData?.rates?.conversion_rate?.toFixed(1)}%`}
                    subValue="Funil Completo"
                    icon={Target}
                    color="red"
                    trend={{ value: '2.4%', positive: true }}
                />
                <MetricCard 
                    title="Tempo Médio Resp."
                    value={speedData?.average_minutes || 0}
                    subValue="Minutos"
                    icon={Clock}
                    color="blue"
                    trend={{ value: '12m', positive: true }}
                />
                <MetricCard 
                    title="Leads em Risco"
                    value={riskyLeads?.count || 0}
                    subValue="Leads HOT"
                    icon={AlertTriangle}
                    color={riskyLeads?.count > 0 ? 'orange' : 'emerald'}
                />
                <MetricCard 
                    title="Taxa de Contato"
                    value={`${funnelData?.rates?.contact_rate?.toFixed(1)}%`}
                    subValue="Atendimento"
                    icon={MousePointer2}
                    color="emerald"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 2. Funil de Vendas */}
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp size={16} className="text-red-500" />
                            Fluxo de Conversão (30d)
                        </h4>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={funnelData?.chartData} layout="vertical" margin={{ left: 40, right: 40 }}>
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false}
                                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 'bold' }}
                                />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                    contentStyle={{ 
                                        backgroundColor: '#1a1a1f', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        fontSize: '12px'
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32}>
                                    {funnelData?.chartData?.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.8} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                            <p className="text-[9px] text-white/30 font-black uppercase mb-1">Perda</p>
                            <p className="text-sm font-bold text-red-400">{funnelData?.rates?.loss_rate?.toFixed(1)}%</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                            <p className="text-[9px] text-white/30 font-black uppercase mb-1">Venda/Lead</p>
                            <p className="text-sm font-bold text-emerald-400">{funnelData?.rates?.conversion_rate?.toFixed(1)}%</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                            <p className="text-[9px] text-white/30 font-black uppercase mb-1">Volume</p>
                            <p className="text-sm font-bold text-white/60">{funnelData?.summary?.total_leads}</p>
                        </div>
                    </div>
                </div>

                {/* 3. Tendência de Velocidade */}
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Zap size={16} className="text-blue-500" />
                            Speed-to-Lead (Trend)
                        </h4>
                        <span className="text-[10px] text-white/40 font-bold bg-white/5 px-2 py-1 rounded-md">Minutos</span>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={speedData?.trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis 
                                    dataKey="day" 
                                    axisLine={false} 
                                    tickLine={false}
                                    tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10 }}
                                    tickFormatter={(str) => str.split('-').slice(1).join('/')}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false}
                                    tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10 }}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#1a1a1f', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        fontSize: '12px'
                                    }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="avg" 
                                    stroke="#3b82f6" 
                                    strokeWidth={3} 
                                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* 4. Ranking de Consultores */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/5">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Users size={16} className="text-emerald-500" />
                        🏆 Ranking de Performance (Venda / Compra)
                    </h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/5">
                                <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Consultor</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-center">Leads</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-center">Contato</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-center">Vendas</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-center">Conversão</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-center">Velocidade</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {rankingData?.ranking?.map((c: any, i: number) => (
                                <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/40">
                                                {i + 1}
                                            </div>
                                            <span className="text-sm font-bold text-white">{c.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-white/60 font-medium">{c.total_leads}</td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 text-xs font-bold border border-blue-500/20">
                                            {Math.round((c.contacted / c.total_leads) * 100)}%
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-emerald-400 font-black">{c.won}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`text-sm font-black ${c.conversion_rate > 10 ? 'text-emerald-400' : 'text-white/40'}`}>
                                            {c.conversion_rate}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`text-sm font-bold ${Number(c.avg_speed) < 30 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {c.avg_speed ? `${c.avg_speed}m` : '—'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
