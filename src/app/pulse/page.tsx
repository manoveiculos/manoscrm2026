'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Calendar,
    ArrowUpRight,
    Zap,
    Flame,
    Target,
    TrendingUp,
    AlertCircle,
    ChevronRight,
    Phone,
    Globe,
    MessageCircle,
    AlertTriangle,
    Users,
    X,
    Bot,
    CheckCircle,
    XCircle,
} from 'lucide-react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { normalizeStatus } from '@/constants/status';
import { Lead, FinancialMetrics } from '@/lib/types';
import { getFinancialMetrics } from '@/lib/services/analyticsService';
import { leadService } from '@/lib/leadService';
import { supabase } from '@/lib/supabase';
import { calculateLeadScore } from '@/utils/calculateScore';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';

// Components
import { DailyMissionHeader } from './components/DailyMissionHeader';
import { AIOpportunityCard } from './components/AIOpportunityCard';
import { LeadProfileModalV2 } from '../components/lead-profile/LeadProfileModalV2';

// Source logo helpers
function getSourceIcon(source?: string | null): { icon: React.ElementType; color: string; bg: string } {
    const s = (source || '').toLowerCase();
    if (s.includes('facebook') || s.includes('meta') || s.includes('fb'))
        return { icon: () => (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
            </svg>
        ), color: '#1877f2', bg: 'rgba(24,119,242,0.12)' };
    if (s.includes('instagram') || s.includes('ig'))
        return { icon: () => (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
        ), color: '#e1306c', bg: 'rgba(225,48,108,0.12)' };
    if (s.includes('whatsapp') || s.includes('wpp') || s.includes('zap'))
        return { icon: MessageCircle, color: '#25d366', bg: 'rgba(37,211,102,0.12)' };
    if (s.includes('google'))
        return { icon: () => (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
        ), color: '#ea4335', bg: 'rgba(234,67,53,0.12)' };
    return { icon: Globe, color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)' };
}

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
};

const stagger: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

function SectionTitle({ icon: Icon, label, count, accent = '#ef4444' }: {
    icon: React.ElementType; label: string; count?: number; accent?: string;
}) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: `${accent}15`, color: accent }}>
                    <Icon size={11} />
                </div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">{label}</h2>
            </div>
            {count !== undefined && (
                <div className="flex items-center gap-2">
                    <div className="h-px flex-1 w-8" style={{ background: `linear-gradient(90deg, ${accent}40, transparent)` }} />
                    <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-full"
                        style={{ color: accent, backgroundColor: `${accent}15` }}>
                        {count}
                    </span>
                </div>
            )}
        </div>
    );
}

