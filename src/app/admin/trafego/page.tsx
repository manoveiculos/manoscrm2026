'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Flame, Snowflake, Thermometer, ThumbsDown, ThumbsUp,
    RefreshCcw, Users, BarChart2, MessageSquare, CheckCircle,
    AlertTriangle, CalendarDays, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ─── Tipos ─────────────────────────────────────────────────── */
interface FeedbackRow {
    id: string;
    data: string;
    temperatura_vendas: 'quente' | 'medio' | 'frio';
    campanha_id: string | null;
    problema_credito: boolean;
    comentario_extra: string | null;
    consultor_id: string;
    consultants_manos_crm: { name: string } | null;
    campaigns_manos_crm: { name: string } | null;
}

interface DaySummary {
    date: string;
    quente: number;
    medio: number;
    frio: number;
    credito_ok: number;
    credito_ruim: number;
    total: number;
}

interface ConsultorSummary {
    id: string;
    name: string;
    total: number;
    quente: number;
    medio: number;
    frio: number;
    credito_ruim: number;
    lastSubmit: string;
}

type TabId = 'hoje' | 'por_consultor' | 'historico';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'hoje', label: 'Resumo de Hoje', icon: CalendarDays },
    { id: 'por_consultor', label: 'Por Consultor', icon: Users },
    { id: 'historico', label: 'Histórico 7 Dias', icon: TrendingUp },
];

