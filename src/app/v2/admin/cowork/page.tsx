'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bot, Plus, AlertTriangle, CheckCircle, MessageSquare,
    Activity, RefreshCcw, Send, Bell, Users, FileText, TrendingUp, Play,
    Copy, Merge, Trash2, Phone,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ─── Tipos ──────────────────────────────────────────────────── */
interface CoworkAlert {
    id: string;
    title: string;
    message: string;
    type: string;
    priority: number;
    target_consultant_id: string | null;
    is_active: boolean;
    created_at: string;
    consultants_manos_crm?: { name: string } | null;
}

interface Acknowledgement {
    id: string;
    alert_id: string;
    consultant_id: string;
    consultant_name: string;
    action: 'acknowledged' | 'contested';
    contest_reason: string | null;
    created_at: string;
}

interface Consultant { id: string; name: string; }

interface CoworkReport {
    id: string;
    created_at: string;
    type: string;
    title: string;
    content: string;
    metadata: Record<string, any>;
}

/* ─── Constantes ─────────────────────────────────────────────── */
const ALERT_TYPES = [
    { value: 'manual',      label: 'Aviso Geral' },
    { value: 'performance', label: 'Performance' },
    { value: 'behavior',    label: 'Comportamento' },
    { value: 'urgency',     label: 'Urgência' },
    { value: 'recognition', label: 'Reconhecimento' },
];

const PRIORITY_BADGE: Record<number, string> = {
    1: 'bg-red-500/10 text-red-400 border border-red-500/20',
    2: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    3: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
};
const PRIORITY_LABEL: Record<number, string> = { 1: 'CRÍTICO', 2: 'ATENÇÃO', 3: 'AVISO' };

type Tab = 'ativos' | 'criar' | 'cientes' | 'contestacoes' | 'relatorios' | 'duplicatas';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'ativos',        label: 'Ativos',        icon: Bell },
    { id: 'criar',         label: 'Criar Aviso',   icon: Plus },
    { id: 'cientes',       label: 'Cientes',       icon: CheckCircle },
    { id: 'contestacoes',  label: 'Contestações',  icon: MessageSquare },
    { id: 'relatorios',    label: 'Relatórios IA', icon: FileText },
    { id: 'duplicatas',    label: 'Duplicatas',    icon: Copy },
];

