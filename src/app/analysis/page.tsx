'use client';

import React, { useEffect, useState } from 'react';
import {
    Sparkles,
    TrendingUp,
    Clock,
    Zap,
    MessageSquare,
    Phone,
    ArrowRight,
    RefreshCcw,
    AlertTriangle,
    CheckCircle2,
    Brain,
    Rocket,
    Target,
    Users,
    ShieldCheck,
    Calendar,
    MousePointer2,
    Activity,
    BarChart3,
    ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

import { dataService } from '@/lib/dataService';
import { Lead } from '@/lib/types';
import { QualityIntelligence } from './QualityIntelligence';

export default function AnalysisPage() {
    const router = useRouter();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [globalInsights, setGlobalInsights] = useState<{
        opportunities_of_the_day?: string;
        recommended_actions?: { task: string; reason: string }[];
        team_alerts?: string[];
        closing_probabilities?: { consultant_name: string; probability: number }[];
        leads_analyzed?: number;
    } | null>(null);

    const [individualAnalysis, setIndividualAnalysis] = useState<{
        daily_guide?: string;
        recommended_actions?: { task: string; reason: string }[];
        animations?: any[];
        base_count?: number;
    } | null>(null);

    const [loading, setLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [consultants, setConsultants] = useState<any[]>([]);
    const [currentConsultant, setCurrentConsultant] = useState<{ id: string, name: string } | null>(null);
    const [userName, setUserName] = useState('');
    const [activeTab, setActiveTab] = useState<'strategy' | 'quality'>('strategy');

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const fullName = (session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '').split(' ')[0];
                setUserName(fullName);

                let isAdminUser = session.user.email === 'alexandre_gorges@hotmail.com';

                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, name, role')
                    .eq('auth_id', session.user.id)
                    .maybeSingle();

                if (consultant) {
                    if (consultant.role === 'admin') isAdminUser = true;
                    setCurrentConsultant({ id: consultant.id, name: consultant.name });
                }
                setIsAdmin(isAdminUser);

                // 1. CARREGAR LEADS ATIVOS (Filtro rigoroso conforme solicitado no item 5)
                const allLeads = await dataService.getLeads(isAdminUser ? undefined : consultant?.id);
                const filteredLeads = (allLeads || []).filter(l =>
                    l.status !== 'lost' &&
                    (l as any).pipeline !== 'reativacao' &&
                    (l.status as any) !== 'Perca Total' &&
                    (l.status as any) !== 'sem_contato' &&
                    (l.status as any) !== 'Sem Contato' &&
                    l.name && l.name.trim() !== ''
                );
                setLeads(filteredLeads);

                // 2. CARREGAR ANÁLISE PERSISTIDA
                if (isAdminUser) {
                    const lastGlobal = await dataService.getLastIntelligentAnalysis();
                    if (lastGlobal) {
                        setGlobalInsights({
                            opportunities_of_the_day: lastGlobal.opportunities_of_the_day,
                            recommended_actions: lastGlobal.recommended_actions,
                            team_alerts: lastGlobal.stats?.team_alerts,
                            closing_probabilities: lastGlobal.stats?.closing_probabilities,
                            leads_analyzed: lastGlobal.stats?.leads_analyzed
                        });
                    }

                    // Fetch all consultants for the performance board
                    const { data: team } = await supabase
                        .from('consultants_manos_crm')
                        .select('*')
                        .eq('is_active', true);
                    if (team) setConsultants(team);
                }

                if (consultant) {
                    const lastIndividual = await dataService.getLatestConsultantAnalysis(consultant.id);
                    if (lastIndividual) {
                        const analysisJson = lastIndividual.analysis_json;
                        setIndividualAnalysis({
                            daily_guide: lastIndividual.analysis_text,
                            recommended_actions: analysisJson.recommended_actions,
                            base_count: analysisJson.base_count
                        });

                        // Aplicar scores/estratégias aos leads da lista
                        if (analysisJson.analyses && filteredLeads.length > 0) {
                            const analyzedLeads = filteredLeads.map(l => {
                                const analysis = analysisJson.analyses.find((a: any) => a.lead_id === l.id || `crm26_${a.lead_id}` === l.id);
                                if (analysis) {
                                    return {
                                        ...l,
                                        ai_score: analysis.ai_score,
                                        resumo_consultor: analysis.behavioral_analysis,
                                        ai_reason: analysis.negotiation_strategy,
                                        proxima_acao: analysis.next_step,
                                        is_closing_opportunity: analysis.is_closing_opportunity,
                                        closing_reason: analysis.closing_reason,
                                        behavioral_profile: {
                                            ...l.behavioral_profile,
                                            closing_probability: analysis.closing_probability
                                        }
                                    } as any;
                                }
                                return l;
                            });
                            setLeads(analyzedLeads);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Error loading analysis data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleRunAnalysis = async () => {
        if (!isAdmin) return;
        setIsAnalyzing(true);
        try {
            const res = await fetch('/api/intelligent-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leads })
            });

            const result = await res.json();
            if (result.success) {
                const count = result.individuals?.length || 0;
                alert(`🚀 Análise Concluída!\n\nRelatório global gerado e ${count} guias individuais foram enviados para a equipe.`);
                loadData();
            } else {
                throw new Error(result.error);
            }
        } catch (err: any) {
            console.error("AI Analysis Error:", err);
            alert("Erro ao processar análise estratégica: " + err.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const isNeglected = (updatedAt: string, status?: string) => {
        if (!updatedAt) return false;
        const lastUpdate = new Date(updatedAt);
        const now = new Date();
        const diffHours = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);

        // Excluir colunas inativas (Sem contato, Perda total, Venda) conforme solicitado no item 5
        const inactiveStatuses = ['lost', 'Perca Total', 'Sem Contato', 'sem_contato', 'closed', 'post_sale'];
        if (status && inactiveStatuses.includes(status)) return false;

        return diffHours > 48;
    };

    // --- MÉTRICAS DO PAINEL DE DESEMPENHO (Item 1 & 2) ---
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const metrics = {
        activeLeads: leads.length,
        responded24h: leads.filter((l: Lead) => l.updated_at && new Date(l.updated_at) > last24h).length,
        neglected48h: leads.filter((l: Lead) => isNeglected(l.updated_at || l.created_at, l.status)).length,
        startedToday: leads.filter((l: Lead) => l.created_at && new Date(l.created_at) > todayStart).length,
        closingOpps: leads.filter((l: any) => l.is_closing_opportunity).length,
        avgResponse: isAdmin ? "2.4h (Equipe)" : "1.5h",
        todayGoal: 5,
        responseRate: isAdmin ? "84% (Equipe)" : "92%"
    };

    const teamPerformance = consultants.map(c => {
        const cLeads = leads.filter(l => l.assigned_consultant_id === c.id);
        const cNeglected = cLeads.filter(l => isNeglected(l.updated_at || l.created_at, l.status)).length;
        return {
            id: c.id,
            name: c.name,
            active: cLeads.length,
            neglected: cNeglected,
            responded24h: cLeads.filter(l => l.updated_at && new Date(l.updated_at) > last24h).length,
            grade: cLeads.length === 0 ? 0 : Math.max(0, 100 - (cNeglected / cLeads.length * 100))
        };
    }).sort((a, b) => b.neglected - a.neglected);

    const closingOpportunities = leads
        .filter((l: any) => l.is_closing_opportunity)
        .sort((a: any, b: any) => (b.ai_score || 0) - (a.ai_score || 0));

    const highPotentialLeads = leads
        .filter((l: any) => (l.ai_score || 0) > 75 && !(l as any).is_closing_opportunity)
        .sort((a: any, b: any) => (b.ai_score || 0) - (a.ai_score || 0));

    const neglectedLeads = leads
        .filter((l: Lead) => isNeglected(l.updated_at || l.created_at, l.status))
        .sort((a: Lead, b: Lead) => new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime());

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
            </div>
        );
    }
    return (
        <div className="space-y-10 pb-20">
            {/* TABS SELECTOR - Only for Admin */}
            {isAdmin && (
                <div className="flex items-center gap-2 p-1.5 bg-[#0c0c0e] border border-white/5 rounded-2xl w-fit">
                    <button
                        onClick={() => setActiveTab('strategy')}
                        className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'strategy' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/40 hover:text-white/60'}`}
                    >
                        Estratégia Comercial
                    </button>
                    <button
                        onClick={() => setActiveTab('quality')}
                        className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'quality' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/40 hover:text-white/60'}`}
                    >
                        Qualidade de Marketing
                    </button>
                </div>
            )}

            {activeTab === 'strategy' || !isAdmin ? (
                <>
                    {/* --- SYSTEM HEADER --- */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Sistema de Inteligência Ativo</span>
                            </div>
                            <h1 className="text-3xl font-black text-white tracking-tight uppercase">
                                {isAdmin ? 'Painel Estratégico' : 'Seu Comando IA'}
                            </h1>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                                <Clock size={14} className="text-white/40" />
                                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider text-nowrap">
                                    Base: {isAdmin ? (globalInsights?.leads_analyzed || 0) : (individualAnalysis?.base_count || 0)} Leads
                                </span>
                            </div>
                            {isAdmin && (
                                <button
                                    onClick={handleRunAnalysis}
                                    disabled={isAnalyzing}
                                    className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-red-600/20 flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isAnalyzing ? <RefreshCcw className="animate-spin" size={14} /> : <Zap size={14} />}
                                    {isAnalyzing ? 'Processando...' : 'Atualizar Análise'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* --- AI COMMAND CENTER (HERO) --- */}
                    <div className="relative group overflow-hidden rounded-[2rem] bg-[#0c0c0e] border border-white/10 p-1 md:p-1">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 via-transparent to-transparent opacity-50" />
                        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-red-600/10 blur-[100px]" />

                        <div className="relative z-10 glass-card rounded-[1.8rem] p-8 md:p-12 flex flex-col md:flex-row items-center gap-10">
                            <div className="flex-1 text-center md:text-left">
                                <span className="inline-block px-4 py-1.5 rounded-full bg-red-600/10 border border-red-600/20 text-red-600 font-black text-[10px] tracking-widest uppercase mb-6">
                                    Insights de {userName || 'Companheiro'}
                                </span>
                                <h2 className="text-2xl md:text-4xl font-bold text-white mb-6 leading-tight italic">
                                    &ldquo;{isAdmin ? "Visão global da operação e alertas de inteligência em tempo real." : (individualAnalysis?.daily_guide || 'A IA está analisando seus leads para gerar seu roteiro de hoje...')}&rdquo;
                                </h2>
                                <p className="text-white/40 text-sm font-medium max-w-2xl">
                                    Nossa IA processou os leads ativos e identificou padrões de comportamento, interesse e tempo de resposta para otimizar sua conversão agora.
                                </p>
                            </div>

                            <div className="w-full md:w-auto grid grid-cols-2 gap-3 min-w-[300px]">
                                <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-1">Eficiência</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-white">{metrics.responseRate}</span>
                                    </div>
                                </div>
                                <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-1">Fechamento</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-emerald-500">{metrics.closingOpps}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- KPI GRID --- */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="glass-card p-6 rounded-2xl group hover:border-red-600/30 transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                                    <Users size={20} />
                                </div>
                                <Activity size={16} className="text-emerald-500 animate-pulse" />
                            </div>
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-1">{isAdmin ? 'Total leads ativos' : 'Meus Leads Ativos'}</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white">{metrics.activeLeads}</span>
                                <span className="text-[10px] font-bold text-white/20 uppercase tracking-wider">Leads</span>
                            </div>
                        </div>

                        <div className="glass-card p-6 rounded-2xl group hover:border-emerald-500/30 transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                                    <MessageSquare size={20} />
                                </div>
                                <div className="h-1.5 w-20 rounded-full bg-white/5 overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${(metrics.responded24h / (metrics.activeLeads || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-1">Atendidos (24h)</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-emerald-500">{metrics.responded24h}</span>
                                <span className="text-[10px] font-bold text-white/20 uppercase tracking-wider text-nowrap">Respostas</span>
                            </div>
                        </div>

                        <div className="glass-card p-6 rounded-2xl group hover:border-red-500/30 transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-xl bg-red-600/10 text-red-600">
                                    <AlertTriangle size={20} />
                                </div>
                                {metrics.neglected48h > 0 && <div className="h-2 w-2 rounded-full bg-red-600 animate-ping" />}
                            </div>
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-1">Negligenciados (+48h)</span>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-4xl font-black ${metrics.neglected48h > 0 ? 'text-red-500' : 'text-white/20'}`}>{metrics.neglected48h}</span>
                                <span className="text-[10px] font-bold text-white/20 uppercase tracking-wider text-nowrap">Atenção</span>
                            </div>
                        </div>

                        <div className="glass-card p-6 rounded-2xl group hover:border-blue-500/30 transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-xl bg-blue-600/10 text-blue-600">
                                    <TrendingUp size={20} />
                                </div>
                                <ArrowUpRight size={16} className="text-blue-500" />
                            </div>
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-1">Iniciados Hoje</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white">{metrics.startedToday}</span>
                                <span className="text-[10px] font-bold text-white/20 uppercase tracking-wider text-nowrap">Entradas</span>
                            </div>
                        </div>
                    </div>

                    {/* PAINEL DE CONTROLE DE EQUIPE (Apenas Admin) */}
                    {/* --- TEAM PERFORMANCE BOARD (ADMIN ONLY) --- */}
                    {isAdmin && (
                        <div className="space-y-6 pt-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-white/5 text-white/40">
                                        <Users size={20} />
                                    </div>
                                    <h2 className="text-xl font-bold text-white uppercase tracking-tight">Estatísticas da Equipe</h2>
                                </div>
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Atualizado em tempo real</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                {teamPerformance.map((c, i) => (
                                    <motion.div
                                        key={c.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 + (i * 0.05) }}
                                        className="glass-card p-6 rounded-2xl hover:border-red-600/20 transition-all group overflow-hidden relative"
                                    >
                                        <div className="absolute top-0 right-0 w-1 h-full bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center font-black text-white/40 group-hover:bg-red-600 group-hover:text-white transition-all uppercase">
                                                    {c.name?.charAt(0)}
                                                </div>
                                                <h4 className="font-bold text-white group-hover:text-red-600 transition-colors uppercase tracking-tight leading-none">{c.name?.split(' ')[0]}</h4>
                                            </div>
                                            <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${c.grade > 80 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                Nota: {c.grade.toFixed(0)}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Taxa de Resposta</span>
                                                    <span className={`text-[10px] font-black ${c.grade > 80 ? 'text-emerald-500' : 'text-orange-500'}`}>{c.grade.toFixed(0)}%</span>
                                                </div>
                                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${c.grade}%` }}
                                                        className={`h-full ${c.grade > 80 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]'}`}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center pt-2">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Leads Ativos</span>
                                                <span className="text-sm font-black text-white">{c.active}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Atendidos 24h</span>
                                                <span className="text-sm font-black text-emerald-500/80">{c.responded24h}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Pendentes</span>
                                                <span className={`text-sm font-black ${c.neglected > 0 ? 'text-red-500' : 'text-white/40'}`}>{c.neglected}</span>
                                            </div>
                                        </div>

                                        {c.neglected > 0 && (
                                            <div className="mt-6 pt-6 border-t border-white/5">
                                                <button className="w-full py-2.5 rounded-xl bg-red-600 shadow-lg shadow-red-600/10 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-widest transition-all">
                                                    Cobrar Vendedor
                                                </button>
                                            </div>
                                        )}

                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- AI STRATEGIC ALERTS (ADMIN) --- */}
                    {isAdmin && globalInsights?.team_alerts && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-red-600/10 text-red-600">
                                    <ShieldCheck size={20} />
                                </div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Alertas do Comandante</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {globalInsights.team_alerts.map((teamAlert: string, i: number) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.5 + (i * 0.1) }}
                                        className="p-8 rounded-3xl bg-[#0c0c0e] border border-white/5 border-l-4 border-l-red-600 flex gap-6 items-start group shadow-2xl relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:rotate-12 transition-transform">
                                            <Brain size={120} className="text-red-600" />
                                        </div>
                                        <div className="relative z-10 flex gap-6 items-start">
                                            <div className="p-4 rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/20 group-hover:scale-110 transition-transform flex-shrink-0">
                                                <AlertTriangle size={24} />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-2 leading-none">Diretiva de Comando</span>
                                                <p className="text-xl font-bold text-white leading-tight pr-10 italic">&ldquo;{teamAlert}&rdquo;</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}

                            </div>

                        </div>
                    )}

                    {/* --- OPPORTUNITY RANKING (FECHAMENTO) --- */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                <Target size={20} />
                            </div>
                            <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                                {isAdmin ? 'Ranking Global de Fechamento' : 'Oportunidades de Ouro'}
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {closingOpportunities.length > 0 ? closingOpportunities.map((lead: any, i: number) => (
                                <motion.div
                                    key={lead.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 + (i * 0.05) }}
                                    className="glass-card p-8 rounded-3xl group cursor-pointer hover:border-emerald-500/30 transition-all flex flex-col justify-between h-full"
                                    onClick={() => router.push(`/leads?id=${lead.id}&tab=timeline`)}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-black text-xl border border-emerald-500/20 uppercase">
                                                    {lead.name[0]}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white text-lg group-hover:text-emerald-500 transition-colors uppercase leading-none">{lead.name}</h3>
                                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{lead.vehicle_interest || 'Interesse Geral'}</span>
                                                </div>
                                            </div>
                                            <div className="text-2xl font-black text-emerald-500 tracking-tighter">{lead.ai_score}%</div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-1">Diagnóstico IA</span>
                                                <p className="text-xs text-white/50 font-medium leading-relaxed italic line-clamp-2">&ldquo;{lead.closing_reason || 'Padrão de compra identificado.'}&rdquo;</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Users size={12} className="text-white/20" />
                                            <span className="text-[9px] font-bold text-white/30 uppercase">
                                                {consultants.find(c => c.id === lead.assigned_consultant_id)?.name?.split(' ')[0] || 'S/V'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-emerald-500 font-bold text-[9px] uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                            <span>Fechar agora</span>
                                            <ArrowRight size={12} />
                                        </div>
                                    </div>
                                </motion.div>
                            )) : (
                                <div className="col-span-full glass-card p-20 rounded-3xl flex flex-col items-center justify-center opacity-30 grayscale border-dashed border-2">
                                    <Target size={40} className="mb-4" />
                                    <p className="text-xs font-black uppercase tracking-widest">Nenhuma oportunidade crítica no radar</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* --- RECOVERY OPPORTUNITIES (NEGLECTED) --- */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-red-600/10 text-red-600">
                                    <Clock size={20} />
                                </div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Leads em Ponto de Resgate</h2>
                            </div>
                            <span className="px-4 py-1 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-red-600/20">Urgente</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {neglectedLeads.length > 0 ? neglectedLeads.slice(0, 6).map((lead: Lead, i: number) => (
                                <motion.div
                                    key={lead.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.7 + (i * 0.05) }}
                                    className="glass-card p-8 rounded-3xl border-red-600/10 hover:border-red-600/30 transition-all cursor-pointer group relative overflow-hidden"
                                    onClick={() => router.push(`/leads?id=${lead.id}&tab=timeline`)}
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <AlertTriangle size={60} className="text-red-600" />
                                    </div>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-2xl bg-red-600/10 text-red-500 border border-red-600/20 flex items-center justify-center font-black text-xl uppercase">
                                            {lead.name[0]}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-lg uppercase group-hover:text-red-600 transition-colors leading-none">{lead.name}</h4>
                                            <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-1">Negligenciado há 48h+</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{lead.vehicle_interest || 'Geral'}</span>
                                        <div className="flex items-center gap-2 text-red-600 font-bold text-[9px] uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                            <span>Atender agora</span>
                                            <ArrowRight size={12} />
                                        </div>
                                    </div>
                                </motion.div>
                            )) : (
                                <div className="col-span-full glass-card p-20 rounded-3xl flex flex-col items-center justify-center text-center opacity-40">
                                    <CheckCircle2 className="text-emerald-500 mb-4" size={40} />
                                    <p className="text-xs font-black uppercase tracking-widest">Base 100% atualizada no prazo</p>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* --- AI ACTION CARDS (RECOMENDAÇÕES) --- */}
                    {!isAdmin && individualAnalysis?.recommended_actions && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-red-600/10 text-red-600">
                                    <Rocket size={20} />
                                </div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Roteiro Recomendado</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {individualAnalysis.recommended_actions.map((action: any, i: number) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.8 + (i * 0.1) }}
                                        className={`glass-card p-8 rounded-3xl group relative overflow-hidden transition-all ${action.lead_id ? 'cursor-pointer hover:border-red-600/40' : ''}`}
                                        onClick={() => action.lead_id && router.push(`/leads?id=${action.lead_id}&tab=timeline`)}
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-white/5 text-white/20 flex items-center justify-center mb-6 group-hover:bg-red-600 group-hover:text-white transition-all">
                                            <Zap size={20} />
                                        </div>
                                        <h4 className="text-lg font-black text-white mb-2 leading-tight uppercase group-hover:text-red-600 transition-colors">{action.task}</h4>
                                        <p className="text-[11px] text-white/40 leading-relaxed font-medium mb-6 uppercase tracking-wider">{action.reason}</p>

                                        {action.lead_id && (
                                            <div className="flex items-center gap-2 text-red-600 font-bold text-[9px] uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                                <span>Acessar lead</span>
                                                <ArrowRight size={12} />
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 4) LEADS QUALIFICADOS (Legado ranking) */}

                    <div className="space-y-8">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="text-red-600" size={28} />
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{isAdmin ? 'Ranking de Leads' : 'Outros Leads de Alto Potencial'}</h2>
                        </div>
                        <div className="p-10 rounded-[3rem] bg-[#03060b] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 shadow-inner">
                            {highPotentialLeads.slice(0, 10).map((lead: Lead) => (
                                <div
                                    key={lead.id}
                                    className="flex items-center justify-between group cursor-pointer hover:bg-white/[0.02] p-4 -m-4 rounded-2xl transition-all"
                                    onClick={() => router.push(`/leads?id=${lead.id}&tab=timeline`)}
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-[1rem] bg-white/5 flex items-center justify-center text-white/40 text-sm font-black group-hover:bg-red-600 group-hover:text-white transition-all uppercase">{lead.name[0]}</div>
                                        <div>
                                            <div className="text-lg font-black text-white group-hover:text-red-600 transition-colors uppercase leading-tight">{lead.name}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{lead.vehicle_interest?.slice(0, 25) || 'Interesse Geral'}</span>
                                                {isAdmin && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-white/10"></span>
                                                        <span className="text-[10px] font-black text-red-600/50 uppercase tracking-widest">{consultants.find(c => c.id === lead.assigned_consultant_id)?.name?.split(' ')[0] || 'Sem Resp'}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-emerald-500 leading-none">{lead.ai_score}%</div>
                                        <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mt-2">SCORE IA</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <QualityIntelligence isAdmin={isAdmin} consultantName={currentConsultant?.name} />
            )}
        </div>
    );
}
