'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Megaphone, FileSearch, Camera, Radar, Repeat, MessageCircle,
    RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, Loader2,
} from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

/**
 * /admin/marketing — Time de Marketing
 *
 * Painel do squad de agentes de IA da Manos (playbook: pasta "Agentes de
 * marketing" / CLAUDE.md): Perito, Vitrine, Sentinela, Captador, Recepção.
 * Lê marketing_agent_runs (via /api/admin/marketing-feed) e permite
 * aprovar/rejeitar o que precisar de decisão humana.
 */

type SquadKey = 'perito' | 'vitrine' | 'sentinela' | 'captador' | 'recepcao';

const SQUAD_INFO: Record<SquadKey, { label: string; missao: string; icon: any; color: string }> = {
    perito: { label: 'Perito', missao: 'Laudo cautelar → proposta de compra', icon: FileSearch, color: '#f59e0b' },
    vitrine: { label: 'Vitrine', missao: 'Conteúdo Instagram / elétricos', icon: Camera, color: '#ec4899' },
    sentinela: { label: 'Sentinela', missao: 'Inteligência de concorrência regional', icon: Radar, color: '#22d3ee' },
    captador: { label: 'Captador', missao: 'Qualificação de lead de troca por 0km', icon: Repeat, color: '#a3e635' },
    recepcao: { label: 'Recepção', missao: 'Captação 24h no Instagram (DM/comentário)', icon: MessageCircle, color: '#818cf8' },
};
const SQUAD_ORDER: SquadKey[] = ['perito', 'vitrine', 'sentinela', 'captador', 'recepcao'];

interface KpiRow { squad: SquadKey; total_runs: number; runs_7d: number; runs_24h: number; errors_7d: number; pending_approvals: number; last_run_at: string | null; }
interface RunRow {
    id: string; squad: SquadKey; skill_name: string | null; run_type: string; status: string;
    title: string; summary: string | null; input_ref: string | null; output_ref: string | null;
    metrics: Record<string, any>; requires_approval: boolean; approved_by: string | null;
    approved_at: string | null; rejected_reason: string | null; error_message: string | null; created_at: string;
}
interface FeedData { kpis: KpiRow[]; recentRuns: RunRow[]; pendingApprovals: RunRow[]; daily: Array<Record<string, any>>; generated_at: string; }

function timeAgo(iso: string | null): string {
    if (!iso) return '—';
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s atrás`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}min atrás`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
}

