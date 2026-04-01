'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    BarChart3,
    Users,
    Target,
    TrendingUp,
    Zap,
    Clock,
    Activity,
    DollarSign,
    Phone,
    Eye,
    CheckCircle2,
    XCircle,
    Car,
    Facebook,
    Instagram,
    Globe,
    MessageCircle,
    Calendar,
    Sparkles,
    Medal,
    UserCheck,
    ChevronUp,
    ChevronDown,
    Minus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { Lead, LeadStatus } from '@/lib/types';
import { normalizeStatus } from '@/constants/status';

// ── Config ────────────────────────────────────────────────────
// Uses V2 normalized status keys so it works regardless of whether the DB
// stores English (received/closed) or Portuguese V2 (entrada/vendido) values.
const FUNNEL_STAGES: { key: string; label: string; color: string; icon: any }[] = [
    { key: 'entrada',    label: 'Entrada',    color: '#3b82f6', icon: Zap },
    { key: 'triagem',    label: 'Triagem',    color: '#8b5cf6', icon: Phone },
    { key: 'ataque',     label: 'Ataque',     color: '#f97316', icon: Calendar },
    { key: 'fechamento', label: 'Fechamento', color: '#eab308', icon: DollarSign },
    { key: 'vendido',    label: 'Vendidos',   color: '#22c55e', icon: CheckCircle2 },
    { key: 'perdido',    label: 'Perdidos',   color: '#ef4444', icon: XCircle },
];

const SOURCE_COLORS: Record<string, string> = {
    facebook: '#1877f2',
    instagram: '#e1306c',
    whatsapp: '#25d366',
    google: '#ea4335',
    site: '#ef4444',
};

const SOURCE_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp',
    facebook: 'Facebook',
    instagram: 'Instagram',
    google: 'Google',
};

const SOURCE_ICONS: Record<string, any> = {
    facebook: Facebook,
    instagram: Instagram,
    whatsapp: MessageCircle,
    google: Globe,
    site: Globe,
};

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } }
};
const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 }
};

type Period = 'today' | 'week' | 'month' | 'all';
type ViewTab = 'geral' | 'minha';

function calculateDateRange(period: string, customStart?: string, customEnd?: string): { start: Date | null, end: Date | null } {
    const now = new Date();
    const start = new Date(now);
    let end: Date | null = null;

    switch (period) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'week':
            start.setDate(now.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            break;
        case 'month': // Este Mês (Calendário)
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'lastMonth': // Mês Passado (Calendário)
            start.setMonth(now.getMonth() - 1);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;
        case 'custom':
            if (customStart) {
                const s = new Date(customStart);
                s.setHours(0, 0, 0, 0);
                var startOut: Date | null = s;
            } else {
                startOut = null;
            }
            if (customEnd) {
                const e = new Date(customEnd);
                e.setHours(23, 59, 59, 999);
                var endOut: Date | null = e;
            } else {
                endOut = null;
            }
            return { start: startOut, end: endOut };
        case 'year': // Este Ano
            start.setMonth(0);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'all':
            return { start: null, end: null };
        default:
            start.setDate(now.getDate() - 30);
            start.setHours(0, 0, 0, 0);
    }

    return { start, end };
}

function applyPeriod<T extends { created_at: string }>(items: T[], period: string, customStart?: string, customEnd?: string): T[] {
    const { start, end } = calculateDateRange(period, customStart, customEnd);
    if (!start && !end) return items;
    
    return items.filter(l => {
        const d = new Date(l.created_at);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
    });
}

const supabase = createClient();

const SOLD_STATUSES = new Set(['closed', 'comprado', 'post_sale', 'fechado']);

