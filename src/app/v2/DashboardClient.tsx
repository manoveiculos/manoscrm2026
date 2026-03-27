'use client';

import React, { useState, useEffect } from 'react';
import {
    KanbanSquare,
    Activity,
    Users,
    Bot,
    Brain,
    AlertTriangle,
    FileText,
    CalendarCheck,
    TrendingUp,
    Target,
    Zap,
    ShieldCheck,
    ArrowUpRight,
    Sparkles,
    CheckCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FinancialMetrics } from '@/lib/types';
import { useAIAlerts } from '@/hooks/useAIAlerts';

interface DashboardClientProps {
    metrics: FinancialMetrics;
    userName: string;
    aiInsights: Array<{ title: string; desc: string; time: string; color: string }>;
    salesToTop: number;
}

const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
};

const PHRASES = [
    'A sorte acompanha os audazes. Hoje é dia de fechar!',
    'Foco total no cliente, o resto é consequência.',
    'Cada "não" te deixa mais perto do "sim". Continue!',
    'Venda é relacionamento. Conecte-se e vença hoje.',
    'O sucesso é a soma de pequenos esforços diários.',
];

export default function DashboardClient({ metrics, userName, aiInsights, salesToTop }: DashboardClientProps) {
    const { count: aiCount } = useAIAlerts();
    const [phrase, setPhrase] = useState(PHRASES[new Date().getDate() % PHRASES.length]);

    useEffect(() => {
        setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Métricas em strip ─────────────────────────────────────────────────────
    const metricStrip = [
        { label: 'Leads Ativos', value: metrics.leadCount, icon: Users, color: 'blue' },
        { label: 'Vendas hoje', value: metrics.salesCount, icon: Target, color: 'red' },
        { label: 'Receita', value: `R$\u00a0${metrics.totalRevenue.toLocaleString('pt-BR')}`, icon: TrendingUp, color: 'emerald' },
        {
            label: 'Conversão',
            value: `${((metrics.salesCount / (metrics.leadCount || 1)) * 100).toFixed(1)}%`,
            icon: Zap,
            color: 'amber',
        },
    ];

    // ── 8 atalhos rápidos ─────────────────────────────────────────────────────
    const shortcuts = [
        {
            label: 'Pipeline de Vendas',
            desc: 'Kanban do funil',
            icon: KanbanSquare,
            href: '/v2/pipeline',
            badge: null,
            accent: 'red',
        },
        {
            label: 'Painel de Ações',
            desc: 'Cockpit IA',
            icon: Activity,
            href: '/v2/pulse',
            badge: aiCount > 0 ? aiCount : null,
            accent: 'amber',
        },
        {
            label: 'Central de Leads',
            desc: 'Todos os contatos',
            icon: Users,
            href: '/v2/leads',
            badge: null,
            accent: 'blue',
        },
        {
            label: 'Follow-ups IA',
            desc: 'Alertas pendentes',
            icon: Bot,
            href: '/v2/pulse',
            badge: aiCount > 0 ? aiCount : null,
            accent: 'amber',
        },
        {
            label: 'Leads IA Hoje',
            desc: 'Score ≥ 70 ou Hot',
            icon: Brain,
            href: '/v2/pipeline?filter=ai',
            badge: null,
            accent: 'purple',
        },
        {
            label: 'Risco de Churn',
            desc: 'Leads em risco',
            icon: AlertTriangle,
            href: '/v2/pulse',
            badge: null,
            accent: 'orange',
        },
        {
            label: 'Nova Proposta',
            desc: 'Gerar financiamento',
            icon: FileText,
            href: '/v2/leads',
            badge: null,
            accent: 'emerald',
        },
        {
            label: 'Agenda',
            desc: 'Agendamentos hoje',
            icon: CalendarCheck,
            href: '/v2/pipeline?filter=scheduled',
            badge: null,
            accent: 'sky',
        },
    ];

    const accentClasses: Record<string, string> = {
        red:    'bg-red-500/10 border-red-500/15 text-red-400',
        amber:  'bg-amber-500/10 border-amber-500/15 text-amber-400',
        blue:   'bg-blue-500/10 border-blue-500/15 text-blue-400',
        purple: 'bg-purple-500/10 border-purple-500/15 text-purple-400',
        orange: 'bg-orange-500/10 border-orange-500/15 text-orange-400',
        emerald:'bg-emerald-500/10 border-emerald-500/15 text-emerald-400',
        sky:    'bg-sky-500/10 border-sky-500/15 text-sky-400',
    };

    return (
        <div className="w-full space-y-8 pb-24 pt-0 px-2 md:px-8 flex flex-col items-start">

            {/* ── Header compacto ────────────────────────────────────────────── */}
            <header className="w-full flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Sistema Operacional
                        </span>
                        {aiCount > 0 && (
                            <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5"
                            >
                                <Bot size={10} />
                                {aiCount} alerta{aiCount > 1 ? 's' : ''} IA
                            </motion.span>
                        )}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                        {getGreeting()}, <span className="text-red-500">{userName}</span>
                    </h1>
                    <p className="text-sm text-white/35 italic">&ldquo;{phrase}&rdquo;</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {salesToTop > 0 ? (
                        <span className="text-[11px] text-white/40 font-semibold hidden md:block">
                            Faltam <span className="text-white font-black">{salesToTop}</span> vendas para o topo
                        </span>
                    ) : (
                        <span className="text-[11px] text-emerald-400 font-black hidden md:flex items-center gap-1">
                            <CheckCircle size={12} /> Você lidera o ranking!
                        </span>
                    )}
                    <Link
                        href="/v2/pipeline"
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-wide transition-all active:scale-95 shadow-lg shadow-red-600/20"
                    >
                        Pipeline <ArrowUpRight size={15} />
                    </Link>
                </div>
            </header>

            {/* ── Métricas em strip ─────────────────────────────────────────── */}
            <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3">
                {metricStrip.map((m) => (
                    <div
                        key={m.label}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors"
                    >
                        <m.icon size={15} className={`text-${m.color}-400 shrink-0`} />
                        <div className="min-w-0">
                            <p className="text-[10px] text-white/35 font-semibold uppercase tracking-widest truncate">{m.label}</p>
                            <p className="text-lg font-black text-white leading-tight tabular-nums">{m.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── 8 atalhos rápidos ─────────────────────────────────────────── */}
            <div className="w-full">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/25 mb-3">Atalhos rápidos</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {shortcuts.map((s) => {
                        const accent = accentClasses[s.accent] ?? accentClasses.blue;
                        return (
                            <motion.div key={s.label} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}>
                                <Link
                                    href={s.href}
                                    className="relative flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.05] transition-all group h-full"
                                >
                                    <div className={`h-9 w-9 rounded-xl border flex items-center justify-center ${accent}`}>
                                        <s.icon size={16} />
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-bold text-white group-hover:text-white/90 leading-tight">{s.label}</p>
                                        <p className="text-[11px] text-white/35 mt-0.5">{s.desc}</p>
                                    </div>
                                    {s.badge !== null && (
                                        <motion.span
                                            key={s.badge}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="absolute top-3 right-3 h-5 min-w-[20px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center"
                                        >
                                            {(s.badge as number) > 9 ? '9+' : s.badge}
                                        </motion.span>
                                    )}
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* ── Sugestões da IA (compactas) ───────────────────────────────── */}
            <div className="w-full">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/25 flex items-center gap-2">
                        <Sparkles size={11} className="text-red-500" />
                        Sugestões da IA
                    </p>
                    <Link href="/v2/pulse" className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 flex items-center gap-1">
                        Ver tudo <ArrowUpRight size={10} />
                    </Link>
                </div>
                <div className="space-y-2">
                    {aiInsights.map((insight, i) => (
                        <div
                            key={i}
                            className={`flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.09] transition-colors`}
                        >
                            <ShieldCheck size={14} className={`text-${insight.color}-400 shrink-0 mt-0.5`} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[12px] font-bold text-white truncate">{insight.title}</span>
                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-${insight.color}-500/10 text-${insight.color}-400 shrink-0`}>
                                        {insight.time}
                                    </span>
                                </div>
                                <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{insight.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
