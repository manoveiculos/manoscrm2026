'use client';

import { useEffect, useState } from 'react';
import {
    X, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Eye, ImageOff, Maximize2,
} from 'lucide-react';
import {
    SquadKey, SQUAD_INFO, RunRow,
    timeAgo, formatBRL, metricLabel, parseRefUrl, STATUS_STYLE,
} from './utils';
import { MidiaBadge, LogResumo, statusMidia } from './MidiaStatus';
import { Lightbox } from './Lightbox';

/**
 * Drill-down de um squad — abre ao clicar no card dele no painel principal.
 * Mostra TODO o histórico daquele squad (não só as últimas 60 globais do
 * feed principal): o que foi feito, se tem imagem, se está pronto pra
 * publicar, e o veredito do Diretor de Arte quando existir.
 */
export function SquadDetailModal({
    squad, busyId, onClose, onDecide,
}: {
    squad: SquadKey;
    busyId: string | null;
    onClose: () => void;
    onDecide: (runId: string, action: 'approve' | 'reject') => void;
}) {
    const info = SQUAD_INFO[squad];
    const Icon = info.icon;
    const [runs, setRuns] = useState<RunRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<{ images: string[]; index: number; title: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/admin/marketing-feed/squad-runs?squad=${squad}`, { cache: 'no-store' });
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || !json.success) {
                    setError(json?.error || 'falha ao carregar histórico');
                } else {
                    setRuns(json.runs || []);
                }
            } catch (e: any) {
                if (!cancelled) setError(e?.message || 'erro inesperado');
            }
        })();
        return () => { cancelled = true; };
    }, [squad]);

    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-10 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
            <div
                className="w-full max-w-3xl rounded-2xl bg-[#0C0C0F] border border-white/[0.08] shadow-2xl mb-10"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] sticky top-0 bg-[#0C0C0F] rounded-t-2xl">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${info.color}1a`, color: info.color }}>
                            <Icon className="w-4 h-4" />
                        </div>
                        {info.label}
                        <span className="text-xs font-normal text-zinc-500">— {info.missao}</span>
                    </h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5">
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    {!error && runs === null && (
                        <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico de {info.label}…
                        </div>
                    )}
                    {!error && runs && runs.length === 0 && (
                        <p className="text-sm text-zinc-500 py-8 text-center">Nenhuma execução registrada ainda para {info.label}.</p>
                    )}
                    {!error && runs && runs.length > 0 && (
                        <div className="space-y-2.5">
                            {runs.map((run) => {
                                const st = STATUS_STYLE[run.status] || STATUS_STYLE.success;
                                const proposta = formatBRL(run.metrics?.valor_proposta);
                                const fipe = formatBRL(run.metrics?.fipe);
                                const outRef = parseRefUrl(run.output_ref);
                                const inRef = parseRefUrl(run.input_ref);
                                const imagens: string[] = Array.isArray(run.metrics?.imagens_publicas) ? run.metrics.imagens_publicas : [];
                                const caption: string | null = run.metrics?.caption_instagram || null;
                                const temArteGerada = squad === 'vitrine';
                                const problemasRevisao: string[] = Array.isArray(run.metrics?.problemas) ? run.metrics.problemas : [];
                                const pronto = imagens.length > 0;
                                const visualRevisado = !!run.metrics?.visual_revisado;
                                const visualAprovado = !!run.metrics?.visual_aprovado;
                                const problemasVisuais = run.metrics?.problemas_visuais;
                                const metricEntries = Object.entries(run.metrics || {}).filter(([k, v]) => !['imagens_publicas', 'caption_instagram', 'texto_completo', 'visual_revisado', 'visual_aprovado', 'problemas_visuais', 'log_execucao', 'status_midia'].includes(k) && (v === null || typeof v !== 'object'));
                                const pendente = run.status === 'pending_approval' && run.requires_approval && !run.approved_at;

                                return (
                                    <div key={run.id} className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
                                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1 flex-wrap">
                                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                            <span className={st.text}>{st.label}</span>
                                            <span>·</span>
                                            <span>{timeAgo(run.created_at)}</span>
                                            {run.skill_name && <span className="text-zinc-600">· {run.skill_name}</span>}
                                            {temArteGerada && (
                                                pronto ? (
                                                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> pronto p/ publicar
                                                    </span>
                                                ) : (
                                                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                                                        <ImageOff className="w-2.5 h-2.5" /> sem imagens públicas
                                                    </span>
                                                )
                                            )}
                                        </div>
                                        <p className="text-sm font-semibold leading-snug">{run.title}</p>
                                        {run.summary && <p className="text-xs text-zinc-400 mt-1 leading-snug">{run.summary}</p>}
                                        {run.error_message && <p className="text-xs text-red-400 mt-1.5 leading-snug">Erro: {run.error_message}</p>}
                                        {run.rejected_reason && <p className="text-xs text-zinc-500 mt-1">Motivo da rejeição: {run.rejected_reason}</p>}
                                        <div className="mt-1.5"><MidiaBadge metrics={run.metrics} /></div>
                                        <LogResumo metrics={run.metrics} />
                                        {problemasRevisao.length > 0 && (
                                            <ul className="mt-1.5 space-y-0.5">
                                                {problemasRevisao.map((pr, i) => (
                                                    <li key={i} className="text-[10px] text-red-400/90 leading-snug">• {pr}</li>
                                                ))}
                                            </ul>
                                        )}

                                        {temArteGerada && (
                                            <div className="mt-1.5">
                                                {visualRevisado ? (
                                                    visualAprovado ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">
                                                            <Eye className="w-2.5 h-2.5" /> Diretor de Arte aprovou
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
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
                                            <div className="grid grid-cols-4 gap-1.5 mt-2">
                                                {imagens.slice(0, 8).map((url, i) => (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => setLightbox({ images: imagens, index: i, title: run.title })}
                                                        className="block aspect-square rounded-lg overflow-hidden border border-white/[0.08] bg-black/40 hover:opacity-80 transition-opacity relative group"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={url} alt={`${run.title} — imagem ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                                        <span className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 className="w-3 h-3 text-white drop-shadow" /></span>
                                                    </button>
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

                                        {metricEntries.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {metricEntries.map(([k, v]) => (
                                                    <span key={k} className="font-mono bg-black/30 border border-white/[0.06] rounded px-1.5 py-0.5 text-[10px] text-zinc-400">
                                                        {metricLabel(k)}: {formatBRL(v) || String(v)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex gap-3 flex-wrap mt-1.5">
                                            {inRef.text && (
                                                inRef.isUrl ? (
                                                    <a href={inRef.href} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline">Entrada →</a>
                                                ) : (
                                                    <span className="text-[10px] text-zinc-500" title={inRef.text}>Entrada: {inRef.text}</span>
                                                )
                                            )}
                                            {outRef.text && (
                                                outRef.isUrl ? (
                                                    <a href={outRef.href} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline">Resultado →</a>
                                                ) : (
                                                    <span className="text-[10px] text-zinc-500" title={outRef.text}>Resultado: {outRef.text}</span>
                                                )
                                            )}
                                        </div>

                                        {run.approved_by && (
                                            <p className="text-[10px] text-zinc-600 mt-1.5">{run.status === 'approved' ? 'Aprovado' : 'Decidido'} por {run.approved_by} · {timeAgo(run.approved_at)}</p>
                                        )}

                                        {pendente && (
                                            <div className="flex gap-2 mt-2.5">
                                                <button
                                                    disabled={busyId === run.id || statusMidia(run.metrics) === 'aguardando_ativo'}
                                                    title={statusMidia(run.metrics) === 'aguardando_ativo' ? 'Sem imagem publicada ainda — aguardando ativo' : undefined}
                                                    onClick={() => {
                                                        if (temArteGerada && visualRevisado && !visualAprovado && !confirm('O Diretor de Arte reprovou essa arte. Aprovar mesmo assim?')) return;
                                                        onDecide(run.id, 'approve');
                                                    }}
                                                    className="flex-1 flex items-center justify-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                                                >
                                                    {busyId === run.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Aprovar
                                                </button>
                                                <button
                                                    disabled={busyId === run.id}
                                                    onClick={() => onDecide(run.id, 'reject')}
                                                    className="flex-1 flex items-center justify-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                                                >
                                                    <XCircle className="w-3 h-3" /> Rejeitar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            {lightbox && (
                <Lightbox
                    images={lightbox.images}
                    index={lightbox.index}
                    title={lightbox.title}
                    onClose={() => setLightbox(null)}
                    onNavigate={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
                />
            )}
        </div>
    );
}
