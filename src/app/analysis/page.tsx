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
            {/* 1) CABEÇALHO PODEROSO: ESTRATÉGIA (ESQUERDA) + DASHBOARD (DIREITA) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LADO ESQUERDO: ESTRATÉGIA E MENSAGEM */}
                <div className="lg:col-span-7 flex flex-col justify-between p-10 md:p-14 rounded-[2.5rem] bg-gradient-to-br from-[#0c0c0e] to-[#040405] border border-white/5 relative overflow-hidden">
                    <div className="relative z-10 text-pretty">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-2xl bg-red-600/10 border border-red-600/20 text-red-500 font-black text-[10px] tracking-widest uppercase">
                                Inteligência Comercial
                            </div>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-red-600 mb-6 leading-tight uppercase tracking-tighter">
                            {isAdmin ? 'Gestão de Vendas' : 'Sua Estratégia IA'}
                        </h1>
                        <p className="text-xl md:text-2xl text-white/90 leading-tight font-black italic mb-8">
                            "{isAdmin ? "Visão global da operação e alertas de equipe." : (individualAnalysis?.daily_guide || 'A IA está analisando seus leads para hoje...')}"
                        </p>
                        <div className="flex flex-wrap gap-4">
                            {isAdmin && (
                                <button
                                    onClick={handleRunAnalysis}
                                    disabled={isAnalyzing}
                                    className="px-8 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all shadow-xl shadow-red-600/20 flex items-center gap-3 disabled:opacity-50"
                                >
                                    {isAnalyzing ? <RefreshCcw className="animate-spin" size={18} /> : <Zap size={18} />}
                                    {isAnalyzing ? 'PROCESSANDO...' : 'EXECUTAR ANÁLISE'}
                                </button>
                            )}
                            <div className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-widest leading-none">
                                <Clock size={14} />
                                Base: {isAdmin ? (globalInsights?.leads_analyzed || 0) : (individualAnalysis?.base_count || 0)} Leads
                            </div>
                        </div>
                    </div>
                    {/* Efeito decorativo */}
                    <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Sparkles size={160} className="text-red-600" />
                    </div>
                </div>

                {/* LADO DIREITO: DASHBOARD INTEGRADO */}
                <div className="lg:col-span-5 grid grid-cols-2 gap-4">
                    <div className="p-8 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 flex flex-col justify-between">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{isAdmin ? 'Total Leads Ativos' : 'Leads Ativos'}</span>
                        <div className="mt-4 flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">{metrics.activeLeads}</span>
                            <Activity size={20} className="text-emerald-500" />
                        </div>
                    </div>
                    <div className="p-8 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 flex flex-col justify-between">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Atendidos 24h</span>
                        <div className="mt-4 flex items-baseline gap-2">
                            <span className="text-4xl font-black text-emerald-500">{metrics.responded24h}</span>
                            <div className="w-16 h-2 rounded-full bg-white/5 overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${(metrics.responded24h / (metrics.activeLeads || 1)) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="p-8 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 flex flex-col justify-between">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{isAdmin ? 'Atenção (Total Equipe)' : 'Resgate (48h+)'}</span>
                        <div className="mt-4 flex items-baseline gap-2">
                            <span className={`text-4xl font-black ${metrics.neglected48h > 0 ? 'text-red-500' : 'text-white/20'}`}>{metrics.neglected48h}</span>
                            {metrics.neglected48h > 0 && <AlertTriangle size={20} className="text-red-500 animate-pulse" />}
                        </div>
                    </div>
                    <div className="p-8 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 flex flex-col justify-between">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Iniciados Hoje</span>
                        <div className="mt-4 flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">{metrics.startedToday}</span>
                            <TrendingUp size={20} className="text-blue-500" />
                        </div>
                    </div>
                    <div className="col-span-2 p-8 rounded-[2.5rem] bg-red-600/[0.03] border border-red-600/10 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-black text-red-500/50 uppercase tracking-widest block mb-1">{isAdmin ? 'Média de Resposta Equipe' : 'Tempo Médio Resposta'}</span>
                            <span className="text-2xl font-black text-white">{metrics.avgResponse}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] font-black text-red-500/50 uppercase tracking-widest block mb-1">{isAdmin ? 'Eficiência de Atendimento' : 'Taxa de Resposta'}</span>
                            <span className="text-2xl font-black text-emerald-500">{metrics.responseRate}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* PAINEL DE CONTROLE DE EQUIPE (Apenas Admin) */}
            {isAdmin && (
                <div className="space-y-8">
                    <div className="flex items-center gap-3">
                        <Users className="text-red-600" size={28} />
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Controle de Performance da Equipe</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {teamPerformance.map((c) => (
                            <div key={c.id} className="p-8 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 hover:border-red-600/20 transition-all group">
                                <div className="flex items-center justify-between mb-6">
                                    <h4 className="font-black text-white uppercase group-hover:text-red-600 transition-colors">{c.name?.split(' ')[0]}</h4>
                                    <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${c.grade > 80 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                        Nota: {c.grade.toFixed(0)}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/30">
                                        <span>Leads Ativos</span>
                                        <span className="text-white">{c.active}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/30">
                                        <span>Atendidos 24h</span>
                                        <span className="text-emerald-500">{c.responded24h}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/30">
                                        <span>Negligenciados</span>
                                        <span className={c.neglected > 0 ? 'text-red-500' : 'text-white'}>{c.neglected}</span>
                                    </div>
                                </div>
                                {c.neglected > 0 && (
                                    <div className="mt-6 pt-6 border-t border-white/5">
                                        <button className="w-full py-3 rounded-xl bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white font-black text-[10px] uppercase tracking-widest transition-all">
                                            Cobrar Pendências
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ALERTAS ESTRATÉGICOS DA IA (Apenas Admin) */}
            {isAdmin && globalInsights?.team_alerts && (
                <div className="space-y-8">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="text-red-600" size={28} />
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Alertas do Comandante</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {globalInsights.team_alerts.map((alert: string, i: number) => (
                            <div key={i} className="p-10 rounded-[3rem] bg-gradient-to-r from-red-600/10 to-transparent border border-red-600/20 flex gap-6 items-start">
                                <div className="p-4 rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/20">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-2">ALERTA CRÍTICO</span>
                                    <p className="text-xl font-black text-white italic leading-tight">"{alert}"</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 1) LEADS QUALIFICADOS PARA FECHAMENTO (Item 6 & 7) */}
            <div className="space-y-8">
                <div className="flex items-center gap-3">
                    <Target className="text-red-600" size={28} />
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{isAdmin ? 'Ranking Global de Fechamento' : 'Leads Qualificados para Fechamento'}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {closingOpportunities.length > 0 ? closingOpportunities.map((lead: any) => (
                        <motion.div
                            key={lead.id}
                            whileHover={{ y: -8 }}
                            className="p-10 rounded-[3rem] bg-gradient-to-b from-emerald-600/[0.08] to-transparent border border-emerald-500/20 cursor-pointer group hover:border-emerald-500/40 transition-all shadow-2xl"
                            onClick={() => router.push(`/leads?id=${lead.id}&tab=timeline`)}
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500 text-white flex items-center justify-center font-black text-2xl shadow-xl shadow-emerald-500/20">
                                        {lead.name[0]}
                                    </div>
                                    <div>
                                        <h3 className="font-black text-white text-xl leading-tight uppercase group-hover:text-emerald-500 transition-colors">{lead.name}</h3>
                                        {isAdmin && (
                                            <div className="flex items-center gap-2 mt-1">
                                                <Users size={12} className="text-white/40" />
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{consultants.find(c => c.id === lead.assigned_consultant_id)?.name?.split(' ')[0] || 'Sem Consultor'}</span>
                                            </div>
                                        )}
                                        <span className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em]">{lead.vehicle_interest || 'Aguardando Perfil'}</span>
                                    </div>
                                </div>
                                <div className="text-3xl font-black text-emerald-500 tracking-tighter">{lead.ai_score}%</div>
                            </div>
                            <div className="space-y-5">
                                <div className="p-5 rounded-[1.5rem] bg-emerald-500/[0.03] border border-emerald-500/10">
                                    <span className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest block mb-1.5">Gatilho de Fechamento</span>
                                    <p className="text-md text-white/80 font-bold leading-relaxed line-clamp-2">{lead.closing_reason || 'Detectado alto engajamento e intenção de compra.'}</p>
                                </div>
                                <div className="p-5 rounded-[1.5rem] bg-red-600/5 border border-red-600/10">
                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1.5">Estratégia</span>
                                    <p className="text-md text-red-500 font-black leading-relaxed italic">{lead.proxima_acao || 'Aguardando atualização da IA...'}</p>
                                </div>
                            </div>
                        </motion.div>
                    )) : (
                        <div className="col-span-full p-20 rounded-[3rem] border border-white/5 bg-[#0c0c0e] flex flex-col items-center justify-center text-center opacity-30 grayscale">
                            <Target size={60} className="mb-4 text-white/20" />
                            <p className="text-lg font-black text-white/40 uppercase tracking-widest">Nenhuma oportunidade crítica detectada.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 2) AÇÕES RECOMENDADAS PELA IA (Item 9) */}
            {!isAdmin && (
                <div className="space-y-8">
                    <div className="flex items-center gap-3">
                        <Rocket className="text-red-600" size={28} />
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Ações Recomendadas</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {individualAnalysis?.recommended_actions?.map((action: any, i: number) => (
                            <div
                                key={i}
                                className={`p-10 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 transition-all group shadow-xl relative overflow-hidden ${action.lead_id ? 'cursor-pointer hover:border-red-600/40 hover:bg-red-600/[0.02]' : ''}`}
                                onClick={() => {
                                    if (action.lead_id) {
                                        router.push(`/leads?id=${action.lead_id}&tab=timeline`);
                                    }
                                }}
                            >
                                <div className="w-12 h-12 rounded-2xl bg-white/5 text-white/20 flex items-center justify-center mb-8 group-hover:bg-red-600 group-hover:text-white transition-all">
                                    <Zap size={24} />
                                </div>
                                <h4 className="text-lg font-black text-white mb-3 leading-tight uppercase tracking-tight group-hover:text-red-600 transition-colors uppercase">{action.task}</h4>
                                <p className="text-sm text-white/40 leading-relaxed font-medium mb-6">{action.reason}</p>

                                {action.lead_id && (
                                    <div className="flex items-center gap-2 text-red-600 group-hover:translate-x-1 transition-all">
                                        <span className="text-[10px] font-black uppercase tracking-widest">Acessar agora</span>
                                        <ArrowRight size={14} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3) OPORTUNIDADES PARA RESGATE (Item 4 & 5) */}
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Clock className="text-red-600" size={28} />
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{isAdmin ? 'Leads Críticos: Sem Retorno (Time)' : 'Oportunidades para Resgate'}</h2>
                    </div>
                    <span className="px-6 py-2 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/20 text-[10px] font-black uppercase tracking-widest">Resgate Imediato</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {neglectedLeads.length > 0 ? neglectedLeads.map((lead: Lead) => (
                        <div
                            key={lead.id}
                            className="p-10 rounded-[3rem] bg-[#0c0c0e] border border-red-600/10 hover:border-red-600/40 transition-all cursor-pointer group shadow-xl relative overflow-hidden"
                            onClick={() => router.push(`/leads?id=${lead.id}&tab=timeline`)}
                        >
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                <AlertTriangle size={60} className="text-red-600" />
                            </div>
                            <div className="flex items-start justify-between mb-8">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-red-600/10 text-red-500 border border-red-600/20 flex items-center justify-center font-black text-2xl">
                                        {lead.name[0]}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-white text-xl uppercase group-hover:text-red-500 transition-colors leading-tight">{lead.name}</h4>
                                        <div className="flex flex-col gap-1 mt-1.5 ">
                                            <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest italic">Atenção Crítica: 48h sem resposta</p>
                                            {isAdmin && (
                                                <div className="flex items-center gap-2">
                                                    <Users size={12} className="text-white/20" />
                                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{consultants.find(c => c.id === lead.assigned_consultant_id)?.name?.split(' ')[0] || 'Sem Resp'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">{lead.vehicle_interest || 'Interesse Geral'}</span>
                                    <div className="flex items-center gap-3 text-red-600 group-hover:translate-x-2 transition-transform">
                                        <span className="text-[11px] font-black uppercase tracking-widest">{isAdmin ? 'Ver Detalhes' : 'Atender Agora'}</span>
                                        <ArrowRight size={18} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="col-span-full p-20 rounded-[3rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center text-center">
                            <CheckCircle2 className="text-emerald-500/20 mb-6" size={80} />
                            <p className="text-xl font-black uppercase tracking-widest text-white/20">Sua base está 100% atualizada.</p>
                        </div>
                    )}
                </div>
            </div>

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
        </div>
    );
}
