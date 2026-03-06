'use client';

import React, { useState, useEffect } from 'react';
import {
    Target,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    RefreshCcw,
    Zap,
    BarChart3,
    Search,
    Flame,
    Thermometer,
    UserMinus,
    Skull,
    ArrowUpRight,
    ArrowRight,
    Users,
    Activity,
    Sparkles,
    MousePointer2,
    Calendar,
    MessageSquare,
    Phone,
    ShieldCheck,
    Rocket
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Report {
    id: string;
    report_date: string;
    total_leads: number;
    quentes: number;
    mornos: number;
    frios: number;
    desqualificados: number;
    perda_total: number;
    quality_average: number;
    overall_score: number;
    insights: string[];
    recommendations: string[];
}

interface LeadResult {
    id: any;
    nome: string;
    ai_score: number;
    ai_classification: string;
    ai_reason: string;
    probability_of_sale: number;
    recommended_approach: string;
    vendedor?: string;
    interesse?: string;
    created_at?: string;
    criado_em?: string;
    status?: string;
}

export function QualityIntelligence({ isAdmin, consultantName }: { isAdmin: boolean, consultantName?: string }) {
    const router = useRouter();
    const [report, setReport] = useState<Report | null>(null);
    const [analyzedLeads, setAnalyzedLeads] = useState<LeadResult[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'hot' | 'warm' | 'cold' | 'lost'>('all');

    const loadLatestReport = async () => {
        setLoading(true);
        try {
            const { data: latest } = await supabase
                .from('marketing_quality_reports')
                .select('*')
                .order('report_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latest) setReport(latest);

            let leadsQuery = supabase
                .from('leads_distribuicao_crm_26')
                .select('*')
                .not('ai_classification', 'is', null)
                .order('probability_of_sale', { ascending: false })
                .order('ai_score', { ascending: false });

            if (!isAdmin && consultantName) {
                const firstName = consultantName.split(' ')[0];
                leadsQuery = leadsQuery.or(`vendedor.ilike.%${firstName}%,vendedor.is.null`);
            }

            const { data: leads } = await leadsQuery.limit(100);
            if (leads) setAnalyzedLeads(leads as any);
        } catch (err) {
            console.error("Error loading quality report:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadLatestReport(); }, []);

    const handleRunAnalysis = async () => {
        if (!isAdmin) return;
        setIsAnalyzing(true);
        try {
            const res = await fetch('/api/marketing-quality-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period: 'last_30_days' })
            });

            const result = await res.json();
            if (result.success) {
                loadLatestReport();
            } else {
                throw new Error(result.error);
            }
        } catch (err: any) {
            alert("Erro ao processar análise: " + err.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-60 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
            </div>
        );
    }

    const filteredLeads = analyzedLeads.filter(l => {
        const matchesSearch = (
            (l.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (l.interesse || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (l.recommended_approach || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (!matchesSearch) return false;

        if (filterType === 'all') return true;
        const classification = (l.ai_classification || '').toUpperCase();
        if (filterType === 'hot') return classification.includes('QUENTE') || (l.probability_of_sale || 0) >= 50;
        if (filterType === 'warm') return classification.includes('MORNO');
        if (filterType === 'cold') return classification.includes('FRIO');
        if (filterType === 'lost') return classification.includes('DESQUALIFICADO') || classification.includes('PERDA');
        return true;
    });

    const highPriorityLeads = filteredLeads.filter(l => (l.probability_of_sale || 0) >= 50 || (l.ai_classification || '').toUpperCase().includes('QUENTE'));
    const mediumLeads = filteredLeads.filter(l => (l.probability_of_sale || 0) < 50 && (l.probability_of_sale || 0) >= 20 && !(l.ai_classification || '').toUpperCase().includes('DESQUALIFICADO'));
    const lowLeads = filteredLeads.filter(l => (l.ai_classification || '').toUpperCase().includes('DESQUALIFICADO') || (l.ai_classification || '').toUpperCase().includes('PERDA') || (l.probability_of_sale || 0) < 20);

    const dynamicSummary = report ?
        `Sua operação capturou ${report.total_leads} leads no período. Destes, ${report.quentes} são de alta temperatura. Fidelidade de público em ${report.quality_average.toFixed(0)}%.` :
        "Aguardando análise estratégica para consolidar métricas de qualidade real.";

    return (
        <div className="space-y-10 animate-in fade-in duration-500 pb-20">
            {/* Header com estilo "Dashboard Sênior" */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.5)]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-600/80">Monitoramento Preditivo IA</span>
                    </div>
                    <h1 className="text-4xl font-black tracking-tight text-white uppercase">Diagnóstico de Qualidade</h1>
                    <p className="text-white/40 mt-1 text-sm font-medium uppercase tracking-wider">Análise qualitativa e probabilística dos leads gerados.</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-600 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="BUSCAR NOME OU CARRO..."
                            className="bg-[#0c0c0e] border border-white/5 rounded-xl pl-12 pr-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white focus:outline-none focus:border-red-600/50 w-72 transition-all placeholder:text-white/10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {isAdmin && (
                        <button
                            onClick={handleRunAnalysis}
                            disabled={isAnalyzing}
                            className="px-8 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
                        >
                            {isAnalyzing ? <RefreshCcw size={16} className="animate-spin" /> : <Zap size={16} />}
                            {isAnalyzing ? 'Processando' : 'Atualizar Diagnóstico'}
                        </button>
                    )}
                </div>
            </header>

            {/* KPI Cards Estilo Glassmorphic */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { type: 'all', label: "Qualidade Média", value: `${report?.quality_average.toFixed(0) || 0}%`, unit: "PRECISÃO", icon: TrendingUp, color: 'blue' },
                    { type: 'hot', label: "Leads Quentes", value: report?.quentes.toString() || "0", unit: "ESTRELAS", icon: Flame, color: 'orange' },
                    { type: 'warm', label: "Campanha Score", value: `${report?.overall_score.toFixed(1) || 0}`, unit: "/ 10", icon: Target, color: 'red' },
                    { type: 'all', label: "Total Analisado", value: (report?.total_leads || 0).toString(), unit: "LEADS", icon: Activity, color: 'emerald' }
                ].map((kpi, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        onClick={() => kpi.type !== 'all' && setFilterType(kpi.type as any)}
                        className={`glass-card p-8 rounded-3xl border transition-all cursor-pointer group relative overflow-hidden
                            ${filterType === kpi.type ? 'border-red-600/40 bg-red-600/[0.02]' : 'hover:border-white/10'}`}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className={`p-3 rounded-2xl bg-white/5 text-${kpi.color}-500 group-hover:scale-110 transition-transform`}>
                                <kpi.icon size={24} />
                            </div>
                            {filterType === kpi.type && <div className="h-2 w-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)] animate-pulse" />}
                        </div>
                        <p className="text-[10px] font-black text-white/30 uppercase mb-1 tracking-widest leading-none">{kpi.label}</p>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-4xl font-black text-white tracking-tighter">{kpi.value}</h4>
                            <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">{kpi.unit}</span>
                        </div>
                        <div className="absolute top-0 right-0 w-1 h-full bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                ))}
            </div>

            {/* AI Analysis Quote Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-8 p-10 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 relative overflow-hidden group shadow-2xl"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-600/[0.03] to-transparent" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-8">
                            <Sparkles size={22} className="text-red-600" />
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Veredito da Inteligência</h2>
                        </div>
                        <div className="mb-10 text-center md:text-left">
                            <p className="text-2xl md:text-3xl text-white leading-tight italic font-bold tracking-tight opacity-90">&ldquo;{dynamicSummary}&rdquo;</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {report?.recommendations?.slice(0, 2).map((rec, i) => (
                                <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-red-600/30 transition-all flex gap-5 group/item">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-600/10 text-red-600 flex items-center justify-center font-black text-xs group-hover/item:bg-red-600 group-hover/item:text-white transition-all">{i + 1}</div>
                                    <div>
                                        <p className="text-[9px] font-black text-white/30 uppercase mb-1 tracking-[0.2em]">Prioridade IA</p>
                                        <p className="text-sm font-bold text-white leading-snug uppercase">{rec}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-4 p-10 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 flex flex-col justify-center text-center relative overflow-hidden group shadow-2xl"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-red-600/[0.05] to-transparent" />
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-white/30 uppercase mb-6 tracking-[0.3em]">Qualidade Preditiva</p>
                        <div className="flex items-baseline justify-center gap-2 mb-8">
                            <span className="text-7xl font-black text-white tracking-tighter">{(report?.quality_average || 0).toFixed(0)}</span>
                            <span className="text-2xl font-black text-red-600 tracking-widest">%</span>
                        </div>
                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${report?.quality_average || 0}%` }}
                                className="h-full bg-gradient-to-r from-red-600 to-red-500 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                            />
                        </div>
                        <p className="text-[10px] text-white/20 font-black uppercase mt-6 tracking-[0.2em]">Fidelidade de Conversão</p>
                    </div>
                    <Target size={140} className="absolute -bottom-10 -right-10 opacity-[0.03] group-hover:rotate-12 transition-transform" />
                </motion.div>
            </div>

            {/* SEÇÃO DE LEADS - FOCO EM CONVERSÃO */}
            <div className="space-y-16 pt-10">
                {/* 1. ALTA PRIORIDADE (QUENTES) */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-orange-600/10 text-orange-500">
                            <Flame size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Oportunidades de Ouro</h2>
                            <p className="text-[10px] font-black text-orange-500/60 uppercase tracking-widest mt-1">Máxima probabilidade de fechamento imediato</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {highPriorityLeads.map((lead, i) => (
                            <LeadCard key={lead.id} lead={lead} variant="hot" index={i} onClick={(id) => router.push(`/leads?id=crm26_${id}&tab=timeline`)} />
                        ))}
                        {highPriorityLeads.length === 0 && (
                            <div className="col-span-full py-24 text-center rounded-[3rem] border-2 border-dashed border-white/5 bg-[#0c0c0e]/50">
                                <Search size={48} className="mx-auto mb-6 text-white/10" />
                                <p className="text-sm font-black text-white/20 uppercase tracking-[0.3em]">Nenhum lead crítico detectado</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. LEADS MORNOS / FRIOS */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-blue-600/10 text-blue-500">
                            <Thermometer size={24} />
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Fila de Nutrição</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {mediumLeads.map((lead, i) => (
                            <LeadCard key={lead.id} lead={lead} variant="medium" index={i} onClick={(id) => router.push(`/leads?id=crm26_${id}&tab=timeline`)} />
                        ))}
                    </div>
                </div>

                {/* 3. DEMAIS LEADS / DESQUALIFICADOS */}
                <div className="space-y-8 opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-white/5 text-white/40">
                            <Skull size={24} />
                        </div>
                        <h2 className="text-xl font-black text-white/40 uppercase tracking-tight">Arquivo de Qualidade Baixa</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {lowLeads.map((lead, i) => (
                            <LeadCard key={lead.id} lead={lead} variant="low" index={i} onClick={(id) => router.push(`/leads?id=crm26_${id}&tab=timeline`)} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function LeadCard({ lead, variant, index, onClick }: { lead: LeadResult, variant: 'hot' | 'medium' | 'low', index: number, onClick: (id: any) => void }) {
    const isHot = variant === 'hot';
    const isLow = variant === 'low';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + (index * 0.05) }}
            whileHover={{ y: -5 }}
            onClick={() => onClick(lead.id)}
            className={`cursor-pointer rounded-[2.5rem] border p-8 flex flex-col justify-between transition-all duration-500 relative overflow-hidden group shadow-xl
                ${isHot ? 'bg-[#0c0c0e] border-orange-500/20 hover:border-orange-500/50' :
                    isLow ? 'bg-[#090b0e] border-white/5 hover:border-red-600/20' :
                        'bg-[#0c0c0e] border-white/5 hover:border-blue-500/30'}`}
        >
            <div className="absolute top-0 right-0 p-6 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                {isHot ? <Rocket size={100} /> : <Target size={100} />}
            </div>

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-8">
                    <div className="flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl uppercase shadow-lg
                            ${isHot ? 'bg-orange-600 text-white shadow-orange-500/20' :
                                isLow ? 'bg-white/5 text-white/20' :
                                    'bg-blue-600 text-white shadow-blue-500/20'}`}>
                            {lead.nome[0]}
                        </div>
                        <div>
                            <h4 className="font-bold text-white text-lg leading-none uppercase group-hover:text-red-600 transition-colors">{lead.nome}</h4>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{lead.vendedor?.split(' ')[0] || 'SEM VENDEDOR'}</span>
                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest leading-none">{lead.interesse?.slice(0, 15) || 'INTERESSE GERAL'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {!isLow && (
                    <div className="space-y-6">
                        <div className={`p-5 rounded-2xl text-xs font-medium leading-relaxed italic border-l-4
                            ${isHot ? 'bg-orange-500/[0.03] text-orange-200/60 border-orange-500' : 'bg-white/[0.02] text-white/30 border-blue-500/30'}`}>
                            &ldquo;{lead.recommended_approach || 'Padrão de abordagem não definido.'}&rdquo;
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2">
                                {isHot ? <Flame size={14} className="text-orange-500 animate-pulse" /> : <Activity size={14} className="text-blue-500" />}
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{lead.ai_classification}</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className={`text-2xl font-black tracking-tighter ${isHot ? 'text-orange-500' : 'text-white'}`}>{lead.probability_of_sale || 0}%</span>
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Chance</span>
                            </div>
                        </div>
                    </div>
                )}

                {isLow && (
                    <div className="mt-8 flex items-center justify-between">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">{lead.ai_classification}</span>
                        <div className="flex items-center gap-2 text-white/10 group-hover:text-white transition-colors">
                            <span className="text-[9px] font-black uppercase tracking-widest">Ver detalhes</span>
                            <ArrowRight size={12} />
                        </div>
                    </div>
                )}
            </div>

            <div className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent via-red-600/50 to-transparent w-full opacity-0 group-hover:opacity-100 transition-opacity`} />
        </motion.div>
    );
}