/* ─── Componente ─────────────────────────────────────────────── */
export default function CoworkPage() {
    const [alerts, setAlerts]       = useState<CoworkAlert[]>([]);
    const [acks, setAcks]           = useState<Acknowledgement[]>([]);
    const [consultants, setCons]    = useState<Consultant[]>([]);
    const [reports, setReports]     = useState<CoworkReport[]>([]);
    const [loading, setLoading]     = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('ativos');
    const [submitting, setSubmitting] = useState(false);
    const [runningCron, setRunningCron] = useState(false);
    const [cronResult, setCronResult]   = useState<{ ok: boolean; msg: string; log?: string[] } | null>(null);
    const [duplicates, setDuplicates]   = useState<any[]>([]);
    const [loadingDupes, setLoadingDupes] = useState(false);
    const [mergingId, setMergingId]     = useState<string | null>(null);

    // Form
    const [form, setForm] = useState({
        title: '', message: '', type: 'manual', priority: 2, target_consultant_id: '',
    });

    /* ── Carregamento ── */
    const loadData = async () => {
        setLoading(true);
        try {
            const [alertsRes, consRes, reportsRes] = await Promise.all([
                fetch('/api/v2/cowork-alerts/all'),
                supabase.from('consultants_manos_crm').select('id, name').eq('is_active', true).order('name'),
                supabase.from('cowork_reports').select('*').order('created_at', { ascending: false }).limit(20),
            ]);
            const alertsJson = await alertsRes.json();
            if (alertsJson.success) {
                setAlerts(alertsJson.alerts ?? []);
                setAcks(alertsJson.acknowledgements ?? []);
            }
            setCons(consRes.data ?? []);
            setReports(reportsRes.data ?? []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    /* ── Criar aviso ── */
    const handleCreate = async () => {
        if (!form.title || !form.message) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/v2/cowork-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, target_consultant_id: form.target_consultant_id || null }),
            });
            const data = await res.json();
            if (data.success) {
                setForm({ title: '', message: '', type: 'manual', priority: 2, target_consultant_id: '' });
                setActiveTab('ativos');
                await loadData();
            }
        } catch {}
        setSubmitting(false);
    };

    /* ── Ativar/Desativar ── */
    const handleToggle = async (id: string, current: boolean) => {
        await fetch('/api/v2/cowork-alerts/all', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert_id: id, is_active: !current }),
        });
        await loadData();
    };

    /* ── Derivados ── */
    const active   = alerts.filter(a => a.is_active);
    const inactive = alerts.filter(a => !a.is_active);
    const acked    = acks.filter(a => a.action === 'acknowledged');
    const contests = acks.filter(a => a.action === 'contested');

    const tabCount: Record<Tab, number | null> = {
        ativos:       active.length,
        criar:        null,
        cientes:      acked.length,
        contestacoes: contests.length,
    };

    /* ─── Render ──────────────────────────────────────────────── */
    return (
        <div className="min-h-screen bg-[#03060b]">

            {/* HUD HEADER */}
            <header className="border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-5">
                    <div>
                        <div className="flex items-center gap-2">
                            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                                <Bot size={13} className="text-red-500" />
                            </motion.div>
                            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/90">
                                Cowork <span className="text-red-500">IA</span>
                            </h1>
                        </div>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-0.5">
                            Central de Avisos &amp; Relatórios
                        </p>
                    </div>

                    <div className="hidden sm:flex items-center gap-4 pl-4 border-l border-white/[0.06]">
                        {[
                            { label: 'ativos',        val: active.length,   color: 'text-red-400' },
                            { label: 'contestações',  val: contests.length, color: 'text-amber-400' },
                            { label: 'cientes',       val: acked.length,    color: 'text-emerald-400' },
                        ].map(s => (
                            <div key={s.label} className="flex items-center gap-1">
                                <span className={`text-xs font-black tabular-nums ${s.color}`}>{s.val}</span>
                                <span className="text-[9px] text-white/20 uppercase">{s.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadData}
                        className="h-9 w-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setActiveTab('criar')}
                        className="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_4px_15px_rgba(220,38,38,0.3)]"
                    >
                        <Plus size={13} /> Novo Aviso
                    </button>
                </div>
            </header>

            <div className="px-6 py-6 space-y-6 max-w-5xl">

                {/* STAT TILES */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Avisos Ativos',  val: active.length,   color: '#ef4444', Icon: Bell },
                        { label: 'Total Cientes',  val: acked.length,    color: '#22c55e', Icon: CheckCircle },
                        { label: 'Contestações',   val: contests.length, color: '#f59e0b', Icon: MessageSquare },
                        { label: 'Consultores',    val: consultants.length, color: '#3b82f6', Icon: Users },
                    ].map(({ label, val, color, Icon }) => (
                        <div key={label} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all">
                            <Icon size={12} className="mb-2" style={{ color }} />
                            <p className="text-[8px] font-black text-white/25 uppercase tracking-widest mb-1">{label}</p>
                            <p className="text-2xl font-black tabular-nums" style={{ color }}>{val}</p>
                        </div>
                    ))}
                </div>

                {/* TAB BAR */}
                <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.05] w-fit flex-wrap">
                    {TABS.map(tab => {
                        const count = tabCount[tab.id];
                        const active_ = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                                    active_
                                        ? 'bg-red-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]'
                                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                }`}
                            >
                                <tab.icon size={12} />
                                <span className="hidden sm:block">{tab.label}</span>
                                {count !== null && count > 0 && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${active_ ? 'bg-white/20' : 'bg-white/10 text-white/40'}`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* TAB CONTENT */}
                <AnimatePresence mode="wait">

                    {/* ── AVISOS ATIVOS ── */}
                    {activeTab === 'ativos' && (
                        <motion.div key="ativos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                            {active.length === 0 && !loading && (
                                <div className="py-16 flex flex-col items-center justify-center text-center opacity-30">
                                    <Bell size={28} className="mb-3" />
                                    <p className="text-sm font-bold text-white">Nenhum aviso ativo</p>
                                    <p className="text-[11px] text-white/40 mt-1">Crie um aviso para enviar aos consultores</p>
                                </div>
                            )}

                            {active.map(alert => {
                                const alertAcks = acks.filter(a => a.alert_id === alert.id);
                                const targetName = alert.consultants_manos_crm?.name ?? 'Todos';
                                return (
                                    <motion.div key={alert.id} layout
                                        className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${PRIORITY_BADGE[alert.priority] ?? PRIORITY_BADGE[2]}`}>
                                                        {PRIORITY_LABEL[alert.priority] ?? 'AVISO'}
                                                    </span>
                                                    <span className="text-[9px] text-white/25 font-bold">
                                                        Para: {targetName}
                                                    </span>
                                                    <span className="text-[9px] text-white/15">
                                                        {new Date(alert.created_at).toLocaleDateString('pt-BR')}
                                                    </span>
                                                </div>
                                                <h3 className="text-sm font-black text-white">{alert.title}</h3>
                                                <p className="text-xs text-white/40 mt-1 leading-relaxed line-clamp-2">{alert.message}</p>
                                                <div className="flex items-center gap-4 mt-2.5">
                                                    <span className="text-[9px] font-bold text-emerald-400">
                                                        ✓ {alertAcks.filter(a => a.action === 'acknowledged').length} cientes
                                                    </span>
                                                    <span className="text-[9px] font-bold text-amber-400">
                                                        ⚠ {alertAcks.filter(a => a.action === 'contested').length} contestações
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleToggle(alert.id, alert.is_active)}
                                                className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-white/60 text-[9px] font-black uppercase tracking-widest transition-all"
                                            >
                                                Desativar
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}

                            {/* Histórico desativados */}
                            {inactive.length > 0 && (
                                <div className="pt-4 border-t border-white/[0.05]">
                                    <p className="text-[9px] font-black text-white/15 uppercase tracking-widest mb-3">Histórico</p>
                                    {inactive.map(alert => (
                                        <div key={alert.id} className="flex items-center justify-between p-3 rounded-xl mb-2 opacity-30 hover:opacity-50 transition-opacity">
                                            <p className="text-xs font-bold text-white line-through">{alert.title}</p>
                                            <button onClick={() => handleToggle(alert.id, alert.is_active)}
                                                className="text-[9px] text-white/40 font-bold uppercase tracking-widest hover:text-white/60 transition-all">
                                                Reativar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── CRIAR AVISO ── */}
                    {activeTab === 'criar' && (
                        <motion.div key="criar" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="max-w-2xl p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center">
                                    <Send size={16} className="text-red-500" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-white">Criar Novo Aviso</h2>
                                    <p className="text-[10px] text-white/30">Aparecerá como pop-up obrigatório para o consultor</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Tipo</label>
                                    <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-red-500/40 transition-all">
                                        {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Prioridade</label>
                                    <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: Number(e.target.value) }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-red-500/40 transition-all">
                                        <option value={1}>🔴 Crítico — aparece com pulso vermelho</option>
                                        <option value={2}>🟡 Atenção</option>
                                        <option value={3}>🔵 Aviso informativo</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Destinatário</label>
                                <select value={form.target_consultant_id} onChange={e => setForm(p => ({ ...p, target_consultant_id: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-red-500/40 transition-all">
                                    <option value="">Todos os Consultores</option>
                                    {consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Título</label>
                                <input type="text" value={form.title}
                                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Ex: Você tem 3 leads quentes sem resposta hoje"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-red-500/40 transition-all" />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Mensagem</label>
                                <textarea value={form.message}
                                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                                    placeholder="Detalhe o aviso. O consultor só pode fechar ao clicar 'Ciente' ou 'Contestar'."
                                    rows={4}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 resize-none outline-none focus:border-red-500/40 transition-all" />
                            </div>

                            {/* Preview */}
                            {(form.title || form.message) && (
                                <div className="p-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01] space-y-1">
                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Preview do aviso</p>
                                    <p className="text-sm font-black text-white">{form.title || '—'}</p>
                                    <p className="text-xs text-white/40 leading-relaxed">{form.message || '—'}</p>
                                </div>
                            )}

                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={handleCreate}
                                disabled={submitting || !form.title || !form.message}
                                className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-[0_8px_20px_rgba(220,38,38,0.3)]"
                            >
                                {submitting ? <RefreshCcw size={14} className="animate-spin" /> : <Send size={14} />}
                                {submitting ? 'Enviando...' : 'Enviar Aviso para Consultor'}
                            </motion.button>
                        </motion.div>
                    )}

                    {/* ── CIENTES ── */}
                    {activeTab === 'cientes' && (
                        <motion.div key="cientes" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                            {acked.length === 0 && (
                                <div className="py-16 flex flex-col items-center justify-center text-center opacity-30">
                                    <CheckCircle size={28} className="mb-3" />
                                    <p className="text-sm font-bold text-white">Nenhuma confirmação ainda</p>
                                </div>
                            )}
                            {acked.map(ack => {
                                const alert = alerts.find(a => a.id === ack.alert_id);
                                return (
                                    <div key={ack.id} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/20 transition-all">
                                        <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                                            <CheckCircle size={14} className="text-emerald-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-white">{ack.consultant_name}</p>
                                            <p className="text-[10px] text-white/30 truncate">{alert?.title ?? ack.alert_id}</p>
                                        </div>
                                        <p className="text-[9px] text-white/20 shrink-0 tabular-nums">
                                            {new Date(ack.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* ── CONTESTAÇÕES ── */}
                    {activeTab === 'contestacoes' && (
                        <motion.div key="contestacoes" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                            {contests.length === 0 && (
                                <div className="py-16 flex flex-col items-center justify-center text-center opacity-30">
                                    <MessageSquare size={28} className="mb-3" />
                                    <p className="text-sm font-bold text-white">Nenhuma contestação registrada</p>
                                </div>
                            )}
                            {contests.map(ack => {
                                const alert = alerts.find(a => a.id === ack.alert_id);
                                return (
                                    <div key={ack.id} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3 hover:border-amber-500/30 transition-all">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                                    <MessageSquare size={15} className="text-amber-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-white">{ack.consultant_name}</p>
                                                    <p className="text-[9px] text-white/30 font-bold">Aviso: {alert?.title ?? '—'}</p>
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-white/20 tabular-nums">
                                                {new Date(ack.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        {ack.contest_reason && (
                                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                                <p className="text-[8px] font-black text-amber-400/60 uppercase tracking-widest mb-1.5">
                                                    Motivo da Contestação
                                                </p>
                                                <p className="text-xs text-white/60 leading-relaxed">{ack.contest_reason}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* ── RELATÓRIOS IA ── */}
                    {activeTab === 'relatorios' && (
                        <motion.div key="relatorios" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

                            {/* Executar análise manual */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div>
                                    <p className="text-sm font-black text-white">Análise IA Agora</p>
                                    <p className="text-[10px] text-white/30 mt-0.5">Executa o motor diário manualmente e gera alertas + relatório</p>
                                </div>
                                <button
                                    onClick={async () => {
                                        setRunningCron(true);
                                        setCronResult(null);
                                        try {
                                            const res = await fetch('/api/cron/cowork-daily');
                                            const data = await res.json();
                                            if (data.success) {
                                                setCronResult({
                                                    ok: true,
                                                    msg: `✅ ${data.alerts_created ?? 0} alertas criados · ${data.consultants_analyzed ?? 0} consultores analisados`,
                                                    log: data.log,
                                                });
                                            } else {
                                                setCronResult({ ok: false, msg: `❌ Erro: ${data.error || 'Falha desconhecida'}` });
                                            }
                                            await loadData();
                                        } catch (e: any) {
                                            setCronResult({ ok: false, msg: `❌ Falha na requisição: ${e.message}` });
                                        }
                                        setRunningCron(false);
                                    }}
                                    disabled={runningCron}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 shadow-[0_4px_15px_rgba(99,102,241,0.3)]"
                                >
                                    {runningCron
                                        ? <><RefreshCcw size={13} className="animate-spin" /> Analisando...</>
                                        : <><Play size={13} /> Executar Análise</>
                                    }
                                </button>
                            </div>

                            {/* Resultado da última execução */}
                            {cronResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                                    className={`p-4 rounded-xl border space-y-2 ${cronResult.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}
                                >
                                    <p className={`text-xs font-black ${cronResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{cronResult.msg}</p>
                                    {cronResult.log && cronResult.log.length > 0 && (
                                        <div className="space-y-0.5 pt-1 border-t border-white/5">
                                            {cronResult.log.map((line, i) => (
                                                <p key={i} className="text-[10px] text-white/35 font-mono leading-relaxed">{line}</p>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* Lista de relatórios */}
                            {reports.length === 0 ? (
                                <div className="py-16 text-center text-white/20">
                                    <FileText size={32} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-sm font-bold">Nenhum relatório gerado ainda</p>
                                    <p className="text-xs mt-1 opacity-60">Execute a análise acima ou aguarde o cron diário às 08h</p>
                                </div>
                            ) : (
                                reports.map(report => {
                                    const meta = report.metadata || {};
                                    return (
                                        <div key={report.id} className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                                        <TrendingUp size={14} className="text-indigo-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-white">{report.title}</p>
                                                        <p className="text-[9px] text-white/25 mt-0.5">
                                                            {new Date(report.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Mini KPIs */}
                                                {meta.total_leads_today !== undefined && (
                                                    <div className="hidden md:flex items-center gap-4 shrink-0">
                                                        {[
                                                            { label: 'Leads', value: meta.total_leads_today, color: '#3b82f6' },
                                                            { label: 'Vendas', value: meta.total_sales, color: '#22c55e' },
                                                            { label: 'S/ Contato', value: meta.total_uncontacted, color: '#ef4444' },
                                                            { label: 'Alertas', value: meta.alerts_generated, color: '#f59e0b' },
                                                        ].map((k, i) => (
                                                            <div key={i} className="text-center">
                                                                <p className="text-[8px] text-white/20 uppercase tracking-widest">{k.label}</p>
                                                                <p className="text-sm font-black tabular-nums" style={{ color: k.color }}>{k.value ?? '—'}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Conteúdo do relatório */}
                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                                <p className="text-xs text-white/55 leading-relaxed whitespace-pre-line">{report.content}</p>
                                            </div>

                                            {/* Ranking de consultores */}
                                            {meta.consultant_stats?.length > 0 && (
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                    {meta.consultant_stats.map((c: any, i: number) => (
                                                        <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                                            <p className="text-[10px] font-black text-white truncate">{c.name}</p>
                                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                                <span className="text-[8px] text-emerald-400 font-bold">{c.mySales} vendas</span>
                                                                {c.myUncontacted > 0 && <span className="text-[8px] text-red-400 font-bold">{c.myUncontacted} s/ contato</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </motion.div>
                    )}

                    {/* ── DUPLICATAS ── */}
                    {activeTab === 'duplicatas' && (
                        <motion.div key="duplicatas" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div>
                                    <p className="text-sm font-black text-white">Detector de Duplicatas</p>
                                    <p className="text-[10px] text-white/30 mt-0.5">Leads com mesmo telefone detectados automaticamente</p>
                                </div>
                                <button
                                    onClick={async () => {
                                        setLoadingDupes(true);
                                        const res = await fetch('/api/v2/leads-dedup');
                                        const data = await res.json();
                                        if (data.success) setDuplicates(data.duplicates || []);
                                        setLoadingDupes(false);
                                    }}
                                    disabled={loadingDupes}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    {loadingDupes
                                        ? <><RefreshCcw size={13} className="animate-spin" /> Buscando...</>
                                        : <><Copy size={13} /> Verificar Agora</>
                                    }
                                </button>
                            </div>

                            {duplicates.length === 0 && !loadingDupes && (
                                <div className="py-16 text-center text-white/20">
                                    <Copy size={32} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-sm font-bold">Clique em "Verificar Agora" para escanear</p>
                                </div>
                            )}

                            {duplicates.map((group, gi) => (
                                <div key={gi} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Phone size={12} className="text-amber-400" />
                                            <span className="text-xs font-black text-amber-400">{group.phone}</span>
                                            <span className="text-[9px] text-white/30 font-bold">{group.count} leads</span>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const dupIds = group.leads
                                                    .filter((l: any) => l.id !== group.suggestedMaster.id)
                                                    .map((l: any) => l.id);
                                                setMergingId(group.phone);
                                                await fetch('/api/v2/leads-dedup', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ masterId: group.suggestedMaster.id, duplicateIds: dupIds }),
                                                });
                                                setDuplicates(prev => prev.filter((_, i) => i !== gi));
                                                setMergingId(null);
                                            }}
                                            disabled={mergingId === group.phone}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                                        >
                                            {mergingId === group.phone
                                                ? <RefreshCcw size={11} className="animate-spin" />
                                                : <Merge size={11} />
                                            }
                                            Mesclar
                                        </button>
                                    </div>

                                    <div className="space-y-1.5">
                                        {group.leads.map((lead: any, li: number) => (
                                            <div key={lead.id}
                                                className={`flex items-center justify-between p-2.5 rounded-lg border ${lead.id === group.suggestedMaster.id ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-white/[0.02] border-white/[0.05]'}`}>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {lead.id === group.suggestedMaster.id && (
                                                        <span className="text-[7px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">MASTER</span>
                                                    )}
                                                    <p className="text-xs font-bold text-white truncate">{lead.name}</p>
                                                    <span className="text-[9px] text-white/25 shrink-0">{lead.status}</span>
                                                    <span className="text-[9px] text-white/20 shrink-0">{lead.source}</span>
                                                </div>
                                                <p className="text-[9px] text-white/20 shrink-0">
                                                    {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
