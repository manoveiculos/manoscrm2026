'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Megaphone, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown,
    Loader2, Play, Eye, ImageOff, ExternalLink, Plug,
} from 'lucide-react';
import { ExecuteModal } from './ExecuteModal';
import { SquadDetailModal } from './SquadDetailModal';
import { MidiaBadge, LogResumo, statusMidia } from './MidiaStatus';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
    SquadKey, SQUAD_INFO, SQUAD_ORDER, SQUAD_GROUPS,
    KpiRow, FeedData,
    timeAgo, formatBRL, metricLabel, parseRefUrl,
    STATUS_STYLE, getSquadInfo,
} from './utils';

/**
 * /admin/marketing — Time de Marketing
 *
 * Painel do squad de agentes de IA da Manos (playbook: pasta "Agentes de
 * marketing" / CLAUDE.md): Perito, Vitrine, Sentinela, Captador, Recepção.
 * Lê marketing_agent_runs (via /api/admin/marketing-feed) e permite
 * aprovar/rejeitar o que precisar de decisão humana.
 */


export default function MarketingSquadPage() {
    const supabase = useMemo(() => createClient(), []);
    const [data, setData] = useState<FeedData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showExecute, setShowExecute] = useState(false);
    const [selectedSquad, setSelectedSquad] = useState<SquadKey | null>(null);
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
        for (const row of data?.kpis || []) {
            if (row?.squad) m[row.squad] = row;
        }
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
                            8 squads de IA — conteúdo, aquisição e inteligência de mercado. {totalRuns7d} execuções nos últimos 7 dias.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                        {totalErrors7d > 0 && (
                            <span className="flex items-center gap-1 text-red-400"><AlertTriangle className="w-3.5 h-3.5" /> {totalErrors7d} erro(s) na semana</span>
                        )}
                        <button onClick={() => fetchFeed()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                        </button>
                        <button onClick={() => setShowExecute(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors">
                            <Play className="w-3.5 h-3.5" /> Executar
                        </button>
                    </div>
                </div>

                {/* CONEXÕES */}
                {data && data.integrations && data.integrations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-5">
                        {data.integrations.map((ig) => {
                            const ok = ig.status === 'connected';
                            const d = ig.details || {};
                            const networks = d.networks || {};
                            const dashboardUrl = d.dashboard_url as string | undefined;
                            return (
                                <div key={ig.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-xs">
                                    <Plug className={`w-3.5 h-3.5 ${ok ? 'text-emerald-400' : 'text-red-400'}`} />
                                    <span className="font-bold capitalize">{ig.provider}</span>
                                    <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? 'conectado' : ig.status}</span>
                                    {networks.instagram && <span className="text-zinc-500">· Instagram @{networks.instagram}</span>}
                                    {d.plan && <span className="text-zinc-600">· plano {d.plan}</span>}
                                    <span className="text-zinc-600">· verificado {timeAgo(ig.checked_at)}</span>
                                    {dashboardUrl && (
                                        <a href={dashboardUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Gerenciar →</a>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {loading && !data ? (
                    <div className="text-zinc-500 text-sm py-10 text-center">Carregando…</div>
                ) : (
                    <>
                        {/* CARDS POR SQUAD — agrupados por pipeline (separados, como pedido) */}
                        {SQUAD_GROUPS.map((group) => (
                            <div key={group.title} className="mb-5">
                                <div className="flex items-baseline gap-2 mb-2 px-0.5">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">{group.title}</h3>
                                    <span className="text-[10px] text-zinc-600">{group.note}</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {group.squads.map((key) => {
                                        const info = SQUAD_INFO[key];
                                        const kpi = kpiBySquad[key];
                                        const Icon = info.icon;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setSelectedSquad(key)}
                                                className="text-left rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 relative overflow-hidden hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors cursor-pointer"
                                            >
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
                                                <p className="text-[9px] text-zinc-600 mt-2">Clique para ver o histórico →</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* PENDENTES DE APROVAÇÃO */}
                            <div className="lg:col-span-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                                <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-amber-400" /> Aguardando aprovação
                                    {totalPending > 0 && <span className="text-[10px] font-black bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">{totalPending}</span>}
                                </h2>
                                {totalPending === 0 ? (
                                    <p className="text-xs text-zinc-500">Nada esperando decisão agora.</p>
                                ) : (
                                    <div className="space-y-3 max-h-[720px] overflow-y-auto custom-scrollbar">
                                        {data!.pendingApprovals.map((run) => {
                                            const info = getSquadInfo(run.squad);
                                            const proposta = formatBRL(run.metrics?.valor_proposta);
                                            const fipe = formatBRL(run.metrics?.fipe);
                                            const outRef = parseRefUrl(run.output_ref);
                                            const imagens: string[] = Array.isArray(run.metrics?.imagens_publicas) ? run.metrics.imagens_publicas : [];
                                            const caption: string | null = run.metrics?.caption_instagram || null;
                                            const temArteGerada = run.squad === 'vitrine' || run.squad === 'diretor_arte';
                                            const pronto = imagens.length > 0;
                                            const visualRevisado = !!run.metrics?.visual_revisado;
                                            const visualAprovado = !!run.metrics?.visual_aprovado;
                                            const problemasVisuais = run.metrics?.problemas_visuais;
                                            return (
                                                <div key={run.id} className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
                                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                                                        <span style={{ color: info.color }} className="font-bold">{info.label}</span>
                                                        <span>·</span>
                                                        <span>{timeAgo(run.created_at)}</span>
                                                        {temArteGerada && (
                                                            pronto ? (
                                                                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                                                                    <CheckCircle2 className="w-2.5 h-2.5" /> pronto p/ publicar
                                                                </span>
                                                            ) : (
                                                                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full" title="Sem imagens_publicas no metrics — o Publisher vai bloquear essa pauta ate a Vitrine reprocessar.">
                                                                    <ImageOff className="w-2.5 h-2.5" /> sem imagens públicas
                                                                </span>
                                                            )
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-semibold leading-snug">{run.title}</p>
                                                    {run.summary && <p className="text-xs text-zinc-400 mt-1 leading-snug">{run.summary}</p>}

                                                    <div className="mt-1.5"><MidiaBadge metrics={run.metrics} /></div>
                                                    <LogResumo metrics={run.metrics} />

                                                    {temArteGerada && (
                                                        <div className="mt-1.5">
                                                            {visualRevisado ? (
                                                                visualAprovado ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">
                                                                        <Eye className="w-2.5 h-2.5" /> Diretor de Arte aprovou
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full" title={typeof problemasVisuais === 'string' ? problemasVisuais : JSON.stringify(problemasVisuais)}>
                                                                        <AlertTriangle className="w-2.5 h-2.5" /> Diretor de Arte reprovou
                                                                    </span>
                                                                )
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded-full">
                                                                    <Clock className="w-2.5 h-2.5" /> aguardando revisão do Diretor de Arte
                                                                </span>
                                                            )}
                                                            {visualRevisado && !visualAprovado && problemasVisuais && (
                                                                <p className="text-[10px] text-red-400/90 mt-1 leading-snug">
                                                                    {Array.isArray(problemasVisuais) ? problemasVisuais.join(' • ') : String(problemasVisuais)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {imagens.length > 0 && (
                                                        <div className="grid grid-cols-3 gap-1.5 mt-2">
                                                            {imagens.slice(0, 6).map((url, i) => (
                                                                <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-white/[0.08] bg-black/40 hover:opacity-80 transition-opacity relative group">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={url} alt={`${run.title} — imagem ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                                                    <span className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><ExternalLink className="w-3 h-3 text-white drop-shadow" /></span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {caption && (
                                                        <p className="text-[11px] text-zinc-300 mt-2 leading-snug bg-black/40 border border-white/[0.06] rounded-lg p-2 whitespace-pre-wrap max-h-24 overflow-y-auto custom-scrollbar">{caption}</p>
                                                    )}

                                                    {(proposta || fipe) && (
                                                        <p className="text-xs text-emerald-400 mt-1.5 font-mono">
                                                            {proposta && <>Proposta: {proposta}</>}{proposta && fipe && ' · '}{fipe && <>FIPE: {fipe}</>}
                                                        </p>
                                                    )}
                                                    {outRef.text && (
                                                        outRef.isUrl ? (
                                                            <a href={outRef.href} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline block mt-1">Ver resultado →</a>
                                                        ) : (
                                                            <p className="text-[10px] text-zinc-400 mt-1 truncate" title={outRef.text}>Resultado: {outRef.text}</p>
                                                        )
                                                    )}
                                                    <div className="flex gap-2 mt-2.5">
                                                        <button
                                                            disabled={busyId === run.id || statusMidia(run.metrics) === 'aguardando_ativo'}
                                                            title={statusMidia(run.metrics) === 'aguardando_ativo' ? 'Sem imagem publicada ainda — aguardando ativo' : undefined}
                                                            onClick={() => {
                                                                if (temArteGerada && visualRevisado && !visualAprovado && !confirm('O Diretor de Arte reprovou essa arte. Aprovar mesmo assim?')) return;
                                                                decide(run.id, 'approve');
                                                            }}
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
                            <div className="lg:col-span-1 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                                <h2 className="text-sm font-bold mb-3">Atividade recente</h2>
                                {(!data?.recentRuns || data.recentRuns.length === 0) ? (
                                    <p className="text-xs text-zinc-500">Nenhuma execução registrada ainda. Assim que os agentes começarem a rodar, elas aparecem aqui.</p>
                                ) : (
                                    <div className="space-y-1.5 max-h-[600px] overflow-y-auto custom-scrollbar">
                                        {data.recentRuns.map((run) => {
                                            const info = getSquadInfo(run.squad);
                                            const st = STATUS_STYLE[run.status] || STATUS_STYLE.success;
                                            const isOpen = expanded === run.id;
                                            const metricEntries = Object.entries(run.metrics || {}).filter(([, v]) => v === null || typeof v !== 'object');
                                            const inRef = parseRefUrl(run.input_ref);
                                            const outRef = parseRefUrl(run.output_ref);
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
                                                            <div className="flex gap-3 flex-wrap">
                                                                {inRef.text && (
                                                                    inRef.isUrl ? (
                                                                        <a href={inRef.href} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Entrada →</a>
                                                                    ) : (
                                                                        <span className="text-zinc-400" title={inRef.text}>Entrada: {inRef.text}</span>
                                                                    )
                                                                )}
                                                                {outRef.text && (
                                                                    outRef.isUrl ? (
                                                                        <a href={outRef.href} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Resultado →</a>
                                                                    ) : (
                                                                        <span className="text-zinc-400" title={outRef.text}>Resultado: {outRef.text}</span>
                                                                    )
                                                                )}
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

                {showExecute && (
                    <ExecuteModal onClose={() => setShowExecute(false)} onDone={() => fetchFeed()} />
                )}
                {selectedSquad && (
                    <SquadDetailModal
                        squad={selectedSquad}
                        busyId={busyId}
                        onClose={() => setSelectedSquad(null)}
                        onDecide={(runId, action) => decide(runId, action)}
                    />
                )}
            </div>
        </div>
    );
}