// ── Main Page ────────────────────────────────────────────────
export default function AnalyticsV2() {

    const [leads, setLeads] = useState<Lead[]>([]);
    const [consultants, setConsultants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<'admin' | 'consultant'>('consultant');
    const [myConsultantId, setMyConsultantId] = useState<string | null>(null);
    const [myName, setMyName] = useState('');
    const [period, setPeriod] = useState<Period | 'custom'>('month');
    const [tab, setTab] = useState<ViewTab>('minha');
    const [isManagement, setIsManagement] = useState(false);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    useEffect(() => {
        async function load() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // CRITICAL: use consultants_manos_crm — same table that leads_manos_crm.assigned_consultant_id references
                // Using 'consultants' (V2 table) would give a different UUID that doesn't match any lead assignment
                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, name, role, is_active')
                    .eq('auth_id', user.id)
                    .maybeSingle();

                const isAdmin = user.email === 'alexandre_gorges@hotmail.com'
                    || consultant?.role === 'admin'
                    || consultant?.role === 'management';

                setRole(isAdmin ? 'admin' : 'consultant');
                setIsManagement(isAdmin);
                if (isAdmin) setTab('geral');

                if (consultant) {
                    setMyName((consultant.name || 'Consultor').split(' ')[0]);
                    if (!isAdmin) setMyConsultantId(consultant.id);
                }

                // Determinar a data de início para buscar do banco (baseada no período selecionado ou 365 dias para garantir ranking ano)
                const fetchRange = calculateDateRange(period === 'all' ? 'year' : period);
                const startDate = fetchRange.start || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

                const [leadsRes, consultantsRes] = await Promise.all([
                    supabase
                        .from('leads')
                        .select('id, status, source, origem, ai_score, ai_classification, assigned_consultant_id, created_at, vehicle_interest, response_time_seconds')
                        .gte('created_at', startDate.toISOString())
                        .order('created_at', { ascending: false })
                        .limit(2000),
                    supabase
                        .from('consultants_manos_crm')
                        .select('id, name, role, is_active')
                        .eq('is_active', true)
                ]);

                setLeads((leadsRes.data || []) as Lead[]);
                setConsultants((consultantsRes.data || []).filter((c: any) => c.role !== 'admin' && c.role !== 'management' && c.is_active !== false));
            } catch (err) {
                console.error('Analytics load error:', err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [period]); // Re-fetch when period changes to ensure we have the data

    // ── Filtered datasets ────────────────────────────────────
    const allPeriodLeads = useMemo(() => applyPeriod(leads, period, customStart, customEnd), [leads, period, customStart, customEnd]);

    const myLeads = useMemo(() => {
        if (!myConsultantId) return allPeriodLeads;
        return allPeriodLeads.filter(l => l.assigned_consultant_id === myConsultantId);
    }, [allPeriodLeads, myConsultantId]);

    const displayLeads = tab === 'geral' ? allPeriodLeads : myLeads;

    // ── KPIs ─────────────────────────────────────────────────
    const totalLeads = displayLeads.length;
    // Use normalizeStatus so 'closed'/'vendido'/'venda realizada' all count as vendido
    const closedLeads = displayLeads.filter(l => normalizeStatus(l.status) === 'vendido').length;
    const lostLeads = displayLeads.filter(l => normalizeStatus(l.status) === 'perdido').length;
    const conversionRate = totalLeads > 0 ? ((closedLeads / totalLeads) * 100).toFixed(1) : '0.0';

    const leadsWithResponse = displayLeads.filter(l => l.response_time_seconds && l.response_time_seconds > 0);
    const avgResponseMin = leadsWithResponse.length > 0
        ? Math.round(leadsWithResponse.reduce((a, l) => a + (l.response_time_seconds || 0), 0) / leadsWithResponse.length / 60)
        : 0;

    // ── Funnel ───────────────────────────────────────────────
    const funnelData = useMemo(() => {
        const counts: Record<string, number> = {};
        // normalizeStatus ensures V1 English ('received','closed') and V1 PT ('perda total')
        // are all mapped to V2 keys ('entrada','vendido','perdido') before counting
        displayLeads.forEach(l => {
            const norm = normalizeStatus(l.status);
            counts[norm] = (counts[norm] || 0) + 1;
        });
        const maxCount = Math.max(...FUNNEL_STAGES.map(s => counts[s.key] || 0), 1);
        return FUNNEL_STAGES.map(stage => ({
            ...stage,
            count: counts[stage.key] || 0,
            pct: maxCount > 0 ? ((counts[stage.key] || 0) / maxCount * 100) : 0,
            pctOfTotal: totalLeads > 0 ? ((counts[stage.key] || 0) / totalLeads * 100) : 0,
        }));
    }, [displayLeads, totalLeads]);

    // ── Sources ──────────────────────────────────────────────
    const normalizeSource = (raw: string): string => {
        const s = raw.toLowerCase();
        if (s.includes('whatsapp')) return 'whatsapp';
        if (s.includes('instagram')) return 'instagram';
        if (s.includes('google')) return 'google';
        if (s.includes('facebook') || s.includes('fb') || s.includes('meta')) return 'facebook';
        return 'whatsapp'; // default fallback
    };

    const sourceData = useMemo(() => {
        const counts: Record<string, number> = { whatsapp: 0, facebook: 0, google: 0, instagram: 0 };
        displayLeads.forEach(l => {
            const raw = ((l.origem || l.source) || 'whatsapp');
            const src = normalizeSource(raw);
            counts[src] = (counts[src] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([source, count]) => ({ source, count, pct: totalLeads > 0 ? (count / totalLeads * 100) : 0 }))
            .filter(s => s.count > 0)
            .sort((a, b) => b.count - a.count);
    }, [displayLeads, totalLeads]);

    // ── Score distribution ───────────────────────────────────
    const scoreBuckets = useMemo(() => {
        const b = { hot: 0, warm: 0, cold: 0, unscored: 0 };
        displayLeads.forEach(l => {
            const s = l.ai_score || 0;
            if (s >= 70) b.hot++;
            else if (s >= 40) b.warm++;
            else if (s > 0) b.cold++;
            else b.unscored++;
        });
        return b;
    }, [displayLeads]);

    // ── Consultant ranking (only for geral tab) ───────────────
    const consultantPerf = useMemo(() => {
        return consultants.map(c => {
            const cLeads = allPeriodLeads.filter(l => l.assigned_consultant_id === c.id);
            const cClosed = cLeads.filter(l => l.status === 'closed').length;
            const cConv = cLeads.length > 0 ? (cClosed / cLeads.length * 100) : 0;
            const cResp = cLeads.filter(l => l.response_time_seconds && l.response_time_seconds > 0);
            const cAvgResp = cResp.length > 0
                ? Math.round(cResp.reduce((a, l) => a + (l.response_time_seconds || 0), 0) / cResp.length / 60)
                : 0;
            const hotLeads = cLeads.filter(l => (l.ai_score || 0) >= 70).length;
            return { id: c.id, name: c.name, leads: cLeads.length, sales: cClosed, conversion: cConv, avgResponseMin: cAvgResp, hotLeads };
        }).sort((a, b) => b.sales - a.sales || b.leads - a.leads);
    }, [consultants, allPeriodLeads]);

    // ── Top vehicles ──────────────────────────────────────────
    const topVehicles = useMemo(() => {
        const counts: Record<string, number> = {};
        displayLeads.forEach(l => {
            const v = l.vehicle_interest?.trim();
            if (v) counts[v] = (counts[v] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([vehicle, count]) => ({ vehicle, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
    }, [displayLeads]);

    // ── Daily trend (last 14 days) ────────────────────────────
    const dailyTrend = useMemo(() => {
        const days: { date: string; leads: number; closed: number }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const ds = d.toISOString().split('T')[0];
            const dayLeads = leads.filter(l => l.created_at?.startsWith(ds));
            days.push({
                date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                leads: dayLeads.length,
                closed: dayLeads.filter(l => SOLD_STATUSES.has(l.status)).length,
            });
        }
        return days;
    }, [leads]);

    // ── My perf detail ────────────────────────────────────────
    const myStageBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        myLeads.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });
        return FUNNEL_STAGES.map(s => ({ ...s, count: counts[s.key] || 0 }));
    }, [myLeads]);

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="h-16 w-16 border-t-2 border-red-500 rounded-full animate-spin shadow-[0_0_30px_rgba(239,68,68,0.3)]" />
            </div>
        );
    }

    const PERIODS = [
        { value: 'today',     label: 'Hoje' },
        { value: 'week',      label: '7 Dias' },
        { value: 'month',     label: 'Este Mês' },
        { value: 'lastMonth', label: 'Mês Passado' },
        { value: 'custom',    label: 'Intervalo' },
        { value: 'year',      label: 'Este Ano' },
        { value: 'all',       label: 'Tudo' },
    ];

    return (
        <div className="w-full space-y-6 pb-32 pt-0 px-2 md:px-0">

            {/* ── HUD HEADER ─────────────────────────────── */}
            <header className="border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 px-6 py-3 -mx-2 md:-mx-0 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                {/* Left: identity + stats */}
                <div className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2.5">
                            <BarChart3 size={14} className="text-red-600" />
                            <h1 className="text-xs font-black uppercase tracking-[0.3em] text-white/95 whitespace-nowrap">
                                {tab === 'minha' && myName ? myName : 'Análise'}{' '}
                                <span className="text-red-500">{tab === 'minha' ? '— Performance' : 'Inteligente'}</span>
                            </h1>
                        </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-4 pl-4 border-l border-white/10 ml-2">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-black text-white/80 tabular-nums">{totalLeads}</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-none">LEADS</span>
                        </div>
                        <div className="w-px h-3 bg-white/10" />
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-black text-emerald-400 tabular-nums">{closedLeads}</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-none">VENDAS</span>
                        </div>
                        <div className="w-px h-3 bg-white/10" />
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-black text-red-500 tabular-nums">{conversionRate}%</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-none">CONV.</span>
                        </div>
                    </div>
                </div>

                {/* Right: controls */}
                <div className="flex items-center gap-2 flex-wrap">
                    {period === 'custom' && (
                        <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-1.5 bg-white/5 border border-white/10 p-1 rounded-xl"
                        >
                            <input 
                                type="date" 
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="bg-transparent border-none text-[9px] font-black text-white/50 outline-none uppercase p-1"
                            />
                            <span className="text-[9px] text-white/10 font-bold">A</span>
                            <input 
                                type="date" 
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="bg-transparent border-none text-[9px] font-black text-white/50 outline-none uppercase p-1"
                            />
                        </motion.div>
                    )}

                    {isManagement && (
                        <div className="flex items-center gap-0.5 bg-white/5 p-1 rounded-xl border border-white/10">
                            {(['geral', 'minha'] as ViewTab[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                        tab === t
                                            ? 'bg-red-600 text-white shadow-[0_4px_10px_rgba(239,68,68,0.3)]'
                                            : 'text-white/40 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {t === 'geral' ? 'Geral' : 'Minha'}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-0.5 bg-white/5 p-1 rounded-xl border border-white/10">
                        {PERIODS.map(p => (
                            <button
                                key={p.value}
                                onClick={() => setPeriod(p.value as any)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                    period === p.value
                                        ? 'bg-white/10 text-white'
                                        : 'text-white/30 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* ── KPI Strip ──────────────────────────────── */}
            <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Leads',     value: totalLeads,                                       icon: Users,       accent: '#3b82f6' },
                    { label: 'Vendas',           value: closedLeads,                                      icon: CheckCircle2, accent: '#22c55e' },
                    { label: 'Conversão',        value: `${conversionRate}%`,                             icon: Target,      accent: '#ef4444' },
                    { label: 'Tempo de Resposta',value: avgResponseMin > 0 ? `${avgResponseMin}min` : 'N/D', icon: Clock,  accent: '#f59e0b' },
                ].map((kpi, i) => (
                    <motion.div key={i} variants={item} className="p-5 md:p-6 rounded-[2rem] premium-glass border-white/5 relative overflow-hidden group/stat">
                        <div className="absolute inset-0 opacity-0 group-hover/stat:opacity-100 transition-all duration-500 pointer-events-none"
                            style={{ background: `radial-gradient(circle at 80% 20%, ${kpi.accent}08, transparent 70%)` }} />
                        <div className="relative z-10">
                            <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4"
                                style={{ backgroundColor: `${kpi.accent}15`, color: kpi.accent }}>
                                <kpi.icon size={18} />
                            </div>
                            <p className="text-2xl md:text-3xl font-black text-white tabular-nums">{kpi.value}</p>
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mt-1">{kpi.label}</p>
                        </div>
                    </motion.div>
                ))}
            </motion.div>

            {/* ── Funnel + Score/Source ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Funnel */}
                <motion.div variants={item} initial="hidden" animate="show"
                    className="lg:col-span-8 p-6 md:p-8 rounded-[2.5rem] premium-glass border-white/5 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-black text-white flex items-center gap-3">
                            <Activity size={18} className="text-red-500" />
                            Funil de Conversão
                        </h2>
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{totalLeads} leads total</span>
                    </div>

                    <div className="space-y-2.5">
                        {funnelData.map((stage, i) => (
                            <div key={stage.key} className="group/bar">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <stage.icon size={12} style={{ color: stage.color }} />
                                        <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">{stage.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-black text-white tabular-nums">{stage.count}</span>
                                        <span className="text-[9px] font-bold text-white/20 w-10 text-right">{stage.pctOfTotal.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${stage.pct}%` }}
                                        transition={{ delay: i * 0.04, duration: 0.7, ease: 'easeOut' }}
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: stage.color }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Score + Sources */}
                <motion.div variants={item} initial="hidden" animate="show"
                    className="lg:col-span-4 p-6 md:p-8 rounded-[2.5rem] premium-glass border-white/5 space-y-6">
                    <h2 className="text-base font-black text-white flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-500" />
                        Score IA
                    </h2>

                    <div className="space-y-3">
                        {[
                            { label: 'Quente',   count: scoreBuckets.hot,      color: '#ef4444', bg: '#ef444415' },
                            { label: 'Morno',    count: scoreBuckets.warm,     color: '#f59e0b', bg: '#f59e0b15' },
                            { label: 'Frio',     count: scoreBuckets.cold,     color: '#3b82f6', bg: '#3b82f615' },
                            { label: 'Sem Score',count: scoreBuckets.unscored, color: '#ffffff30', bg: '#ffffff08' },
                        ].map((b, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                                <span className="text-[11px] font-bold text-white/50 flex-1">{b.label}</span>
                                <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${totalLeads > 0 ? (b.count / totalLeads * 100) : 0}%` }}
                                        transition={{ delay: i * 0.1, duration: 0.6 }}
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: b.color }}
                                    />
                                </div>
                                <span className="text-xs font-black text-white tabular-nums w-6 text-right">{b.count}</span>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-white/5 pt-5 space-y-3">
                        <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest">Origem dos Leads</h3>
                        {sourceData.slice(0, 5).map((src, i) => {
                            const Icon = SOURCE_ICONS[src.source] || Globe;
                            const color = SOURCE_COLORS[src.source] || '#ffffff50';
                            return (
                                <div key={i} className="flex items-center gap-2">
                                    <Icon size={12} style={{ color }} />
                                    <span className="text-[10px] font-bold text-white/40 flex-1">{SOURCE_LABELS[src.source] ?? src.source}</span>
                                    <span className="text-xs font-black text-white tabular-nums">{src.count}</span>
                                    <span className="text-[9px] text-white/20 font-bold w-8 text-right">{src.pct.toFixed(0)}%</span>
                                </div>
                            );
                        })}
                        {sourceData.length === 0 && (
                            <p className="text-[11px] text-white/20 text-center py-4">Sem dados de origem</p>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* ── Daily Trend ─────────────────────────────── */}
            <motion.div variants={item} initial="hidden" animate="show"
                className="p-6 md:p-8 rounded-[2.5rem] premium-glass border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-white flex items-center gap-3">
                        <TrendingUp size={18} className="text-red-500" />
                        Tendência — 14 Dias
                    </h2>
                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest">
                        <span className="flex items-center gap-1.5 text-red-400">
                            <div className="w-2 h-2 rounded-full bg-red-500" /> Leads
                        </span>
                        <span className="flex items-center gap-1.5 text-emerald-400">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" /> Vendas
                        </span>
                    </div>
                </div>

                <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={dailyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="leadsGradAnalytics" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="vendidoGradAnalytics" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                            dataKey="date"
                            tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 700 }}
                            axisLine={false}
                            tickLine={false}
                            interval={1}
                        />
                        <YAxis
                            tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 8 }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                            width={28}
                            domain={[0, (dataMax: number) => Math.max(dataMax, 3)]}
                        />
                        <Tooltip
                            contentStyle={{ background: '#0d0d10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '8px 12px' }}
                            labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                            itemStyle={{ fontSize: 12, fontWeight: 900 }}
                            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                        />
                        <Area
                            type="monotone"
                            dataKey="leads"
                            name="Leads"
                            stroke="#ef4444"
                            strokeWidth={2}
                            fill="url(#leadsGradAnalytics)"
                            dot={false}
                            activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
                        />
                        <Area
                            type="monotone"
                            dataKey="closed"
                            name="Vendas"
                            stroke="#22c55e"
                            strokeWidth={2}
                            fill="url(#vendidoGradAnalytics)"
                            dot={false}
                            activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </motion.div>

            {/* ── Consultant Ranking (admin geral only) ──── */}
            {tab === 'geral' && isManagement && (
                <motion.div variants={item} initial="hidden" animate="show"
                    className="p-6 md:p-8 rounded-[2.5rem] premium-glass border-white/5 space-y-6">
                    <h2 className="text-lg font-black text-white flex items-center gap-3">
                        <Medal size={18} className="text-amber-500" />
                        Ranking de Vendedores
                    </h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {consultantPerf.map((c, i) => {
                            const isTop = i === 0;
                            return (
                                <div key={c.id}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all group ${
                                        isTop
                                            ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/8'
                                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                                    }`}>
                                    {/* Rank badge */}
                                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                                        i === 0 ? 'bg-amber-500/20 text-amber-400' :
                                        i === 1 ? 'bg-slate-400/20 text-slate-300' :
                                        i === 2 ? 'bg-orange-700/20 text-orange-500' :
                                        'bg-white/5 text-white/20'
                                    }`}>
                                        {i + 1}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-black text-white group-hover:text-red-400 transition-colors truncate">{c.name}</h4>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-[9px] font-bold text-white/30">{c.leads} leads</span>
                                            {c.avgResponseMin > 0 && (
                                                <span className="text-[9px] font-bold text-white/20">{c.avgResponseMin}min resposta</span>
                                            )}
                                            {c.hotLeads > 0 && (
                                                <span className="text-[9px] font-bold text-red-400/60">{c.hotLeads} quentes</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="flex items-center gap-5 shrink-0 text-right">
                                        <div>
                                            <p className="text-lg font-black text-emerald-400 tabular-nums">{c.sales}</p>
                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Vendas</p>
                                        </div>
                                        <div>
                                            <p className={`text-lg font-black tabular-nums ${c.conversion >= 15 ? 'text-emerald-400' : c.conversion >= 5 ? 'text-amber-400' : 'text-white/40'}`}>
                                                {c.conversion.toFixed(0)}%
                                            </p>
                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Conv.</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {consultantPerf.length === 0 && (
                            <div className="col-span-2 text-center py-12 text-white/20 text-sm">
                                Nenhum consultor com dados no período
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ── My Personal Performance (minha tab) ──── */}
            {tab === 'minha' && (
                <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* My stage breakdown */}
                    <motion.div variants={item} className="p-6 md:p-8 rounded-[2.5rem] premium-glass border-white/5 space-y-5">
                        <h2 className="text-base font-black text-white flex items-center gap-3">
                            <UserCheck size={16} className="text-red-500" />
                            Meus Leads por Etapa
                        </h2>
                        <div className="space-y-2.5">
                            {myStageBreakdown.filter(s => s.count > 0).map((stage, i) => (
                                <div key={stage.key} className="flex items-center gap-3">
                                    <stage.icon size={12} style={{ color: stage.color }} className="shrink-0" />
                                    <span className="text-[10px] font-black text-white/50 uppercase tracking-wider flex-1">{stage.label}</span>
                                    <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${myLeads.length > 0 ? (stage.count / myLeads.length * 100) : 0}%` }}
                                            transition={{ delay: i * 0.05, duration: 0.6 }}
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: stage.color }}
                                        />
                                    </div>
                                    <span className="text-xs font-black text-white tabular-nums w-6 text-right">{stage.count}</span>
                                </div>
                            ))}
                            {myStageBreakdown.every(s => s.count === 0) && (
                                <p className="text-sm text-white/20 text-center py-8">Nenhum lead no período</p>
                            )}
                        </div>
                    </motion.div>

                    {/* My top vehicles */}
                    <motion.div variants={item} className="p-6 md:p-8 rounded-[2.5rem] premium-glass border-white/5 space-y-5">
                        <h2 className="text-base font-black text-white flex items-center gap-3">
                            <Car size={16} className="text-red-500" />
                            Veículos Mais Pedidos
                        </h2>
                        <div className="space-y-2.5">
                            {topVehicles.map((v, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                                    <div className="h-7 w-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center text-[9px] font-black shrink-0">
                                        {i + 1}
                                    </div>
                                    <span className="text-[11px] font-bold text-white/60 flex-1 truncate">{v.vehicle}</span>
                                    <span className="text-xs font-black text-white tabular-nums">{v.count}</span>
                                </div>
                            ))}
                            {topVehicles.length === 0 && (
                                <p className="text-sm text-white/20 text-center py-8">Sem dados de interesse</p>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}

            {/* ── Vehicles (geral tab) ─────────────────── */}
            {tab === 'geral' && (
                <motion.div variants={item} initial="hidden" animate="show"
                    className="p-6 md:p-8 rounded-[2.5rem] premium-glass border-white/5 space-y-5">
                    <h2 className="text-lg font-black text-white flex items-center gap-3">
                        <Car size={18} className="text-red-500" />
                        Veículos Mais Procurados
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {topVehicles.map((v, i) => (
                            <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                                <div className="h-8 w-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center text-[10px] font-black shrink-0">
                                    {i + 1}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-black text-white truncate">{v.vehicle}</p>
                                    <p className="text-[9px] text-white/30 font-bold">{v.count} leads</p>
                                </div>
                            </div>
                        ))}
                        {topVehicles.length === 0 && (
                            <div className="col-span-3 text-center py-12 text-white/20 text-sm">Sem dados de interesse no período</div>
                        )}
                    </div>
                </motion.div>
            )}

        </div>
    );
}
