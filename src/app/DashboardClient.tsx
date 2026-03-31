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
import { LeadProfileModalV2 } from './components/lead-profile/LeadProfileModalV2';
import { Lead } from '@/lib/types';
import { dataService } from '@/lib/dataService';
import { supabase } from '@/lib/supabase';
import { metricsService } from '@/lib/metricsService';

interface AIInsight {
    title: string;
    desc: string;
    time: string;
    color: string;
    leadId?: string;
    leadName?: string;
}

interface DashboardClientProps {
    metrics: FinancialMetrics;
    userName: string;
    consultantId?: string; // NOVO: ID dinâmico vindo da sessão
    aiInsights: AIInsight[];
    salesToTop: number;
    leadsTotalMes?: number; // Contador fixo do acumulado do mês
    vendasTotalMes?: number; // Contador de vendas fechadas no mês
}

type PeriodPreset = 'hoje' | 'semana' | 'mes' | 'personalizado';

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

export default function DashboardClient({ metrics, userName, consultantId, aiInsights, salesToTop }: DashboardClientProps) {
    const { count: aiCount } = useAIAlerts();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [phrase, setPhrase] = useState(PHRASES[new Date().getDate() % PHRASES.length]);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [isLoadingLead, setIsLoadingLead] = useState(false);
    const [period, setPeriod] = useState<PeriodPreset>('mes');
    const [customDates, setCustomDates] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [currentMetrics, setCurrentMetrics] = useState<FinancialMetrics>(metrics);
    const [currentAIInsights, setCurrentAIInsights] = useState<AIInsight[]>(aiInsights);
    const [isSyncing, setIsSyncing] = useState(false);

    const fetchAIInsights = async (start?: string, end?: string) => {
        try {
            // Busca as sugestões da IA baseadas no contexto (Admin ou Consultor) dentro do período
            // Como as análises são salvas em tabelas específicas, buscamos as que foram geradas nesse intervalo
            const isAdmin = metrics.leadCount > 100; // Heurística simples ou prop role se disponível
            
            let query;
            if (isAdmin) {
                query = supabase
                    .from('intelligent_analysis_results')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (start) query = query.gte('created_at', start);
                if (end) query = query.lte('created_at', end);
            } else {
                query = supabase
                    .from('crm_daily_analysis')
                    .select('*')
                    .eq('consultor_id', consultantId)
                    .order('generated_at', { ascending: false });
                if (start) query = query.gte('generated_at', start);
                if (end) query = query.lte('generated_at', end);
            }

            const { data } = await query.limit(1).maybeSingle();

            if (data) {
                const actions = isAdmin ? data.recommended_actions : data.analysis_json?.recommended_actions;
                if (actions) {
                    const mapped = (actions as any[]).map(action => ({
                        title: action.title || action.task || 'Ação IA',
                        desc: action.description || action.reason || 'Análise disponível.',
                        time: period === 'hoje' ? 'Agora' : 'Filtro',
                        color: action.priority === 'high' ? 'red' : 'blue',
                        leadId: action.lead_id,
                        leadName: action.lead_name
                    }));
                    setCurrentAIInsights(mapped.slice(0, 3));
                    return;
                }
            }
            
            // Fallback se não encontrar análise no período
            setCurrentAIInsights(aiInsights);
        } catch (error) {
            console.error("Erro ao buscar AI Insights:", error);
        }
    };

    // Efeito para sincronizar métricas e IA quando o período muda
    useEffect(() => {
        const syncData = async () => {
            if (period === 'personalizado') return;
            
            setIsSyncing(true);
            try {
                const mappedPeriod = period === 'hoje' ? 'daily' : 'monthly';
                const newMetrics = await metricsService.getFinancialMetrics(
                    supabase as any,
                    consultantId,
                    mappedPeriod
                );
                setCurrentMetrics(newMetrics);
                
                // Buscar IA para o período preset
                await fetchAIInsights();
            } catch (error) {
                console.error("Erro ao sincronizar dados:", error);
            } finally {
                setIsSyncing(false);
            }
        };

        syncData();
    }, [period, consultantId]);

    const handleFilterCustom = async () => {
        if (period !== 'personalizado') return;
        
        setIsSyncing(true);
        try {
            const startStr = `${customDates.start}T00:00:00`;
            const endStr = `${customDates.end}T23:59:59`;
            
            const newMetrics = await metricsService.getFinancialMetrics(
                supabase as any,
                consultantId,
                'monthly',
                { start: startStr, end: endStr }
            );
            setCurrentMetrics(newMetrics);
            
            // Buscar IA para o range personalizado
            await fetchAIInsights(startStr, endStr);
        } catch (error) {
            console.error("Erro ao filtrar datas personalizadas:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    }, []);

    const handleOpenLead = async (leadId?: string, leadName?: string) => {
        if (!leadId && !leadName) return;
        setIsLoadingLead(true);
        try {
            // REGRA DE OURO: A IA às vezes resume o UUID (ex: '287' ou '199')
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const isUUID = leadId ? uuidRegex.test(leadId) : false;

            let leadData = null;

            // 1. TENTA BUSCA EXATA (UUID) - Prioridade Máxima
            if (isUUID && leadId) {
                const { data } = await supabase.from('leads_manos_crm').select('*').or(`id.eq.${leadId},lead_id.eq.${leadId}`).maybeSingle();
                leadData = data;
                if (!leadData) {
                    const { data: masterData } = await supabase.from('leads_master').select('*').eq('id', leadId).maybeSingle();
                    leadData = masterData;
                }
            }

            // 2. TENTA BUSCA RESILIENTE (NOME + FRAGMENTO) - Onde o erro Fabio vs Bruno ocorria
            if (!leadData) {
                // Buscamos via VIEW 'leads' que é unificada e já filtrada por consultor se disponível
                let query = supabase.from('leads').select('*');
                
                if (consultantId) {
                    query = query.eq('assigned_consultant_id', consultantId);
                }

                const { data: allLeads } = await query;
                
                if (allLeads) {
                    // PRIORIDADE 1: Match por ID exato (sempre prefira o exato)
                    leadData = allLeads.find(l => leadId && (
                        l.id === leadId || 
                        (l as any).lead_id === leadId
                    ));

                    // PRIORIDADE 2: Match por NOME (Âncora de segurança absoluta para Fabio vs Nathalya)
                    if (!leadData && leadName) {
                        const searchName = leadName.split(' ')[0].toLowerCase();
                        leadData = allLeads.find(l => l.name && l.name.toLowerCase().includes(searchName));
                    }

                    // PRIORIDADE 3: Match por fragmento de ID (Apenas se o nome falhar)
                    // SEGURANÇA: Só aceita se for o INÍCIO do ID (evita Nathalya e Natasha no meio do UUID)
                    if (!leadData && leadId && leadId.length >= 3) {
                        leadData = allLeads.find(l => 
                            l.id.toString().startsWith(leadId) ||
                            ((l as any).lead_id && (l as any).lead_id.toString().startsWith(leadId))
                        );
                    }
                }
            }
            
            if (leadData) {
                setSelectedLead(leadData as Lead);
            } else {
                console.warn("Lead não localizado:", { leadId, leadName });
            }
        } catch (error) {
            console.error("Erro ao abrir lead:", error);
        } finally {
            setIsLoadingLead(false);
        }
    };

    // Taxa de Conversão: (Vendas do Mês / Total de Leads do Mês) * 100
    // O backend já deve retornar o conversionRate calculado, mas aqui garantimos o arredondamento conforme prompt.
    const conversionDisplay = (currentMetrics.conversionRate || 0).toFixed(1) + '%';

    const metricStrip = [
        { label: 'Leads Ativos', value: currentMetrics.leadCount, icon: Users, color: 'blue' },
        { label: 'Vendas', value: currentMetrics.salesCount, icon: Target, color: 'red' },
        { label: 'Receita', value: `R$\u00a0${currentMetrics.totalRevenue.toLocaleString('pt-BR')}`, icon: TrendingUp, color: 'emerald' },
        {
            label: 'Conversão',
            value: conversionDisplay,
            icon: Zap,
            color: 'amber',
        },
    ];

    const shortcuts = [
        {
            label: 'Pipeline de Vendas',
            desc: 'Kanban do funil',
            icon: KanbanSquare,
            href: '/pipeline',
            badge: null,
            accent: 'red',
        },
        {
            label: 'Painel de Ações',
            desc: 'Cockpit IA',
            icon: Activity,
            href: '/pulse',
            badge: aiCount > 0 ? aiCount : null,
            accent: 'amber',
        },
        {
            label: 'Central de Leads',
            desc: 'Todos os contatos',
            icon: Users,
            href: '/leads',
            badge: null,
            accent: 'blue',
        },
        {
            label: 'Follow-ups IA',
            desc: 'Alertas pendentes',
            icon: Bot,
            href: '/pulse',
            badge: aiCount > 0 ? aiCount : null,
            accent: 'amber',
        },
        {
            label: 'Leads IA Hoje',
            desc: 'Score ≥ 70 ou Hot',
            icon: Brain,
            href: '/pipeline?filter=ai',
            badge: null,
            accent: 'purple',
        },
        {
            label: 'Risco de Churn',
            desc: 'Leads em risco',
            icon: AlertTriangle,
            href: '/pulse',
            badge: null,
            accent: 'orange',
        },
        {
            label: 'Nova Proposta',
            desc: 'Gerar financiamento',
            icon: FileText,
            href: '/leads',
            badge: null,
            accent: 'emerald',
        },
        {
            label: 'Agenda',
            desc: 'Agendamentos hoje',
            icon: CalendarCheck,
            href: '/pipeline?filter=scheduled',
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
                    <div className="flex flex-wrap items-center gap-3 p-1 bg-white/[0.03] border border-white/10 rounded-xl">
                        <div className="flex items-center gap-1">
                            {(['hoje', 'semana', 'mes', 'personalizado'] as PeriodPreset[]).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        period === p 
                                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
                                        : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                                    }`}
                                >
                                    {p === 'mes' ? 'Mês' : p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>

                        {period === 'personalizado' && (
                            <motion.div 
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-2 pr-2 border-l border-white/10 pl-3"
                            >
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="date" 
                                        value={customDates.start}
                                        onChange={(e) => setCustomDates({...customDates, start: e.target.value})}
                                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                    />
                                    <span className="text-[10px] text-white/20">até</span>
                                    <input 
                                        type="date" 
                                        value={customDates.end}
                                        onChange={(e) => setCustomDates({...customDates, end: e.target.value})}
                                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                    />
                                </div>
                                <button 
                                    onClick={handleFilterCustom}
                                    disabled={isSyncing}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-red-600 border border-white/10 hover:border-red-500 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    {isSyncing ? '...' : 'Filtrar'}
                                </button>
                            </motion.div>
                        )}
                    </div>
                </div>
            </header>

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

            <div className="w-full">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/25 flex items-center gap-2">
                        <Sparkles size={11} className="text-red-500" />
                        Sugestões da IA
                    </p>
                    <Link href="/pulse" className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 flex items-center gap-1">
                        Ver tudo <ArrowUpRight size={10} />
                    </Link>
                </div>
                <div className="space-y-2">
                    {currentAIInsights.map((insight, i) => (
                        <button
                            key={i}
                            onClick={() => handleOpenLead(insight.leadId, insight.leadName)}
                            className={`w-full flex items-start text-left gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-red-500/30 hover:bg-white/[0.04] transition-all group disabled:opacity-50`}
                            disabled={isLoadingLead}
                        >
                            <ShieldCheck size={14} className={`text-${insight.color}-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform`} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[12px] font-bold text-white truncate group-hover:text-red-400 transition-colors">{insight.title}</span>
                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-${insight.color}-500/10 text-${insight.color}-400 shrink-0`}>
                                        {insight.time}
                                    </span>
                                    {insight.leadId && (
                                        <ArrowUpRight size={10} className="text-white/20 group-hover:text-red-500 ml-auto" />
                                    )}
                                </div>
                                <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{insight.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>

                {selectedLead && (
                    <LeadProfileModalV2 
                        lead={selectedLead}
                        userName={userName}
                        onClose={() => setSelectedLead(null)}
                        setLeads={setLeads}
                        isManagement={false}
                    />
                )}
            </div>
        </div>
    );
}
