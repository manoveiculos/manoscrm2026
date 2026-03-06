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
    Phone
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
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header com estilo "Dashboard Sênior" */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-500/80">Monitoramento Preditivo IA</span>
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-[#f0f6fc] uppercase">Diagnóstico de Qualidade</h1>
                    <p className="text-[#8b949e] mt-1 text-sm font-medium">Análise qualitativa e probabilística dos leads gerados.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e] group-focus-within:text-red-500 transition-colors" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar nome, carro ou tel..."
                            className="bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#c9d1d9] focus:outline-none focus:border-red-500/50 w-64 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" size={14} />
                        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#c9d1d9]">
                            {new Date().toLocaleDateString('pt-BR')}
                        </div>
                    </div>

                    {isAdmin && (
                        <button
                            onClick={handleRunAnalysis}
                            disabled={isAnalyzing}
                            className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-red-600/10"
                        >
                            {isAnalyzing ? <RefreshCcw size={14} className="animate-spin" /> : <Zap size={14} />}
                            {isAnalyzing ? 'Processando' : 'Executar Diagnóstico'}
                        </button>
                    )}
                </div>
            </header>

            {/* KPI Cards Estilo MarketingPage */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { type: 'all', label: "Média de Qualidade", value: `${report?.quality_average.toFixed(0) || 0}%`, unit: "PRECISÃO", icon: <TrendingUp size={24} className="text-blue-400" /> },
                    { type: 'hot', label: "Leads Quentes", value: report?.quentes.toString() || "0", unit: "ESTRELAS", icon: <Flame size={24} className="text-orange-500" /> },
                    { type: 'warm', label: "Campanha Score", value: `${report?.overall_score.toFixed(1) || 0}`, unit: "/ 10", icon: <BarChart3 size={24} className="text-red-500" /> },
                    { type: 'all', label: "Total Analisado", value: (report?.total_leads || 0).toString(), unit: "LEADS", icon: <Activity size={24} className="text-emerald-400" /> }
                ].map((kpi, idx) => (
                    <div
                        key={idx}
                        onClick={() => kpi.type !== 'all' && setFilterType(kpi.type as any)}
                        className={`p-5 rounded-xl border shadow-sm relative overflow-hidden group cursor-pointer transition-all
                            ${filterType === kpi.type ? 'bg-red-600/5 border-red-600/30' : 'bg-[#0d1117] border-[#30363d] hover:border-white/10'}`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-[#8b949e] group-hover:scale-110 transition-transform">{kpi.icon}</div>
                            {filterType === kpi.type && <div className="p-1 rounded-full bg-red-600 animate-pulse" />}
                        </div>
                        <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-1 tracking-widest">{kpi.label}</p>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-3xl font-black text-[#f0f6fc] tracking-tighter">{kpi.value}</h4>
                            <span className="text-[9px] text-[#484f58] font-bold uppercase tracking-widest">{kpi.unit}</span>
                        </div>
                        <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-transparent via-red-600/10 to-transparent translate-x-3 group-hover:translate-x-0 transition-transform" />
                    </div>
                ))}
            </div>

            {/* AI Analysis Quote Section (Estilo MarketingPage) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 p-8 rounded-2xl bg-[#0d1117] border border-[#30363d] relative overflow-hidden group">
                    <div className="flex items-center gap-3 mb-6">
                        <Sparkles size={22} className="text-red-500" />
                        <h2 className="text-xl font-black text-[#f0f6fc] uppercase tracking-tight">Análise Estratégica IA</h2>
                    </div>
                    <div className="mb-8 p-6 rounded-xl bg-red-600/[0.03] border-l-4 border-red-600">
                        <p className="text-lg md:text-xl text-[#c9d1d9] leading-relaxed italic font-medium">&quot;{dynamicSummary}&quot;</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {report?.recommendations?.slice(0, 2).map((rec, i) => (
                            <div key={i} className="p-5 rounded-xl bg-white/[0.02] border border-[#30363d] hover:border-red-600/50 transition-all flex gap-4">
                                <div className="p-2 h-fit rounded-lg bg-red-600/10 text-red-500 font-bold text-[10px]">{i + 1}</div>
                                <div>
                                    <p className="text-[10px] font-black text-[#8b949e] uppercase mb-1">Próximo Passo</p>
                                    <p className="text-sm font-bold text-white leading-tight">{rec}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-4 p-8 rounded-2xl bg-[#0d1117] border border-[#30363d] flex flex-col justify-center text-center relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-[#8b949e] uppercase mb-4 tracking-widest">Qualidade Preditiva</p>
                        <div className="flex items-baseline justify-center gap-2 mb-6">
                            <span className="text-6xl font-black text-[#f0f6fc] tracking-tighter">{(report?.quality_average || 0).toFixed(0)}</span>
                            <span className="text-xl font-bold text-red-500 tracking-widest">%</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${report?.quality_average || 0}%` }}
                                className="h-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                            />
                        </div>
                        <p className="text-[10px] text-[#484f58] font-bold uppercase mt-4 tracking-widest">Fidelidade do Público-Alvo</p>
                    </div>
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform">
                        <Target size={120} className="text-red-600" />
                    </div>
                </div>
            </div>

            {/* SEÇÃO DE LEADS - FOCO EM CONVERSÃO */}
            <div className="space-y-12 pt-8">
                {/* 1. ALTA PRIORIDADE (QUENTES) */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                            <Flame size={20} />
                        </div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Oportunidades Reais de Venda</h2>
                        <span className="px-3 py-0.5 rounded-full bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest leading-none">Alta Probabilidade</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {highPriorityLeads.map(lead => (
                            <LeadCard key={lead.id} lead={lead} variant="hot" onClick={(id) => router.push(`/leads?id=crm26_${id}&tab=timeline`)} />
                        ))}
                        {highPriorityLeads.length === 0 && (
                            <div className="col-span-full py-12 text-center rounded-2xl border-2 border-dashed border-[#30363d] opacity-40">
                                <Search size={40} className="mx-auto mb-4" />
                                <p className="text-sm font-bold uppercase tracking-widest">Nenhuma oportunidade crítica no radar</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. LEADS MORNOS / FRIOS */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                            <Thermometer size={20} />
                        </div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Potencial em Desenvolvimento</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {mediumLeads.map(lead => (
                            <LeadCard key={lead.id} lead={lead} variant="medium" onClick={(id) => router.push(`/leads?id=crm26_${id}&tab=timeline`)} />
                        ))}
                    </div>
                </div>

                {/* 3. DEMAIS LEADS / DESQUALIFICADOS */}
                <div className="space-y-6 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white/5 text-white/40">
                            <Skull size={20} />
                        </div>
                        <h2 className="text-lg font-black text-white/60 uppercase tracking-tight">Desqualificados / Arquivo</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {lowLeads.map(lead => (
                            <LeadCard key={lead.id} lead={lead} variant="low" onClick={(id) => router.push(`/leads?id=crm26_${id}&tab=timeline`)} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function LeadCard({ lead, variant, onClick }: { lead: LeadResult, variant: 'hot' | 'medium' | 'low', onClick: (id: any) => void }) {
    const isHot = variant === 'hot';
    const isLow = variant === 'low';

    return (
        <motion.div
            whileHover={{ scale: 1.01, y: -2 }}
            onClick={() => onClick(lead.id)}
            className={`cursor-pointer rounded-xl border p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group
                ${isHot ? 'bg-[#0d1117] border-orange-500/30 hover:border-orange-500/60 shadow-lg shadow-orange-500/5' :
                    isLow ? 'bg-[#090b0e] border-[#30363d] hover:border-red-600/30' :
                        'bg-[#0d1117] border-[#30363d] hover:border-blue-500/40'}`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm uppercase
                        ${isHot ? 'bg-orange-500 text-white' :
                            isLow ? 'bg-white/5 text-white/20' :
                                'bg-blue-600/20 text-blue-400'}`}>
                        {lead.nome[0]}
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm leading-tight group-hover:text-red-600 transition-colors uppercase tracking-tight">{lead.nome}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-black text-[#8b949e] uppercase tracking-widest">{lead.vendedor?.split(' ')[0] || 'TBD'}</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-white/10" />
                            <span className="text-[10px] text-[#484f58] font-bold uppercase">{lead.interesse?.slice(0, 15) || 'Geral'}</span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className={`text-xl font-black tracking-tighter leading-none ${isHot ? 'text-orange-500' : 'text-white/60'}`}>
                        {lead.probability_of_sale || 0}%
                    </div>
                    <span className="text-[8px] font-black text-[#484f58] uppercase tracking-widest">Chance</span>
                </div>
            </div>

            {!isLow && (
                <div className="mt-2 space-y-3">
                    <div className={`p-3 rounded-lg text-[11px] font-medium leading-relaxed italic
                        ${isHot ? 'bg-orange-500/5 text-orange-200/80 border-l-2 border-orange-500' : 'bg-white/[0.02] text-white/40 border-l-2 border-blue-500/30'}`}>
                        &quot;{lead.recommended_approach || 'Aguardando próxima ação estratégica de atendimento.'}&quot;
                    </div>
                    <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-1.5">
                            {isHot ? <Flame size={12} className="text-orange-500 animate-pulse" /> : <Activity size={12} className="text-blue-500" />}
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#8b949e]">{lead.ai_classification}</span>
                        </div>
                        <div className="flex items-center gap-1 text-red-600 transform group-hover:translate-x-1 transition-transform">
                            <span className="text-[9px] font-black uppercase tracking-widest">Atender</span>
                            <ArrowRight size={12} />
                        </div>
                    </div>
                </div>
            )}

            {isLow && (
                <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#484f58] uppercase tracking-widest">{lead.ai_classification}</span>
                    <button className="text-[9px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-colors">Detalhes</button>
                </div>
            )}

            {/* Efeito de hover lateral */}
            <div className={`absolute top-0 right-0 w-1 h-full opacity-0 group-hover:opacity-100 transition-opacity
                ${isHot ? 'bg-orange-500' : 'bg-red-600'}`} />
        </motion.div>
    );
}