export default function Pulse() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');
    const [userRole, setUserRole] = useState<'admin' | 'consultant'>('consultant');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    // ── Redistribuição ────────────────────────────────────────────────────────
    type RedistSuggestion = {
        leadsToMove: Array<{ id: string; name: string }>;
        target: { id: string; name: string; currentLoad: number };
    };
    const [redistOpen, setRedistOpen] = useState<string | null>(null);       // consultantId aberto
    const [redistSuggestions, setRedistSuggestions] = useState<Record<string, RedistSuggestion>>({});
    const [redistLoading, setRedistLoading] = useState<string | null>(null); // consultantId carregando
    const [redistDone, setRedistDone]       = useState<string | null>(null); // consultantId concluído

    const fetchRedistSuggestion = async (consultantId: string) => {
        setRedistLoading(consultantId);
        try {
            // 1. Consultores ativos + carga atual (usa leads já carregados)
            const loadMap: Record<string, number> = {};
            leads.forEach(l => {
                if (l.assigned_consultant_id) {
                    loadMap[l.assigned_consultant_id] = (loadMap[l.assigned_consultant_id] || 0) + 1;
                }
            });

            // 2. Busca todos os consultores ativos para resolver nomes
            const { data: allConsultants } = await supabase
                .from('consultants_manos_crm')
                .select('id, name')
                .eq('is_active', true);

            // 3. Consultor com menor carga (excluindo o sobrecarregado)
            const target = (allConsultants || [])
                .filter((c: any) => c.id !== consultantId)
                .sort((a: any, b: any) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0))[0];

            if (!target) return;

            // 4. Leads não contactados do consultor sobrecarregado (até 5)
            const toMove = leads
                .filter(l =>
                    l.assigned_consultant_id === consultantId &&
                    ['received', 'new', 'entrada'].includes(normalizeStatus(l.status))
                )
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .slice(0, 5)
                .map(l => ({ id: l.id, name: l.name || 'Lead sem nome' }));

            setRedistSuggestions(prev => ({
                ...prev,
                [consultantId]: {
                    leadsToMove: toMove,
                    target: { id: target.id, name: target.name, currentLoad: loadMap[target.id] || 0 },
                },
            }));
        } finally {
            setRedistLoading(null);
        }
    };

    const confirmRedistribution = async (consultantId: string) => {
        const suggestion = redistSuggestions[consultantId];
        if (!suggestion || suggestion.leadsToMove.length === 0) return;

        setRedistLoading(consultantId);
        try {
            const ids = suggestion.leadsToMove.map(l => l.id);
            await supabase
                .from('leads_manos_crm')
                .update({ assigned_consultant_id: suggestion.target.id })
                .in('id', ids);

            // Atualiza a lista local
            setLeads(prev => prev.map(l =>
                ids.includes(l.id) ? { ...l, assigned_consultant_id: suggestion.target.id } : l
            ));
            setRedistDone(consultantId);
            setRedistOpen(null);
        } finally {
            setRedistLoading(null);
        }
    };

    const [aiMetrics, setAiMetrics] = useState<{
        autoTotal: number;
        autoSent: number;
        autoDismissed: number;
        alertCompra: number;
    } | null>(null);
    const [overloadAlerts, setOverloadAlerts] = useState<Array<{
        id: string;
        consultantId: string;
        consultantName: string;
        leadCount: number;
    }>>([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            const { data: consultant } = await supabase
                .from('consultants_manos_crm')
                .select('id, name, role')
                .eq('auth_id', session.user.id)
                .single();

            if (consultant) {
                setUserName(consultant.name.split(' ')[0]);
                setUserRole(consultant.role === 'admin' ? 'admin' : 'consultant');

                const isAdmin = consultant.role === 'admin';
                const [leadsResult, metricsResult] = await Promise.all([
                    leadService.getLeadsPaginated(undefined, {
                        consultantId: isAdmin ? undefined : consultant.id,
                        limit: 300
                    }),
                    getFinancialMetrics({
                        period: 'this_month',
                        consultantId: isAdmin ? undefined : consultant.id
                    }),
                ]);

                setLeads(leadsResult.leads || []);
                setMetrics(metricsResult as FinancialMetrics);

                // Alertas de sobrecarga — só para admin
                if (isAdmin) {
                    const { data: overloads } = await supabase
                        .from('follow_ups')
                        .select('id, metadata')
                        .eq('user_id', 'admin')
                        .eq('type', 'admin_overload')
                        .eq('status', 'pending')
                        .order('created_at', { ascending: false });

                    if (overloads?.length) {
                        // Resolve nomes dos consultores em lote
                        const cids = [...new Set(overloads.map((o: any) => {
                            try { return JSON.parse(o.metadata)?.consultant_id; } catch { return null; }
                        }).filter(Boolean))] as string[];

                        const { data: consultants } = await supabase
                            .from('consultants_manos_crm')
                            .select('id, name')
                            .in('id', cids);

                        const nameMap = Object.fromEntries((consultants || []).map((c: any) => [c.id, c.name]));

                        setOverloadAlerts(overloads.map((o: any) => {
                            let meta: any = {};
                            try { meta = JSON.parse(o.metadata); } catch { /* noop */ }
                            return {
                                id: o.id,
                                consultantId: meta.consultant_id || '',
                                consultantName: nameMap[meta.consultant_id] || meta.consultant_id || 'Consultor',
                                leadCount: meta.lead_count || 0,
                            };
                        }));
                    } else {
                        setOverloadAlerts([]);
                    }

                    // Métricas de performance IA — últimos 7 dias
                    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
                    const [autoRes, compraRes] = await Promise.all([
                        supabase
                            .from('follow_ups')
                            .select('id, status, result')
                            .eq('type', 'ai_auto')
                            .gte('created_at', weekAgo),
                        supabase
                            .from('follow_ups')
                            .select('id', { count: 'exact', head: true })
                            .eq('type', 'ai_alert_compra')
                            .gte('created_at', weekAgo),
                    ]);

                    const autoList = autoRes.data || [];
                    setAiMetrics({
                        autoTotal:     autoList.length,
                        autoSent:      autoList.filter((f: any) => f.status === 'completed' && f.result !== 'negative').length,
                        autoDismissed: autoList.filter((f: any) => f.result === 'negative').length,
                        alertCompra:   compraRes.count || 0,
                    });
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        
        // Listeners para atualizações em tempo real vindo do modal ou outros componentes
        const handleUpdate = () => loadData();
        window.addEventListener('lead-updated', handleUpdate);
        window.addEventListener('update-lead-status', handleUpdate);
        window.addEventListener('update-lead-timeline', handleUpdate);

        return () => {
            window.removeEventListener('lead-updated', handleUpdate);
            window.removeEventListener('update-lead-status', handleUpdate);
            window.removeEventListener('update-lead-timeline', handleUpdate);
        };
    }, [loadData]);

    const leadsWithScores = useMemo(() => {
        const now = new Date();
        return leads.map(l => {
            // Prioridade: ai_score real do banco; fallback para heurístico local
            const aiScore = Number(l.ai_score);
            const score = aiScore > 0 ? aiScore : (() => {
                const tempoFunilH = Math.max(0, (now.getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60));
                return calculateLeadScore({
                    status: normalizeStatus(l.status),
                    tempoFunilHoras: tempoFunilH,
                    totalInteracoes: 0,
                    ultimaInteracaoH: tempoFunilH,
                    temValorDefinido: !!l.valor_investimento && l.valor_investimento !== '0',
                    temVeiculoInteresse: !!l.vehicle_interest && l.vehicle_interest !== '---'
                });
            })();
            return { ...l, tactical_score: score };
        });
    }, [leads]);

    // ── Lead buckets ───────────────────────────────────────────
    const uncontacted = useMemo(() =>
        leadsWithScores
            .filter(l => ['received', 'new', 'entrada'].includes(normalizeStatus(l.status)))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 8),
        [leadsWithScores]
    );

    const orphanedLeads = useMemo(() => 
        leads.filter(l => !l.assigned_consultant_id),
        [leads]
    );

    const closingLeads = useMemo(() =>
        leadsWithScores
            .filter(l => l.tactical_score >= 80 && l.tactical_score < 100)
            .sort((a, b) => b.tactical_score - a.tactical_score)
            .slice(0, 5),
        [leadsWithScores]
    );

    const scheduledLeads = useMemo(() =>
        leads.filter(l => 
            ['scheduled', 'fechamento'].includes(normalizeStatus(l.status)) || 
            (l.scheduled_at && new Date(l.scheduled_at) >= new Date())
        ),
        [leads]
    );

    const churnRiskLeads = useMemo(() =>
        leadsWithScores
            .filter(l => Number((l as any).churn_probability) > 70)
            .sort((a, b) => Number((b as any).churn_probability) - Number((a as any).churn_probability))
            .slice(0, 5),
        [leadsWithScores]
    );

    const topLead = closingLeads[0];

    if (loading) {
        return (
            <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="h-14 w-14 border-[3px] border-red-500 border-t-transparent rounded-full"
                    style={{ boxShadow: '0 0 25px rgba(239,68,68,0.4)' }}
                />
                <motion.p
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                    className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]"
                >
                    Carregando missão...
                </motion.p>
            </div>
        );
    }

    return (
        <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="w-full space-y-6 pb-24 pt-0 px-2 md:px-0"
        >
            {/* ── HUD HEADER ──────────────────────────────── */}
            <header className="border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 px-6 py-3 -mx-2 md:-mx-0 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                {/* Left: identity + stats */}
                <div className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2.5">
                            <Zap size={14} className="text-red-500" />
                            <h1 className="text-xs font-black uppercase tracking-[0.3em] text-white/95 whitespace-nowrap">
                                Painel <span className="text-red-500">de Elite</span>
                            </h1>
                        </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-4 pl-4 border-l border-white/10 ml-2">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-black text-white/80 tabular-nums">{leads.length}</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-none">PIPELINE</span>
                        </div>
                        <div className="w-px h-3 bg-white/10" />
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-black text-emerald-400 tabular-nums">{metrics?.salesCount || 0}</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-none">VENDAS</span>
                        </div>
                    </div>
                </div>

                {/* Right: Status */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-600/10 border border-red-500/20">
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">LIVE OPS</span>
                    </div>
                </div>
            </header>
            {/* ── DAILY MISSION HEADER ─────────────────────────── */}
            <DailyMissionHeader
                userName={userName}
                salesCount={metrics?.salesCount || 0}
                leadCount={leads.length}
                avgResponseTime={metrics?.avgResponseTime}
                responseRate={metrics?.responseRate}
                userRole={userRole}
            />

            {/* ── CRITICAL ALERTS (ADMIN ONLY) ────────────────── */}
            {userRole === 'admin' && orphanedLeads.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mx-2 md:mx-0 p-4 rounded-2xl bg-red-950/20 border border-red-500/20 flex items-center justify-between gap-4 group"
                >
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                            <AlertCircle size={20} className="animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-[11px] font-black text-red-500 uppercase tracking-widest">Alerta de Leads Órfãos</h3>
                            <p className="text-[13px] text-white/60 font-medium">Existem <span className="text-white font-bold">{orphanedLeads.length}</span> leads sem vendedor atribuído.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => window.location.href = '/leads?consultant=none'}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_4px_15px_rgba(239,68,68,0.3)]"
                    >
                        Resolver Agora
                    </button>
                </motion.div>
            )}

            {/* ── OVERLOAD ALERTS (ADMIN ONLY) ─────────────────── */}
            {userRole === 'admin' && overloadAlerts.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mx-2 md:mx-0 rounded-2xl border border-orange-500/20 bg-orange-950/10 overflow-hidden"
                >
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-orange-500/10"
                        style={{ background: 'linear-gradient(90deg, rgba(249,115,22,0.07), transparent)' }}>
                        <Users size={14} className="text-orange-400" />
                        <h3 className="text-[11px] font-black text-orange-400 uppercase tracking-widest flex-1">
                            Consultores Sobrecarregados — {overloadAlerts.length} alerta{overloadAlerts.length > 1 ? 's' : ''}
                        </h3>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                        {overloadAlerts.map((alert) => {
                            const suggestion  = redistSuggestions[alert.consultantId];
                            const isOpen      = redistOpen === alert.consultantId;
                            const isLoading   = redistLoading === alert.consultantId;
                            const isDone      = redistDone === alert.consultantId;
                            return (
                                <div key={alert.id}>
                                    {/* ── Linha principal ── */}
                                    <div className="flex items-center gap-4 px-4 py-3">
                                        <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-black text-sm shrink-0">
                                            {alert.consultantName[0]?.toUpperCase() || 'C'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-bold text-white/90 truncate">{alert.consultantName}</p>
                                            <p className="text-[11px] text-orange-400/70">
                                                <span className="font-black">{alert.leadCount}</span> leads ativos
                                                {isDone && <span className="text-emerald-400 ml-2 font-black">✓ Redistribuído</span>}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {!isDone && (
                                                <button
                                                    onClick={() => {
                                                        if (isOpen) { setRedistOpen(null); return; }
                                                        setRedistOpen(alert.consultantId);
                                                        if (!suggestion) fetchRedistSuggestion(alert.consultantId);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                                                >
                                                    {isLoading ? (
                                                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} className="inline-block">↻</motion.span>
                                                    ) : isOpen ? '▲ Fechar' : '⇄ Redistribuir'}
                                                </button>
                                            )}
                                            <a href={`/v2/leads?consultant=${alert.consultantId}`}
                                                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-white/40 text-[10px] font-black uppercase tracking-widest transition-all">
                                                Leads
                                            </a>
                                            <button
                                                onClick={async () => {
                                                    await supabase.from('follow_ups')
                                                        .update({ status: 'completed', completed_at: new Date().toISOString() })
                                                        .eq('id', alert.id);
                                                    setOverloadAlerts(prev => prev.filter(a => a.id !== alert.id));
                                                }}
                                                className="h-7 w-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/25 hover:text-white/50 transition-all"
                                                title="Dispensar alerta"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Painel de redistribuição ── */}
                                    <AnimatePresence>
                                    {isOpen && suggestion && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="px-4 pb-4 border-t border-orange-500/10"
                                            style={{ background: 'linear-gradient(180deg, rgba(249,115,22,0.04), transparent)' }}
                                        >
                                            <div className="pt-3 space-y-3">
                                                {suggestion.leadsToMove.length === 0 ? (
                                                    <p className="text-[11px] text-white/30 italic">Nenhum lead não-contactado para redistribuir.</p>
                                                ) : (
                                                    <>
                                                        <p className="text-[11px] text-white/50">
                                                            Sugestão: mover <span className="font-black text-white/80">{suggestion.leadsToMove.length} lead{suggestion.leadsToMove.length > 1 ? 's' : ''} não contactado{suggestion.leadsToMove.length > 1 ? 's' : ''}</span> para{' '}
                                                            <span className="font-black text-orange-300">{suggestion.target.name}</span>{' '}
                                                            <span className="text-white/30">({suggestion.target.currentLoad} leads ativos)</span>
                                                        </p>
                                                        <div className="space-y-1">
                                                            {suggestion.leadsToMove.map(l => (
                                                                <div key={l.id} className="flex items-center gap-2 text-[11px] text-white/40">
                                                                    <span className="h-1 w-1 rounded-full bg-orange-400/50 shrink-0" />
                                                                    {l.name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <button
                                                            onClick={() => confirmRedistribution(alert.consultantId)}
                                                            disabled={isLoading}
                                                            className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
                                                        >
                                                            {isLoading ? 'Redistribuindo...' : `Confirmar redistribuição`}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* ── MAIN GRID ────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ── LEFT COLUMN (main content) ─────────────────── */}
                <div className="lg:col-span-8 space-y-6">

                    {/* LEADS AGUARDANDO CONTATO */}
                    {uncontacted.length > 0 && (
                        <motion.section variants={fadeUp} className="space-y-1">
                            <SectionTitle
                                icon={Zap}
                                label="Aguardando Contato"
                                count={uncontacted.length}
                                accent="#f97316"
                            />

                            <div className="rounded-2xl border border-orange-500/10 bg-[#0d0d10] overflow-hidden">
                                {/* Alert banner */}
                                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-orange-500/10"
                                    style={{ background: 'linear-gradient(90deg, rgba(249,115,22,0.08), transparent)' }}>
                                    <motion.div
                                        animate={{ opacity: [1, 0.4, 1] }}
                                        transition={{ repeat: Infinity, duration: 1.5 }}
                                    >
                                        <AlertCircle size={13} className="text-orange-500" />
                                    </motion.div>
                                    <p className="text-[10px] font-black text-orange-400/80 uppercase tracking-widest">
                                        {uncontacted.length} leads sem contato inicial — Responda agora para 9× mais conversão
                                    </p>
                                </div>

                                <div className="divide-y divide-white/[0.04]">
                                    {uncontacted.map((lead, i) => {
                                        const hoursAgo = Math.round((Date.now() - new Date(lead.created_at).getTime()) / 3600000);
                                        const isNew = hoursAgo < 2;
                                        return (
                                            <motion.div
                                                key={lead.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                onClick={() => setSelectedLead(lead)}
                                                className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.03] cursor-pointer group transition-colors"
                                            >
                                                {/* Rank */}
                                                <span className="text-[10px] font-black text-white/15 w-4 shrink-0">{i + 1}</span>

                                                {/* Avatar */}
                                                <div className="relative shrink-0">
                                                    <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black border"
                                                        style={{
                                                            backgroundColor: isNew ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.05)',
                                                            color: isNew ? '#f97316' : 'rgba(255,255,255,0.5)',
                                                            borderColor: isNew ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.07)',
                                                        }}>
                                                        {(lead.name?.[0] || 'U').toUpperCase()}
                                                    </div>
                                                    {/* Source icon badge */}
                                                    {(() => {
                                                        const src = getSourceIcon(lead.source || lead.origem);
                                                        const IconComp = src.icon;
                                                        return (
                                                            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center border border-[#0d0d10]"
                                                                style={{ backgroundColor: src.bg, color: src.color }}>
                                                                <IconComp />
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-bold text-white/90 truncate">
                                                            {(lead.name || 'Novo Lead').split(' ').slice(0, 2).join(' ')}
                                                        </p>
                                                        {isNew && (
                                                            <motion.span
                                                                animate={{ opacity: [1, 0.5, 1] }}
                                                                transition={{ repeat: Infinity, duration: 1.2 }}
                                                                className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-widest shrink-0"
                                                            >
                                                                NOVO
                                                            </motion.span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-white/30 truncate">
                                                        {lead.vehicle_interest || formatPhoneBR(lead.phone)}
                                                    </p>
                                                </div>

                                                {/* Time + score */}
                                                <div className="text-right shrink-0 hidden sm:block">
                                                    <p className="text-[10px] font-black text-white/25">
                                                        {hoursAgo < 1
                                                            ? `${Math.round(hoursAgo * 60)}min`
                                                            : hoursAgo < 24
                                                                ? `${hoursAgo}h`
                                                                : `${Math.round(hoursAgo / 24)}d`}
                                                    </p>
                                                    {(lead.ai_score || 0) > 0 && (
                                                        <p className="text-[9px] font-black text-white/20">
                                                            IA {lead.ai_score}%
                                                        </p>
                                                    )}
                                                </div>

                                                <ChevronRight size={13} className="text-white/15 group-hover:text-white/40 shrink-0 transition-colors" />
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.section>
                    )}

                    {/* ── RISCO DE CHURN ───────────────────────────── */}
                    {churnRiskLeads.length > 0 && (
                        <motion.section variants={fadeUp} className="space-y-1">
                            <SectionTitle
                                icon={AlertTriangle}
                                label="Risco de Abandono"
                                count={churnRiskLeads.length}
                                accent="#f59e0b"
                            />
                            <div className="rounded-2xl border border-amber-500/15 bg-[#0d0d10] overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-amber-500/10"
                                    style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.07), transparent)' }}>
                                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                                        <AlertTriangle size={12} className="text-amber-500" />
                                    </motion.div>
                                    <p className="text-[10px] font-black text-amber-400/70 uppercase tracking-widest">
                                        Leads inativos com alto risco de abandono — Reative agora
                                    </p>
                                </div>
                                <div className="divide-y divide-white/[0.04]">
                                    {churnRiskLeads.map((lead, i) => {
                                        const churn = Number((lead as any).churn_probability);
                                        const hoursInactive = Math.round((Date.now() - new Date(lead.updated_at).getTime()) / 3_600_000);
                                        return (
                                            <motion.div
                                                key={lead.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                onClick={() => setSelectedLead(lead)}
                                                className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.03] cursor-pointer group transition-colors"
                                            >
                                                <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black border shrink-0"
                                                    style={{ backgroundColor: 'rgba(245,158,11,0.08)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.2)' }}>
                                                    {(lead.name?.[0] || 'U').toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-semibold text-white/80 truncate">{lead.name}</p>
                                                    <p className="text-[10px] text-white/30 truncate">{lead.vehicle_interest || 'Sem interesse'}</p>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-black text-amber-400">{churn}%</p>
                                                        <p className="text-[9px] text-white/20">{hoursInactive}h inativo</p>
                                                    </div>
                                                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-amber-500/10 border border-amber-500/15">
                                                        <AlertTriangle size={11} className="text-amber-400" />
                                                    </div>
                                                    <ChevronRight size={13} className="text-white/15 group-hover:text-white/40 transition-colors" />
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.section>
                    )}

                    {/* MISSÃO DE ELITE — top lead card */}
                    {topLead && (
                        <motion.section variants={fadeUp} className="space-y-1">
                            <SectionTitle
                                icon={Flame}
                                label="Missão de Elite"
                                count={closingLeads.length}
                                accent="#ef4444"
                            />

                            <AIOpportunityCard
                                lead={topLead}
                                onAction={(l) => setSelectedLead(l)}
                                userName={userName}
                                isFeatured
                            />

                            {/* Secondary closing leads */}
                            {closingLeads.length > 1 && (
                                <div className="space-y-2 pt-2">
                                    {closingLeads.slice(1).map(lead => (
                                        <AIOpportunityCard
                                            key={lead.id}
                                            lead={lead}
                                            onAction={(l) => setSelectedLead(l)}
                                            userName={userName}
                                        />
                                    ))}
                                </div>
                            )}
                        </motion.section>
                    )}

                    {/* Empty state */}
                    {uncontacted.length === 0 && !topLead && (
                        <motion.div
                            variants={fadeUp}
                            className="flex flex-col items-center justify-center py-16 text-center"
                        >
                            <div className="h-16 w-16 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
                                <Target size={28} className="text-white/10" />
                            </div>
                            <p className="text-white/20 font-bold text-sm">Pipeline limpo.</p>
                            <p className="text-white/10 text-xs mt-1">Novos leads aparecerão aqui assim que chegarem.</p>
                        </motion.div>
                    )}
                </div>

                {/* ── RIGHT SIDEBAR ──────────────────────────────── */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="sticky top-6 space-y-6">

                        {/* EM FECHAMENTO */}
                        <motion.div variants={fadeUp}
                            className="rounded-2xl border border-red-500/10 bg-[#0d0d10] overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]"
                                style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.06), transparent)' }}>
                                <div className="flex items-center gap-2">
                                    <Flame size={13} className="text-red-500" />
                                    <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em]">Em Fechamento</h3>
                                </div>
                                <span className="text-[9px] font-black text-red-500/60 uppercase tracking-widest">Alta Intensidade</span>
                            </div>

                            <div className="p-3 space-y-1">
                                {closingLeads.slice(0, 5).map((lead, i) => (
                                    <motion.div
                                        key={lead.id}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.06 }}
                                        onClick={() => setSelectedLead(lead)}
                                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.04] cursor-pointer group transition-all"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-7 w-7 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-black flex items-center justify-center border border-red-500/15 shrink-0">
                                                {(lead.name?.[0] || 'U').toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-bold text-white/90 truncate group-hover:text-red-400 transition-colors">
                                                    {(lead.name || 'LEAD').split(' ')[0].toUpperCase()}
                                                </p>
                                                <p className="text-[10px] text-white/20 uppercase truncate max-w-[110px]">
                                                    {lead.vehicle_interest || 'Geral'}
                                                </p>
                                            </div>
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 transition-all shrink-0"
                                        >
                                            <ArrowUpRight size={13} className="text-red-500/60 group-hover:text-red-400" />
                                        </motion.button>
                                    </motion.div>
                                ))}
                                {closingLeads.length === 0 && (
                                    <p className="text-[11px] text-white/10 text-center py-8 italic">
                                        Radar limpo por enquanto.
                                    </p>
                                )}
                            </div>
                        </motion.div>

                        {/* AGENDAS */}
                        <motion.div variants={fadeUp}
                            className="rounded-2xl border border-white/[0.06] bg-[#0d0d10] overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                                <div className="flex items-center gap-2">
                                    <Calendar size={13} className="text-amber-500/70" />
                                    <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em]">Agendas</h3>
                                </div>
                                <span className="text-xl font-black text-white tabular-nums">{scheduledLeads.length}</span>
                            </div>

                            <div className="p-3 space-y-1">
                                {scheduledLeads.slice(0, 4).map((lead, i) => (
                                    <motion.div
                                        key={lead.id}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.07 }}
                                        onClick={() => setSelectedLead(lead)}
                                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.04] cursor-pointer group transition-all"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-400 text-[11px] font-black flex items-center justify-center border border-amber-500/15 shrink-0">
                                                {lead.name[0].toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-bold text-white/90 truncate">
                                                    {lead.name.split(' ')[0].toUpperCase()}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                    <p className="text-[9px] text-amber-500/70 font-black uppercase tracking-widest">
                                                        {lead.scheduled_at
                                                            ? new Date(lead.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                                                            : 'Pendente'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/15 transition-all shrink-0"
                                        >
                                            <ArrowUpRight size={13} className="text-amber-500/50 group-hover:text-amber-400" />
                                        </button>
                                    </motion.div>
                                ))}
                                {scheduledLeads.length === 0 && (
                                    <p className="text-[11px] text-white/10 text-center py-8 italic">
                                        Sem agendas marcadas.
                                    </p>
                                )}
                            </div>
                        </motion.div>

                        {/* FLUXO RÁPIDO — mini stats */}
                        <motion.div variants={fadeUp}
                            className="grid grid-cols-2 gap-3"
                        >
                            {[
                                {
                                    label: 'Sem Contato',
                                    value: uncontacted.length,
                                    icon: Phone,
                                    color: '#f97316',
                                    sublabel: 'Aguardando',
                                },
                                {
                                    label: 'Fechamento',
                                    value: closingLeads.length,
                                    icon: TrendingUp,
                                    color: '#ef4444',
                                    sublabel: 'Oportunidades',
                                },
                            ].map((stat) => (
                                <div key={stat.label}
                                    className="p-4 rounded-2xl border bg-[#0d0d10] relative overflow-hidden"
                                    style={{ borderColor: `${stat.color}15` }}
                                >
                                    <div className="absolute top-0 right-0 w-12 h-12 blur-[20px] -mr-4 -mt-4 pointer-events-none rounded-full"
                                        style={{ backgroundColor: `${stat.color}20` }} />
                                    <div className="h-7 w-7 rounded-xl flex items-center justify-center mb-3"
                                        style={{ backgroundColor: `${stat.color}12`, color: stat.color }}>
                                        <stat.icon size={13} />
                                    </div>
                                    <p className="text-2xl font-black text-white tabular-nums leading-none"
                                        style={{ textShadow: `0 0 15px ${stat.color}40` }}>
                                        {stat.value}
                                    </p>
                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mt-1">{stat.sublabel}</p>
                                    <p className="text-[8px] text-white/15 uppercase tracking-widest">{stat.label}</p>
                                </div>
                            ))}
                        </motion.div>

                        {/* ── IA PERFORMANCE (ADMIN ONLY) ────────────── */}
                        {userRole === 'admin' && aiMetrics && (
                            <motion.div variants={fadeUp}
                                className="rounded-2xl border border-purple-500/15 bg-[#0d0d10] overflow-hidden"
                            >
                                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]"
                                    style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.06), transparent)' }}>
                                    <Bot size={13} className="text-purple-400" />
                                    <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em]">IA — Últimos 7 dias</h3>
                                </div>
                                <div className="p-4 space-y-3">
                                    {/* Follow-ups automáticos */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] text-white/40 uppercase tracking-widest">Follow-ups IA</span>
                                            <span className="text-[11px] font-black text-white/60">{aiMetrics.autoTotal} gerados</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-emerald-500"
                                                    style={{ width: aiMetrics.autoTotal > 0 ? `${Math.round(aiMetrics.autoSent / aiMetrics.autoTotal * 100)}%` : '0%' }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-black text-emerald-400 w-8 text-right tabular-nums">
                                                {aiMetrics.autoTotal > 0 ? Math.round(aiMetrics.autoSent / aiMetrics.autoTotal * 100) : 0}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-2">
                                            <div className="flex items-center gap-1">
                                                <CheckCircle size={10} className="text-emerald-400" />
                                                <span className="text-[10px] text-white/30">{aiMetrics.autoSent} enviados</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <XCircle size={10} className="text-red-400/60" />
                                                <span className="text-[10px] text-white/30">{aiMetrics.autoDismissed} dispensados</span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Divisor */}
                                    <div className="h-px bg-white/[0.05]" />
                                    {/* Alertas de compra */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Zap size={11} className="text-amber-400" />
                                            <span className="text-[10px] text-white/40 uppercase tracking-widest">Alertas de compra</span>
                                        </div>
                                        <span className="text-lg font-black text-amber-400 tabular-nums">{aiMetrics.alertCompra}</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                    </div>
                </div>
            </div>

            {/* Lead profile modal */}
            {selectedLead && (
                <LeadProfileModalV2
                    lead={selectedLead}
                    onClose={() => setSelectedLead(null)}
                    setLeads={setLeads}
                    userName={userName}
                />
            )}
        </motion.div>
    );
}
