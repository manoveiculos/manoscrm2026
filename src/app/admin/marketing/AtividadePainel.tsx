'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RunRow, STATUS_STYLE, decisaoTexto, formatBRL, getSquadInfo, metricLabel, parseRefUrl, timeAgo } from './utils';

/** Linha do tempo das execuções, com filtro "Só erros" e detalhe ao clicar. */
export function AtividadePainel({ runs, className = '' }: { runs: RunRow[]; className?: string }) {
    const [expanded, setExpanded] = useState<string | null>(null);
    const [filtroAtividade, setFiltroAtividade] = useState<'todas' | 'erros'>('todas');
    return (
        <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 ${className}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-bold">Atividade recente</h2>
                <div className="flex gap-1 text-xs" role="group" aria-label="Filtrar atividade">
                    {(['todas', 'erros'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFiltroAtividade(f)}
                            aria-pressed={filtroAtividade === f}
                            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${filtroAtividade === f ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            {f === 'todas' ? 'Tudo' : 'Só erros'}
                        </button>
                    ))}
                </div>
            </div>
            {runs.length === 0 ? (
                <p className="text-sm text-zinc-400">Nenhuma execução registrada ainda. Assim que os agentes começarem a rodar, elas aparecem aqui.</p>
            ) : runs.filter((r) => filtroAtividade === 'todas' || r.status === 'error').length === 0 ? (
                <p className="text-sm text-zinc-400">Nenhum erro nas últimas execuções.</p>
            ) : (
                <div className="space-y-1.5 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {runs.filter((r) => filtroAtividade === 'todas' || r.status === 'error').map((run) => {
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
                                            <span className="text-xs font-bold" style={{ color: info.color }}>{info.label}</span>
                                            {run.skill_name && <span className="text-xs text-zinc-500">· {run.skill_name}</span>}
                                            <span className={`text-xs ${st.text}`}>· {st.label}</span>
                                            <span className="text-xs text-zinc-500 ml-auto">{timeAgo(run.created_at)}</span>
                                        </div>
                                        <p className="text-sm leading-snug truncate">{run.title}</p>
                                    </div>
                                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isOpen && (
                                    <div className="px-2 pb-3 pl-6 text-xs text-zinc-400 space-y-1.5">
                                        {run.summary && <p className="leading-snug">{run.summary}</p>}
                                        {run.error_message && <p className="text-red-400">Erro: {run.error_message}</p>}
                                        {run.rejected_reason && <p className="text-zinc-500">Motivo da rejeição: {run.rejected_reason}</p>}
                                        {metricEntries.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {metricEntries.map(([k, v]) => (
                                                    <span key={k} className="font-mono bg-black/30 border border-white/[0.06] rounded px-1.5 py-0.5 text-xs">
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
                                        {decisaoTexto(run) && (
                                            <p className="text-zinc-500">{decisaoTexto(run)}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
