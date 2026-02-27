'use client';

import React, { useEffect, useState } from 'react';
import {
    Users,
    Target,
    TrendingUp,
    DollarSign,
    Car,
    Clock,
    CheckCircle2,
    Calendar,
    MessageSquare,
    Zap,
    ArrowUpRight,
    Star,
    Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { dataService } from '@/lib/dataService';
import { Lead, AIClassification } from '@/lib/types';
import { StatsCard } from './StatsCard';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

interface ConsultantMetrics {
    leadCount: number;
    salesCount: number;
    totalRevenue: number;
    conversionRate: number;
    statusCounts: Record<string, number>;
    scheduledLeads: Lead[];
}

export function ConsultantDashboard({ consultantId, consultantName }: { consultantId: string; consultantName: string }) {
    const [metrics, setMetrics] = useState<ConsultantMetrics | null>(null);
    const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const [m, leads] = await Promise.all([
                    dataService.getConsultantMetrics(consultantId),
                    dataService.getLeads(consultantId)
                ]);
                setMetrics(m as ConsultantMetrics);
                setRecentLeads((leads as Lead[])?.slice(0, 5) || []);
            } catch (error) {
                console.error("Error loading consultant dashboard data:", error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [consultantId]);

    const getAIClassLabel = (classification: AIClassification) => {
        const labels: { [key: string]: string } = {
            'hot': 'Qualificado',
            'warm': 'Potencial',
            'cold': 'Frio'
        };
        return labels[classification] || classification;
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const uncontactedCount = metrics?.statusCounts['new'] || metrics?.statusCounts['received'] || 0;
    const inProgressCount = (metrics?.statusCounts['attempt'] || 0) + (metrics?.statusCounts['contacted'] || 0);
    const allScheduledLeads = metrics?.scheduledLeads || [];
    const scheduledToday = allScheduledLeads.filter(l => {
        const d = new Date(l.scheduled_at!);
        const today = new Date();
        return d.toDateString() === today.toDateString();
    });

    const upcomingScheduled = allScheduledLeads.filter(l => {
        const d = new Date(l.scheduled_at!);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return d > today;
    });

    const scheduledThisWeek = metrics?.scheduledLeads.filter(l => {
        const d = new Date(l.scheduled_at!);
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        return d >= startOfWeek && d <= endOfWeek;
    }) || [];

    const scheduledThisMonth = metrics?.scheduledLeads.filter(l => {
        const d = new Date(l.scheduled_at!);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }) || [];

    return (
        <div className="space-y-10 pb-20">
            {/* Welcome Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 w-fit text-[10px] font-bold uppercase tracking-wider shadow-md shadow-emerald-500/5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online & Disponível
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white font-outfit">
                        Olá, <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-white to-red-600">{consultantName.split(' ')[0]}!</span>
                    </h1>
                    <p className="text-white/40 font-medium italic">Seu desempenho comercial e pipeline de hoje.</p>
                </div>

                <div className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/10 shadow-lg shadow-black/20">
                    <div className="flex items-center gap-3 px-4 py-1.5 border-r border-white/10 group cursor-help">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                            <Sparkles size={12} className="animate-pulse" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Segurança & IA</span>
                            <span className="text-[10px] font-black text-white uppercase tracking-tight">MONITORADO POR IA</span>
                        </div>
                    </div>
                    <div className="flex flex-col px-4 text-left">
                        <span className="text-[8px] font-black text-red-500 uppercase tracking-[0.2em]">Otimização Ativa</span>
                        <span className="text-[10px] font-medium text-white/60 lowercase italic">Seu sistema está sendo monitorado por inteligência artificial</span>
                    </div>
                </div>
            </header>

            {/* Main Stats */}
            <motion.section
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                <StatsCard
                    title="Meus Leads"
                    value={metrics?.leadCount || 0}
                    icon={Users}
                    color="blue"
                    href="/leads?view=list"
                />
                <StatsCard
                    title="Vendas (Mês)"
                    value={metrics?.salesCount || 0}
                    icon={Target}
                    color="red"
                    href="/leads?view=kanban"
                />
                <StatsCard
                    title="Agendamentos do Dia"
                    value={scheduledToday.length}
                    trend={upcomingScheduled.length > 0 ? undefined : 0}
                    trendLabel={upcomingScheduled.length > 0 ? `${upcomingScheduled.length} próximos` : undefined}
                    icon={Calendar}
                    color="amber"
                    href="/leads?view=kanban"
                />
                <StatsCard
                    title="Minha Conversão"
                    value={`${metrics?.conversionRate.toFixed(1) || '0.0'}%`}
                    icon={TrendingUp}
                    color="emerald"
                />
            </motion.section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Immediate Tasks & Hot Leads */}
                <motion.div
                    variants={item}
                    initial="hidden"
                    animate="show"
                    className="lg:col-span-8 space-y-8"
                >
                    {/* Schedule Section */}
                    {allScheduledLeads.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h2 className="text-xl font-bold flex items-center gap-3">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                                        <Calendar size={18} />
                                    </span>
                                    Sua Agenda
                                </h2>
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                    {scheduledToday.length > 0 ? `${scheduledToday.length} hoje` : `${upcomingScheduled.length} próximos`}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(scheduledToday.length > 0 ? scheduledToday : upcomingScheduled.slice(0, 4)).map(lead => (
                                    <Link
                                        key={lead.id}
                                        href={`/leads?id=${lead.id}`}
                                        className="glass-card p-4 border-amber-500/20 bg-amber-500/[0.02] flex items-center justify-between group hover:bg-amber-500/5 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold flex-col leading-tight">
                                                <span className="text-[10px]">
                                                    {scheduledToday.includes(lead)
                                                        ? new Date(lead.scheduled_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                        : new Date(lead.scheduled_at!).toLocaleDateString([], { day: '2-digit', month: '2-digit' })
                                                    }
                                                </span>
                                                {!scheduledToday.includes(lead) && (
                                                    <span className="text-[8px] opacity-60">
                                                        {new Date(lead.scheduled_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-white leading-none">{lead.name}</h4>
                                                <p className="text-[10px] text-white/40 mt-1">{lead.vehicle_interest || 'Visita Loja'}</p>
                                            </div>
                                        </div>
                                        <ArrowUpRight size={14} className="text-white/20 group-hover:text-amber-500 transition-colors" />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Link
                            href="/leads?view=list"
                            className="glass-card p-6 flex items-center justify-between border-blue-500/20 bg-blue-500/5 group hover:bg-blue-500/10 transition-all cursor-pointer"
                        >
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                    <Clock size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white leading-none">{uncontactedCount} Novos Leads</h4>
                                    <p className="text-[10px] text-white/40 mt-1 uppercase font-black tracking-widest">Aguardando Primeiro Contato</p>
                                </div>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                                <ArrowUpRight size={18} />
                            </div>
                        </Link>

                        <Link
                            href="/leads?view=kanban"
                            className="glass-card p-6 flex items-center justify-between border-amber-500/20 bg-amber-500/5 group hover:bg-amber-500/10 transition-all cursor-pointer"
                        >
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                                    <MessageSquare size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white leading-none">{inProgressCount} Atendimentos</h4>
                                    <p className="text-[10px] text-white/40 mt-1 uppercase font-black tracking-widest">Em negociação ativa</p>
                                </div>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                                <ArrowUpRight size={18} />
                            </div>
                        </Link>
                    </div>

                    {/* Highly Qualified Leads List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                                    <Star size={18} />
                                </span>
                                Leads Prioritários (Hot)
                            </h2>
                            <Link href="/leads" className="text-xs font-black text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors">Ver Pipeline Completo</Link>
                        </div>

                        <div className="space-y-3">
                            {recentLeads.filter(l => l.ai_classification === 'hot').length > 0 ? (
                                recentLeads.filter(l => l.ai_classification === 'hot').map((lead) => (
                                    <Link
                                        key={lead.id}
                                        href={`/leads?id=${lead.id}`}
                                        className="glass-card p-5 flex items-center justify-between group hover:border-red-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className="h-14 w-14 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-500 font-bold group-hover:bg-red-600 group-hover:text-white transition-all">
                                                {lead.name[0]}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white group-hover:text-red-400 transition-colors">{lead.name}</h4>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{lead.phone}</span>
                                                    <div className="h-1 w-1 rounded-full bg-white/10" />
                                                    <span className="flex items-center gap-1 text-[9px] font-bold text-red-500/60 uppercase">
                                                        <Car size={10} /> {lead.vehicle_interest || 'Sem Carro Definido'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right flex flex-col items-end">
                                                <div className="flex items-center gap-1.5 text-rose-500">
                                                    <span className="text-xl font-black">{lead.ai_score}</span>
                                                    <span className="text-[10px] font-bold mt-1">%</span>
                                                </div>
                                                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none">Score IA</p>
                                            </div>
                                            <div className="h-10 w-px bg-white/5" />
                                            <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black text-white/30 group-hover:bg-red-600 group-hover:text-white group-hover:border-red-500 transition-all uppercase tracking-widest">
                                                Atender
                                            </button>
                                        </div>
                                    </Link>
                                ))
                            ) : (
                                <div className="glass-card p-12 text-center border-dashed border-white/10">
                                    <p className="text-white/20 font-medium font-outfit uppercase tracking-tighter">Nenhum lead quente no momento. Continue no pipeline!</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* Performance & AI Tips Sidebar */}
                <motion.div
                    variants={item}
                    initial="hidden"
                    animate="show"
                    className="lg:col-span-4 space-y-8"
                >
                    {/* Performance Breakdown */}
                    <div className="glass-card p-8 space-y-8 bg-gradient-to-b from-white/[0.03] to-transparent">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                                <Zap size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white">Seu Pipeline</h3>
                                <p className="text-[10px] text-white/30 uppercase font-black tracking-widest leading-none mt-0.5">Distribuição Ativa</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {[
                                { label: 'Novos', value: uncontactedCount, total: metrics?.leadCount || 1, color: 'bg-blue-500' },
                                { label: 'Em Negócio', value: inProgressCount, total: metrics?.leadCount || 1, color: 'bg-amber-500' },
                                { label: 'Visitas', value: metrics?.statusCounts['visited'] || 0, total: metrics?.leadCount || 1, color: 'bg-red-500' },
                                { label: 'Vendas', value: metrics?.salesCount || 0, total: metrics?.leadCount || 1, color: 'bg-emerald-500' },
                            ].map((stat, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-bold">
                                        <span className="text-white/50 uppercase tracking-widest">{stat.label}</span>
                                        <span className="text-white flex items-center gap-2">
                                            {stat.value}
                                            <span className="text-white/20 text-[9px]">({Math.round((stat.value / (stat.total || 1)) * 100)}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(stat.value / (stat.total || 1)) * 100}%` }}
                                            className={`h-full ${stat.color} shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* AI Coach Card */}
                    <div className="glass-card p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Sparkles size={60} className="text-red-500" />
                        </div>

                        <div className="flex items-center gap-2 mb-6 text-red-500">
                            <Zap size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Dica da Manos IA</span>
                        </div>

                        <p className="text-sm text-white/80 leading-relaxed font-outfit font-medium">
                            &quot;Você tem <b>{uncontactedCount} leads</b> sem contato. O tempo médio de resposta ideal é abaixo de 5 minutos para aumentar sua taxa de conversão em até 20%.&quot;
                        </p>

                        <button className="mt-8 w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-white hover:bg-white/10 transition-all uppercase tracking-[0.2em]">
                            Ver Estratégias
                        </button>
                    </div>

                    {/* Quick Inventory Check */}
                    <Link href="/inventory" className="flex items-center justify-between p-6 glass-card border-dashed border-white/20 hover:border-white/40 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                                <Car size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-sm">Consultar Estoque</h4>
                                <p className="text-[10px] text-white/30 uppercase font-black tracking-widest">Verificar disponibilidade</p>
                            </div>
                        </div>
                        <ArrowUpRight size={18} className="text-white/20 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
