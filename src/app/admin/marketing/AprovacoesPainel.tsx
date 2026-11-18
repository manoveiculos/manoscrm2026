'use client';

import { AlertTriangle, CheckCircle2, Clock, Eye, ImageOff, Loader2, Maximize2, XCircle } from 'lucide-react';
import { MidiaBadge, LogResumo, statusMidia } from './MidiaStatus';
import { RunRow, formatBRL, getSquadInfo, parseRefUrl, timeAgo } from './utils';

/** Fila "Aguardando aprovação": decisão humana sobre o que os squads geraram. */
export function AprovacoesPainel({ pendentes, busyId, onDecide, onAbrirImagens, className = '' }: {
    pendentes: RunRow[];
    busyId: string | null;
    onDecide: (runId: string, action: 'approve' | 'reject') => void;
    onAbrirImagens: (l: { images: string[]; index: number; title: string }) => void;
    className?: string;
}) {
    const totalPending = pendentes.length;
    return (
        <div id="aprovacoes" className={`scroll-mt-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 ${className}`}>
            <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Aguardando aprovação
                {totalPending > 0 && <span className="text-xs font-black bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">{totalPending}</span>}
            </h2>
            {totalPending === 0 ? (
                <p className="text-xs text-zinc-500">Nada esperando decisão agora.</p>
            ) : (
                <div className="space-y-3 max-h-[720px] overflow-y-auto custom-scrollbar">
                    {pendentes.map((run) => {
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
                                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
                                    <span style={{ color: info.color }} className="font-bold">{info.label}</span>
                                    <span>·</span>
                                    <span>{timeAgo(run.created_at)}</span>
                                    {temArteGerada && (
                                        pronto ? (
                                            <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                                                <CheckCircle2 className="w-2.5 h-2.5" /> pronto p/ publicar
                                            </span>
                                        ) : (
                                            <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full" title="Sem imagens_publicas no metrics — o Publisher vai bloquear essa pauta ate a Vitrine reprocessar.">
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
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">
                                                    <Eye className="w-2.5 h-2.5" /> Diretor de Arte aprovou
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full" title={typeof problemasVisuais === 'string' ? problemasVisuais : JSON.stringify(problemasVisuais)}>
                                                    <AlertTriangle className="w-2.5 h-2.5" /> Diretor de Arte reprovou
                                                </span>
                                            )
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded-full">
                                                <Clock className="w-2.5 h-2.5" /> aguardando revisão do Diretor de Arte
                                            </span>
                                        )}
                                        {visualRevisado && !visualAprovado && problemasVisuais && (
                                            <p className="text-xs text-red-400/90 mt-1 leading-snug">
                                                {Array.isArray(problemasVisuais) ? problemasVisuais.join(' • ') : String(problemasVisuais)}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {imagens.length > 0 && (
                                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                                        {imagens.slice(0, 6).map((url, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => onAbrirImagens({ images: imagens, index: i, title: run.title })}
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
                                    <p className="text-xs text-zinc-300 mt-2 leading-snug bg-black/40 border border-white/[0.06] rounded-lg p-2 whitespace-pre-wrap max-h-24 overflow-y-auto custom-scrollbar">{caption}</p>
                                )}

                                {(proposta || fipe) && (
                                    <p className="text-xs text-emerald-400 mt-1.5 font-mono">
                                        {proposta && <>Proposta: {proposta}</>}{proposta && fipe && ' · '}{fipe && <>FIPE: {fipe}</>}
                                    </p>
                                )}
                                {outRef.text && (
                                    outRef.isUrl ? (
                                        <a href={outRef.href} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline block mt-1">Ver resultado →</a>
                                    ) : (
                                        <p className="text-xs text-zinc-400 mt-1 truncate" title={outRef.text}>Resultado: {outRef.text}</p>
                                    )
                                )}
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
