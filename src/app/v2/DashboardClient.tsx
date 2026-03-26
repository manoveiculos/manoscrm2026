'use client';

import React, { useState, useEffect } from 'react';
import { 
    LayoutDashboard, 
    Target, 
    TrendingUp, 
    Zap, 
    ShieldCheck, 
    ArrowUpRight,
    Users,
    Rocket,
    Clock,
    Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FinancialMetrics } from '@/lib/types';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0 }
};

interface DashboardClientProps {
    metrics: FinancialMetrics;
    userName: string;
    aiInsights: Array<{
        title: string;
        desc: string;
        time: string;
        color: string;
    }>;
    salesToTop: number;
}

export default function DashboardClient({ metrics, userName, aiInsights, salesToTop }: DashboardClientProps) {

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'Bom dia';
        if (hour >= 12 && hour < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    const motivationalPhrases = [
        "A sorte acompanha os audazes. Hoje é dia de fechar!",
        "Foco total no cliente, o resto é consequência.",
        "Cada 'não' te deixa mais perto do 'sim'. Continue acelerando!",
        "Venda é relacionamento. Conecte-se e vença hoje.",
        "O sucesso é a soma de pequenos esforços repetidos dia após dia."
    ];

    // Índice baseado no dia — estável no SSR e no cliente, muda 1x/dia
    const dayIndex = new Date().getDate() % motivationalPhrases.length;
    const [randomPhrase, setRandomPhrase] = useState(motivationalPhrases[dayIndex]);
    useEffect(() => {
        setRandomPhrase(motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cards = [
        { title: 'Leads Ativos', value: metrics.leadCount, icon: Users, color: 'blue' },
        { title: 'Vendas (Hoje)', value: metrics.salesCount, icon: Target, color: 'red' },
        { title: 'Receita Hoje', value: `R$ ${metrics.totalRevenue.toLocaleString('pt-BR')}`, icon: TrendingUp, color: 'emerald' },
        { title: 'Conversão', value: `${((metrics.salesCount) / (metrics.leadCount || 1) * 100).toFixed(1)}%`, icon: Zap, color: 'amber' },
    ];

    return (
        <div className="w-full space-y-12 pb-32 pt-0 px-2 md:px-0 flex flex-col items-start justify-start">
            {/* Mission Control Header */}
            <header className="relative py-10 px-4 md:px-12 rounded-[3.5rem] premium-glass border-red-500/10 overflow-hidden group w-full">
                <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/5 blur-[100px] -mr-48 -mt-48 transition-all group-hover:bg-red-600/10" />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-[0.3em] w-fit shadow-lg shadow-red-500/5">
                            <Rocket size={12} className="animate-bounce" />
                            Status: Operacional
                        </div>
                        <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-white font-outfit leading-tight">
                            Central de <span className="text-white/20">Comando.</span><br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-white to-red-600">{getGreeting()}, {userName}</span>
                        </h1>
                        <div className="space-y-2">
                            <p className="text-xl text-white/40 font-medium italic">
                                "{randomPhrase}"
                            </p>
                            <div className="flex items-center gap-2 text-emerald-500 font-black uppercase text-[11px] tracking-widest bg-emerald-500/5 px-3 py-1 rounded-lg border border-emerald-500/10 w-fit">
                                <TrendingUp size={12} />
                                {salesToTop > 0 
                                    ? `Faltam ${salesToTop} vendas para o topo do ranking` 
                                    : "Você lidera o ranking de elite!"}
                            </div>

                        </div>
                    </div>

                    <div className="flex gap-4">
                        <Link href="/v2/pipeline" className="px-8 py-5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black uppercase text-sm shadow-[0_20px_40px_rgba(227,30,36,0.3)] transition-all transform hover:-translate-y-1 flex items-center gap-3 active:scale-95 group/btn">
                            Abrir Pipeline de Vendas <ArrowUpRight size={20} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                        </Link>
                    </div>
                </div>
            </header>

            {/* Metrics Grid */}
            <motion.div 
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 w-full"
            >
                {cards.map((card, idx) => (
                    <motion.div 
                        key={idx}
                        variants={item}
                        whileHover={{ y: -8 }}
                        className="p-8 rounded-[2.5rem] premium-glass border-white/5 group relative overflow-hidden"
                    >
                        <div className={`absolute top-0 right-0 w-24 h-24 bg-${card.color}-500/5 blur-[40px] -mr-12 -mt-12 group-hover:bg-${card.color}-500/10 transition-all`} />
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <div className={`h-14 w-14 rounded-2xl bg-${card.color}-500/10 text-${card.color}-500 flex items-center justify-center`}>
                                <card.icon size={28} />
                            </div>
                            <span className="text-4xl font-black text-white tabular-nums">{card.value}</span>
                        </div>
                        <h3 className="text-sm font-black text-white/30 uppercase tracking-[0.2em] relative z-10">{card.title}</h3>
                    </motion.div>
                ))}
            </motion.div>

            {/* AI Insights Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full items-stretch">
                <motion.div 
                    variants={item}
                    initial="hidden"
                    animate="show"
                    className="lg:col-span-8 p-10 rounded-[3.5rem] premium-glass border-white/5 relative overflow-hidden"
                >
                    <div className="flex justify-between items-center mb-10">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-black text-white flex items-center gap-3">
                                <Sparkles size={24} className="text-red-500" />
                                Sugestões da IA
                            </h2>
                            <p className="text-white/40 font-medium">Análise de comportamento em tempo real</p>
                        </div>
                        <Link href="/v2/pulse" className="text-[10px] font-black uppercase text-red-500 tracking-widest hover:text-red-400">Ver Painel Completo</Link>
                    </div>

                    <div className="space-y-6">
                        {aiInsights.map((insight, i) => (
                            <div key={i} className="flex items-start gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                                <div className={`h-12 w-12 rounded-2xl bg-${insight.color}-500/10 text-${insight.color}-500 flex items-center justify-center shrink-0`}>
                                    <ShieldCheck size={24} />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <h4 className="font-black text-white group-hover:text-red-500 transition-colors uppercase text-sm tracking-tight">{insight.title}</h4>
                                        <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-md bg-${insight.color}-500/10 text-${insight.color}-500`}>{insight.time}</span>
                                    </div>
                                    <p className="text-sm text-white/40 leading-relaxed font-medium">{insight.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.div 
                    variants={item}
                    initial="hidden"
                    animate="show"
                    className="lg:col-span-4 p-10 rounded-[3.5rem] bg-gradient-to-b from-red-600 to-red-900 border border-red-500/50 relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-10 opacity-10">
                        <Clock size={150} className="text-white" />
                    </div>
                    
                    <div className="relative z-10 space-y-8 h-full flex flex-col justify-between">
                        <div className="space-y-4">
                            <h3 className="text-4xl font-black text-white leading-tight">
                                Agendados <br />
                                para <span className="opacity-40">Hoje.</span>
                            </h3>
                            <p className="text-white/60 font-medium leading-relaxed">
                                Você tem agendamentos para hoje. Prepare as propostas personalizadas para aumentar sua chance de fechamento.
                            </p>
                        </div>

                        <Link href="/v2/pipeline?filter=scheduled" className="w-full py-5 rounded-2xl bg-white text-[#E31E24] font-black uppercase text-xs tracking-widest text-center shadow-2xl transition-all hover:scale-[1.02] active:scale-95">
                            Ver Agenda
                        </Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