const TEMP_CONFIG = {
    quente: { label: 'Quentes', emoji: '🔥', color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    medio:  { label: 'Médios', emoji: '😐', color: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    frio:   { label: 'Frios/Lixo', emoji: '🧊', color: '#3b82f6', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
};

/* ─── Helpers ────────────────────────────────────────────────── */
function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

function dayLabel(isoDate: string) {
    return new Date(isoDate).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/* ─── Componente Principal ───────────────────────────────────── */
export default function AdminTrafegoPage() {
    const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('hoje');
    const [pendingConsultants, setPendingConsultants] = useState<{ id: string; name: string }[]>([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

            const [feedRes, consRes] = await Promise.all([
                supabase
                    .from('traffic_quality_feedback')
                    .select(`
                        id, data, temperatura_vendas, campanha_id, problema_credito, comentario_extra, consultor_id,
                        consultants_manos_crm(name),
                        campaigns_manos_crm(name)
                    `)
                    .gte('data', sevenDaysAgo)
                    .order('data', { ascending: false }),

                supabase
                    .from('consultants_manos_crm')
                    .select('id, name')
                    .eq('is_active', true)
                    .eq('role', 'consultant'),
            ]);

            const rows = (feedRes.data ?? []) as unknown as FeedbackRow[];
            setFeedbacks(rows);

            // Consultores que NÃO responderam hoje
            const todayRespondedIds = new Set(
                rows
                    .filter(r => new Date(r.data) >= new Date(todayISO()))
                    .map(r => r.consultor_id)
            );
            setPendingConsultants(
                (consRes.data ?? []).filter(c => !todayRespondedIds.has(c.id))
            );
        } catch (err) {
            console.error('[AdminTrafegoPage] Erro:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    /* ── Derivados ── */
    const todayFeedbacks = feedbacks.filter(r => new Date(r.data) >= new Date(todayISO()));

    const todayStats = {
        total: todayFeedbacks.length,
        quente: todayFeedbacks.filter(r => r.temperatura_vendas === 'quente').length,
        medio: todayFeedbacks.filter(r => r.temperatura_vendas === 'medio').length,
        frio: todayFeedbacks.filter(r => r.temperatura_vendas === 'frio').length,
        creditoOk: todayFeedbacks.filter(r => !r.problema_credito).length,
        creditoRuim: todayFeedbacks.filter(r => r.problema_credito).length,
    };

    // Temperatura predominante de hoje
    const mostCommonTemp = (['quente', 'medio', 'frio'] as const).reduce((a, b) =>
        todayStats[a] >= todayStats[b] ? a : b
    );

    // Por consultor (7 dias)
    const consultorMap = new Map<string, ConsultorSummary>();
    feedbacks.forEach(r => {
        const name = r.consultants_manos_crm?.name ?? 'Desconhecido';
        const prev = consultorMap.get(r.consultor_id) ?? {
            id: r.consultor_id, name, total: 0, quente: 0, medio: 0, frio: 0, credito_ruim: 0, lastSubmit: r.data
        };
        consultorMap.set(r.consultor_id, {
            ...prev,
            total: prev.total + 1,
            quente: prev.quente + (r.temperatura_vendas === 'quente' ? 1 : 0),
            medio: prev.medio + (r.temperatura_vendas === 'medio' ? 1 : 0),
            frio: prev.frio + (r.temperatura_vendas === 'frio' ? 1 : 0),
            credito_ruim: prev.credito_ruim + (r.problema_credito ? 1 : 0),
            lastSubmit: r.data > prev.lastSubmit ? r.data : prev.lastSubmit,
        });
    });
    const consultorList = Array.from(consultorMap.values()).sort((a, b) => b.total - a.total);

    // Histórico por dia (7 dias)
    const dayMap = new Map<string, DaySummary>();
    feedbacks.forEach(r => {
        const dayKey = r.data.substring(0, 10);
        const prev = dayMap.get(dayKey) ?? { date: dayKey, quente: 0, medio: 0, frio: 0, credito_ok: 0, credito_ruim: 0, total: 0 };
        dayMap.set(dayKey, {
            ...prev,
            total: prev.total + 1,
            quente: prev.quente + (r.temperatura_vendas === 'quente' ? 1 : 0),
            medio: prev.medio + (r.temperatura_vendas === 'medio' ? 1 : 0),
            frio: prev.frio + (r.temperatura_vendas === 'frio' ? 1 : 0),
            credito_ok: prev.credito_ok + (!r.problema_credito ? 1 : 0),
            credito_ruim: prev.credito_ruim + (r.problema_credito ? 1 : 0),
        });
    });
    const dayList = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    // Comentários de hoje
    const todayComments = todayFeedbacks.filter(r => r.comentario_extra?.trim());

    /* ─── Render ─────────────────────────────────────────────── */
    return (
        <div className="min-h-screen bg-[#03060b]">

            {/* HEADER */}
            <header className="border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div>
                    <div className="flex items-center gap-2">
                        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                            <BarChart2 size={13} className="text-red-500" />
                        </motion.div>
                        <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/90">
                            Radar de <span className="text-red-500">Tráfego</span>
                        </h1>
                    </div>
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-0.5">
                        Consolidado de Feedback da Equipe
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Alerta de pendentes */}
                    {pendingConsultants.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/25">
                            <AlertTriangle size={12} className="text-red-400" />
                            <span className="text-[10px] font-black text-red-400">
                                {pendingConsultants.length} sem resposta hoje
                            </span>
                        </div>
                    )}
                    <button
                        onClick={loadData}
                        className="h-9 w-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <div className="px-6 py-6 space-y-6 max-w-5xl">

                {/* KPI TILES */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Responderam', val: todayStats.total, color: '#22c55e', Icon: CheckCircle },
                        { label: 'Pendentes', val: pendingConsultants.length, color: '#ef4444', Icon: AlertTriangle },
                        { label: 'Crédito OK', val: todayStats.creditoOk, color: '#3b82f6', Icon: ThumbsUp },
                        { label: 'S/ Crédito', val: todayStats.creditoRuim, color: '#f59e0b', Icon: ThumbsDown },
                    ].map(({ label, val, color, Icon }) => (
                        <div key={label} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all">
                            <Icon size={12} className="mb-2" style={{ color }} />
                            <p className="text-[8px] font-black text-white/25 uppercase tracking-widest mb-1">{label}</p>
                            <p className="text-2xl font-black tabular-nums" style={{ color }}>{val}</p>
                        </div>
                    ))}
                </div>

                {/* TEMPERATURA DO DIA — Gauge Visual */}
                {todayStats.total > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/25">
                                Temperatura Predominante Hoje
                            </p>
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${TEMP_CONFIG[mostCommonTemp].bg} ${TEMP_CONFIG[mostCommonTemp].text} border ${TEMP_CONFIG[mostCommonTemp].border}`}>
                                {TEMP_CONFIG[mostCommonTemp].emoji} {TEMP_CONFIG[mostCommonTemp].label}
                            </span>
                        </div>

                        {/* Barra de distribuição */}
                        <div className="space-y-2">
                            {(['quente', 'medio', 'frio'] as const).map(temp => {
                                const count = todayStats[temp];
                                const pct = todayStats.total > 0 ? (count / todayStats.total) * 100 : 0;
                                const cfg = TEMP_CONFIG[temp];
                                return (
                                    <div key={temp} className="flex items-center gap-3">
                                        <span className="text-sm w-4 select-none">{cfg.emoji}</span>
                                        <div className="flex-1 h-2 rounded-full bg-white/5">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${pct}%` }}
                                                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                                                className="h-full rounded-full"
                                                style={{ backgroundColor: cfg.color }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-white/50 font-bold w-16 text-right tabular-nums">
                                            {count} ({pct.toFixed(0)}%)
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

                {/* TABS */}
                <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.05] w-fit flex-wrap">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                                    isActive
                                        ? 'bg-red-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]'
                                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                }`}
                            >
                                <tab.icon size={12} />
                                <span className="hidden sm:block">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* TAB CONTENT */}
                <AnimatePresence mode="wait">

                    {/* ── HOJE ── */}
                    {activeTab === 'hoje' && (
                        <motion.div key="hoje" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

                            {/* Quem não respondeu */}
                            {pendingConsultants.length > 0 && (
                                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-3">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400">
                                        ⚠️ Consultores Sem Resposta Hoje
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {pendingConsultants.map(c => (
                                            <span key={c.id} className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold">
                                                {c.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Quem respondeu hoje */}
                            {todayFeedbacks.length === 0 ? (
                                <div className="py-16 flex flex-col items-center justify-center text-center opacity-30">
                                    <BarChart2 size={28} className="mb-3" />
                                    <p className="text-sm font-bold text-white">Nenhum feedback enviado hoje ainda</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">
                                        Respostas de Hoje ({todayFeedbacks.length})
                                    </p>
                                    {todayFeedbacks.map(r => {
                                        const cfg = TEMP_CONFIG[r.temperatura_vendas];
                                        return (
                                            <motion.div
                                                key={r.id}
                                                layout
                                                className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all"
                                            >
                                                {/* Nome */}
                                                <p className="text-xs font-black text-white w-28 shrink-0 truncate">
                                                    {r.consultants_manos_crm?.name ?? '—'}
                                                </p>

                                                {/* Temperatura */}
                                                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                                                    <span>{cfg.emoji}</span> {cfg.label}
                                                </span>

                                                {/* Campanha */}
                                                {r.campaigns_manos_crm?.name && (
                                                    <span className="px-2.5 py-1 rounded-full text-[9px] font-bold bg-white/5 border border-white/10 text-white/50 truncate max-w-[140px]">
                                                        📢 {r.campaigns_manos_crm.name}
                                                    </span>
                                                )}

                                                {/* Crédito */}
                                                <span className={`flex items-center gap-1 text-[9px] font-bold ${r.problema_credito ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {r.problema_credito ? <ThumbsDown size={11} /> : <ThumbsUp size={11} />}
                                                    {r.problema_credito ? 'S/ Crédito' : 'Com Crédito'}
                                                </span>

                                                {/* Horário */}
                                                <span className="ml-auto text-[9px] text-white/20 tabular-nums shrink-0">
                                                    {new Date(r.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Comentários de hoje */}
                            {todayComments.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 flex items-center gap-2">
                                        <MessageSquare size={10} /> Observações da Equipe Hoje
                                    </p>
                                    {todayComments.map(r => (
                                        <div key={r.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                                                {r.consultants_manos_crm?.name ?? '—'}
                                            </p>
                                            <p className="text-xs text-white/60 leading-relaxed">
                                                "{r.comentario_extra}"
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── POR CONSULTOR ── */}
                    {activeTab === 'por_consultor' && (
                        <motion.div key="por_consultor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                            {consultorList.length === 0 ? (
                                <div className="py-16 flex flex-col items-center justify-center text-center opacity-30">
                                    <Users size={28} className="mb-3" />
                                    <p className="text-sm font-bold text-white">Nenhum dado nos últimos 7 dias</p>
                                </div>
                            ) : (
                                consultorList.map((c, i) => {
                                    const dominant = (['quente', 'medio', 'frio'] as const).reduce((a, b) =>
                                        c[a] >= c[b] ? a : b
                                    );
                                    const cfg = TEMP_CONFIG[dominant];
                                    return (
                                        <motion.div
                                            key={c.id}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all"
                                        >
                                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
                                                        <span className="text-xl">{cfg.emoji}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-white">{c.name}</p>
                                                        <p className="text-[9px] text-white/30 mt-0.5">
                                                            {c.total} respostas · último:{' '}
                                                            {new Date(c.lastSubmit).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4 flex-wrap">
                                                    <div className="flex items-center gap-1 text-[10px] text-red-400 font-bold">
                                                        <Flame size={11} />{c.quente}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">
                                                        <Thermometer size={11} />{c.medio}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[10px] text-blue-400 font-bold">
                                                        <Snowflake size={11} />{c.frio}
                                                    </div>
                                                    <div className={`flex items-center gap-1 text-[10px] font-bold ${c.credito_ruim > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                        <ThumbsDown size={11} />S/ crédito: {c.credito_ruim}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Mini barra de temperatura */}
                                            {c.total > 0 && (
                                                <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden flex">
                                                    <div className="h-full bg-red-500" style={{ width: `${(c.quente / c.total) * 100}%` }} />
                                                    <div className="h-full bg-amber-500" style={{ width: `${(c.medio / c.total) * 100}%` }} />
                                                    <div className="h-full bg-blue-500" style={{ width: `${(c.frio / c.total) * 100}%` }} />
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })
                            )}
                        </motion.div>
                    )}

                    {/* ── HISTÓRICO 7 DIAS ── */}
                    {activeTab === 'historico' && (
                        <motion.div key="historico" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                            {dayList.length === 0 ? (
                                <div className="py-16 flex flex-col items-center justify-center text-center opacity-30">
                                    <TrendingUp size={28} className="mb-3" />
                                    <p className="text-sm font-bold text-white">Nenhum dado nos últimos 7 dias</p>
                                </div>
                            ) : (
                                dayList.map((day, i) => (
                                    <motion.div
                                        key={day.date}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.06 }}
                                        className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all space-y-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <CalendarDays size={13} className="text-white/30" />
                                                <p className="text-xs font-black text-white capitalize">
                                                    {dayLabel(day.date + 'T12:00:00')}
                                                </p>
                                            </div>
                                            <span className="text-[10px] text-white/25 font-bold tabular-nums">
                                                {day.total} respostas
                                            </span>
                                        </div>

                                        {/* Barras do dia */}
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['quente', 'medio', 'frio'] as const).map(temp => {
                                                const cfg = TEMP_CONFIG[temp];
                                                const count = day[temp];
                                                const pct = day.total > 0 ? (count / day.total) * 100 : 0;
                                                return (
                                                    <div key={temp} className={`p-2.5 rounded-xl ${cfg.bg} border ${cfg.border} space-y-1`}>
                                                        <p className="text-[9px] font-black text-white/30 uppercase">{cfg.emoji} {cfg.label}</p>
                                                        <p className={`text-lg font-black tabular-nums ${cfg.text}`}>{count}</p>
                                                        <p className="text-[8px] text-white/20">{pct.toFixed(0)}%</p>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Crédito */}
                                        <div className="flex items-center gap-4 pt-1 border-t border-white/5">
                                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                                                <ThumbsUp size={11} />Com crédito: {day.credito_ok}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-bold">
                                                <ThumbsDown size={11} />S/ crédito: {day.credito_ruim}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
