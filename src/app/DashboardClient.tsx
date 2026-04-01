'use client';

import React, { useState, useEffect } from 'react';
import {
    Users,
    Bot,
    Target,
    Zap,
    ArrowUpRight,
    Sparkles,
    CheckCircle,
    Clock,
    ChevronRight,
    User,
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
import { SniperPanel } from '@/components/v2/SniperPanel';

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
    const [period] = useState<PeriodPreset>('mes');
    const [currentMetrics, setCurrentMetrics] = useState<FinancialMetrics>(metrics);
    const currentAIInsights = aiInsights;
    const [isSyncing, setIsSyncing] = useState(false);

    // Efeito para sincronizar métricas quando o período muda
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
            } catch (error) {
                console.error("Erro ao sincronizar dados:", error);
            } finally {
                setIsSyncing(false);
            }
        };

        syncData();
    }, [period, consultantId]);


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

    const avgResponseMin = currentMetrics.avgResponseTime || 0;
    const responseDisplay = avgResponseMin > 0 ? `${avgResponseMin}min` : '—';

    const metricStrip = [
        { label: 'Leads no Mês', value: currentMetrics.leadCount, icon: Users, color: 'blue' },
        { label: 'Vendas no Mês', value: currentMetrics.salesCount, icon: Target, color: 'red' },
        { label: 'Conversão', value: conversionDisplay, icon: Zap, color: 'amber' },
        { label: 'Resp. Média', value: responseDisplay, icon: Clock, color: 'emerald' },
    ];


    return (
        <div className="w-full space-y-8 pb-24 pt-0 px-2 md:px-8 flex flex-col items-start">
            <header className="w-full flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Sistema Operacional
                        </span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                        {getGreeting()}, <span className="text-red-500">{userName}</span>
                    </h1>
                    <p className="text-sm text-white/35 italic">&ldquo;{phrase}&rdquo;</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {salesToTop > 0 ? (
                        <span className="text-[11px] text-white/40 font-semibold hidden md:block">
                            Faltam <span className="text-white font-black">5</span> vendas para o topo
                        </span>
                    ) : (
                        <span className="text-[11px] text-emerald-400 font-black hidden md:flex items-center gap-1">
                            <CheckCircle size={12} /> Você lidera o ranking!
                        </span>
                    )}
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

            {/* ── SNIPER PANEL — Ação direta sobre leads prioritários ── */}
            <SniperPanel
                consultantId={consultantId}
                onOpenLead={(lead) => setSelectedLead(lead)}
                salesCount={currentMetrics.salesCount}
                isAdmin={currentMetrics.leadCount > 100}
            />

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
                        <div
                            key={i}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-red-500/20 transition-all group"
                        >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-${insight.color}-500/10 border border-${insight.color}-500/20`}>
                                <User size={14} className={`text-${insight.color}-400`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    {insight.leadName && (
                                        <span className="text-[12px] font-black text-white truncate">{insight.leadName}</span>
                                    )}
                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-${insight.color}-500/10 text-${insight.color}-400 shrink-0`}>
                                        {insight.time}
                                    </span>
                                </div>
                                <p className="text-[11px] text-white/50 font-semibold truncate">{insight.title}</p>
                                <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed line-clamp-1">{insight.desc}</p>
                            </div>
                            {(insight.leadId || insight.leadName) && (
                                <button
                                    onClick={() => handleOpenLead(insight.leadId, insight.leadName)}
                                    disabled={isLoadingLead}
                                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider hover:bg-red-500/20 hover:border-red-500/40 transition-all disabled:opacity-50"
                                >
                                    Abrir <ChevronRight size={10} />
                                </button>
                            )}
                        </div>
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