function formatBRL(v: any): string | null {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return null;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function metricLabel(key: string): string {
    const map: Record<string, string> = {
        valor_proposta: 'Proposta', fipe: 'FIPE', nota_compra: 'Nota', execution_id: 'Execução n8n',
        http_status: 'HTTP', leads_qualificados: 'Leads qualificados',
    };
    return map[key] || key.replace(/_/g, ' ');
}

const STATUS_STYLE: Record<string, { dot: string; label: string; text: string }> = {
    success: { dot: 'bg-emerald-500', label: 'ok', text: 'text-emerald-400' },
    error: { dot: 'bg-red-500', label: 'erro', text: 'text-red-400' },
    pending_approval: { dot: 'bg-amber-500', label: 'aguardando aprovação', text: 'text-amber-400' },
    approved: { dot: 'bg-blue-500', label: 'aprovado', text: 'text-blue-400' },
    rejected: { dot: 'bg-zinc-500', label: 'rejeitado', text: 'text-zinc-400' },
};

export default function MarketingSquadPage() {
    const supabase = useMemo(() => createClient(), []);
    const [data, setData] = useState<FeedData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const lastFetchRef = useRef(0);

    const fetchFeed = useCallback(async () => {
        const now = Date.now();
        if (now - lastFetchRef.current < 1500) return;
        lastFetchRef.current = now;
        try {
            const res = await fetch('/api/admin/marketing-feed', { cache: 'no-store' });
            if (!res.ok) return;
            setData(await res.json());
        } catch {
            // noop
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();
        const t = setInterval(fetchFeed, 30000);
        return () => clearInterval(t);
    }, [fetchFeed]);

    useEffect(() => {
        const channel = supabase.channel('admin-marketing-feed');
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_agent_runs' }, () => fetchFeed());
        channel.subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, fetchFeed]);

    async function decide(runId: string, action: 'approve' | 'reject') {
        setBusyId(runId);
        try {
            const res = await fetch('/api/admin/marketing-feed/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId, action }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || 'Erro ao registrar decisão.');
            }
            await fetchFeed();
        } finally {
            setBusyId(null);
        }
    }

    const kpiBySquad = useMemo(() => {
        const m: Partial<Record<SquadKey, KpiRow>> = {};
        for (const row of data?.kpis || []) m[row.squad] = row;
        return m;
    }, [data]);

    const totalPending = data?.pendingApprovals?.length || 0;
    const totalRuns7d = (data?.kpis || []).reduce((s, k) => s + (k.runs_7d || 0), 0);
    const totalErrors7d = (data?.kpis || []).reduce((s, k) => s + (k.errors_7d || 0), 0);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="max-w-[1600px] mx-auto p-3 md:p-5">
                {/* HEADER */}
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                            <Megaphone className="w-7 h-7 text-red-500" />
                            Time de Marketing
                        </h1>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            Squad de agentes de IA — Perito, Vitrine, Sentinela, Captador e Recepção. {totalRuns7d} execuções nos últimos 7 dias.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                        {totalErrors7d > 0 && (
                            <span className="flex items-center gap-1 text-red-400"><AlertTriangle className="w-3.5 h-3.5" /> {totalErrors7d} erro(s) na semana</span>
                        )}
                        <button onClick={() => fetchFeed()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                        </button>
                    </div>
                </div>

                {loading && !data ? (
                    <div className="text-zinc-500 text-sm py-10 text-center">Carregando…</div>
                ) : (
                    <>
                        {/* CARDS POR SQUAD */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
                            {SQUAD_ORDER.map((key) => {
                                const info = SQUAD_INFO[key];
                                const kpi = kpiBySquad[key];
                                const Icon = info.icon;
                                return (
                                    <div key={key} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 relative overflow-hidden">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${info.color}1a`, color: info.color }}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm leading-tight">{info.label}</p>
                                                <p className="text-[10px] text-zinc-500 leading-tight truncate" title={info.missao}>{info.missao}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-end justify-between mt-3">
                                            <div>
                                                <p className="text-2xl font-black leading-none">{kpi?.runs_7d ?? 0}</p>
                                                <p className="text-[10px] text-zinc-500 mt-1">execuções / 7d</p>
                                            </div>
                                            <div className="text-right">
                                                {!!kpi?.pending_approvals && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full mb-1">
                                                        <Clock className="w-2.5 h-2.5" /> {kpi.pending_approvals} pendente(s)
                                                    </span>
                                                )}
                                                <p className="text-[10px] text-zinc-500">{timeAgo(kpi?.last_run_at || null)}</p>
                                            </div>
                                        </div>
                                        {!!kpi?.errors_7d && (
                                            <p className="text-[10px] text-red-400 mt-1.5">{kpi.errors_7d} erro(s) na semana</p>
                                        )}
                                        {!kpi && <p className="text-[10px] text-zinc-600 mt-1.5">Sem execuções ainda</p>}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* PENDENTES DE APROVAÇÃO */}
                            <div className="lg:col-span-1 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                                <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-amber-400" /> Aguardando aprovação
                                    {totalPending > 0 && <span className="text-[10px] font-black bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">{totalPending}</span>}
                                </h2>
                                {totalPending === 0 ? (
                                    <p className="text-xs text-zinc-500">Nada esperando decisão agora.</p>
                                ) : (
                                    <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                                        {data!.pendingApprovals.map((run) => {
                                            const info = SQUAD_INFO[run.squad];
                                            const proposta = formatBRL(run.metrics?.valor_proposta);
                                            const fipe = formatBRL(run.metrics?.fipe);
                                            return (
                                                <div key={run.id} className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
                                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                                                        <span style={{ color: info.color }} className="font-bold">{info.label}</span>
                                                        <span>·</span>
                                                        <span>{timeAgo(run.created_at)}</span>
                                                    </div>
                                                    <p className="text-sm font-semibold leading-snug">{run.title}</p>
                                                    {run.summary && <p className="text-xs text-zinc-400 mt-1 leading-snug">{run.summary}</p>}
                                                    {(proposta || fipe) && (
                                                        <p className="text-xs text-emerald-400 mt-1.5 font-mono">
                                                            {proposta && <>Proposta: {proposta}</>}{proposta && fipe && ' · '}{fipe && <>FIPE: {fipe}</>}
                                                        </p>
                                                    )}
                                                    {run.output_ref && (
                                                        <a href={run.output_ref} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline block mt-1">Ver resultado →</a>
                                                    )}
                                                    <div className="flex gap-2 mt-2.5">
                                                        <button
                                                            disabled={busyId === run.id}
                                                            onClick={() => decide(run.id, 'approve')}
                                                            className="flex-1 flex items-center justify-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                                                        >
                                                            {busyId === run.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Aprovar
                                                        </button>
                                                        <button
                                                            disabled={busyId === run.id}
                                                            onClick={() => decide(run.id, 'reject')}
                                                            className="flex-1 flex items-center justify-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                                                        >
                                                            <XCircle className="w-3 h-3" /> Rejeitar
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ATIVIDADE RECENTE */}
                            <div className="lg:col-span-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                                <h2 className="text-sm font-bold mb-3">Atividade recente</h2>
                                {(!data?.recentRuns || data.recentRuns.length === 0) ? (
                                    <p className="text-xs text-zinc-500">Nenhuma execução registrada ainda. Assim que os agentes começarem a rodar, elas aparecem aqui.</p>
                                ) : (
                                    <div className="space-y-1.5 max-h-[600px] overflow-y-auto custom-scrollbar">
                                        {data.recentRuns.map((run) => {
                                            const info = SQUAD_INFO[run.squad];
                                            const st = STATUS_STYLE[run.status] || STATUS_STYLE.success;
                                            const isOpen = expanded === run.id;
                                            const metricEntries = Object.entries(run.metrics || {});
                                            return (
                                                <div key={run.id} className="rounded-xl hover:bg-white/[0.03] transition-colors">
                                                    <button
                                                        onClick={() => setExpanded(isOpen ? null : run.id)}
                                                        className="w-full flex items-start gap-2.5 px-2 py-2 text-left"
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${st.dot}`} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-[10px] font-bold" style={{ color: info.color }}>{info.label}</span>
                                                                {run.skill_name && <span className="text-[10px] text-zinc-600">· {run.skill_name}</span>}
                                                                <span className={`text-[10px] ${st.text}`}>· {st.label}</span>
                                                                <span className="text-[10px] text-zinc-600 ml-auto">{timeAgo(run.created_at)}</span>
                                                            </div>
                                                            <p className="text-sm leading-snug truncate">{run.title}</p>
                                                        </div>
                                                        <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {isOpen && (
                                                        <div className="px-2 pb-3 pl-6 text-xs text-zinc-400 space-y-1.5">
                                                            {run.summary && <p className="leading-snug">{run.summary}</p>}
                                                            {run.error_message && <p className="text-red-400">Erro: {run.error_message}</p>}
                                                            {run.rejected_reason && <p className="text-zinc-500">Motivo da rejeição: {run.rejected_reason}</p>}
                                                            {metricEntries.length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {metricEntries.map(([k, v]) => (
                                                                        <span key={k} className="font-mono bg-black/30 border border-white/[0.06] rounded px-1.5 py-0.5 text-[10px]">
                                                                            {metricLabel(k)}: {formatBRL(v) || String(v)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="flex gap-3">
                                                                {run.input_ref && <a href={run.input_ref} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Entrada →</a>}
                                                                {run.output_ref && <a href={run.output_ref} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Resultado →</a>}
                                                            </div>
                                                            {run.approved_by && (
                                                                <p className="text-zinc-600">{run.status === 'approved' ? 'Aprovado' : 'Decidido'} por {run.approved_by} · {timeAgo(run.approved_at)}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* TENDÊNCIA */}
                        {data && data.daily.length > 1 && (
                            <div className="mt-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                                <h2 className="text-sm font-bold mb-3">Execuções por dia (14 dias)</h2>
                                <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={data.daily}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                            <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                                            <YAxis tick={{ fill: '#71717a', fontSize: 10 }} allowDecimals={false} />
                                            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                                            {SQUAD_ORDER.map((key) => (
                                                <Line key={key} type="monotone" dataKey={key} stroke={SQUAD_INFO[key].color} strokeWidth={2} dot={false} name={SQUAD_INFO[key].label} />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
