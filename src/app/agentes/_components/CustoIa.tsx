'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ROTULO_PERIODO, type Periodo, type ResumoCusto } from '@/lib/agentes/custos';
import { dolar } from './icones';

const PERIODOS: Periodo[] = ['dia', 'semana', 'mes'];
const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Gasto de IA da Central dos Agentes: Hoje · Semana · Mês. Clique no valor para ver por agente e por dia.
 * Busca /api/agentes/custos; sem acesso (prévia fictícia) mostra o valor que a Central já tinha.
 */
export function CustoIa({ custoHojeUsd }: { custoHojeUsd: number }) {
    const [periodo, setPeriodo] = useState<Periodo>('dia');
    const [dados, setDados] = useState<(ResumoCusto & { faltando: string[] }) | null>(null);
    const [erro, setErro] = useState(false);
    const [aberto, setAberto] = useState(false);

    useEffect(() => {
        let vivo = true;
        const carregar = () => fetch(`/api/agentes/custos?periodo=${periodo}`, { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then(j => { if (!vivo) return; if (j?.success) { setDados(j as ResumoCusto & { faltando: string[] }); setErro(false); } else setErro(true); })
            .catch(() => { if (vivo) setErro(true); });
        void carregar();
        const t = setInterval(carregar, 60_000);
        return () => { vivo = false; clearInterval(t); };
    }, [periodo]);

    const valor = dados && dados.periodo === periodo ? dados.total : periodo === 'dia' && erro ? custoHojeUsd : null;
    const max = Math.max(0.0001, ...(dados?.porDia.map(d => d.usd) ?? [0]));

    return (
        <div className="relative flex items-center gap-2 text-[12px] text-white/55">
            <div role="tablist" aria-label="Período do gasto" className="flex items-center rounded-lg border border-white/10 overflow-hidden font-bold">
                {PERIODOS.map(p => (
                    <button key={p} type="button" role="tab" aria-selected={periodo === p} onClick={() => setPeriodo(p)} className={`px-2.5 py-1 ${periodo === p ? 'bg-white/15 text-white' : 'text-white/50'}`}>
                        {ROTULO_PERIODO[p]}
                    </button>
                ))}
            </div>
            <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} className="flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-white/[0.06]" title="Ver por agente e por dia">
                <b className="text-white tabular-nums">{valor == null ? '…' : dolar(valor)}</b> de IA <ChevronDown size={12} className={aberto ? 'rotate-180' : ''} />
            </button>

            {aberto && dados && (
                <div className="absolute right-0 top-full mt-2 z-30 w-[320px] max-w-[90vw] rounded-2xl border border-white/[0.1] bg-[#16161C] p-4 shadow-xl text-white/80">
                    <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-2">{ROTULO_PERIODO[dados.periodo]} · por agente</p>
                    <ul className="space-y-1.5">
                        {dados.porAgente.length === 0 && <li className="text-white/40">Nenhum gasto neste período.</li>}
                        {dados.porAgente.map(a => (
                            <li key={a.agente} className="flex items-center justify-between gap-2">
                                <span className="truncate">{a.rotulo}</span>
                                <span className="tabular-nums text-white">{dolar(a.usd)} <span className="text-white/35">· {a.chamadas}×</span></span>
                            </li>
                        ))}
                    </ul>
                    {dados.porDia.length > 1 && (<>
                        <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mt-4 mb-2">Por dia</p>
                        <ul className="space-y-1">
                            {dados.porDia.map(d => (
                                <li key={d.dia} className="flex items-center gap-2">
                                    <span className="w-10 tabular-nums text-white/50">{dd(d.dia)}</span>
                                    <span className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden"><span className="block h-full rounded-full bg-sky-400" style={{ width: `${(d.usd / max) * 100}%` }} /></span>
                                    <span className="w-16 text-right tabular-nums">{dolar(d.usd)}</span>
                                </li>
                            ))}
                        </ul>
                    </>)}
                    <p className="mt-3 text-[11px] text-white/45">
                        Média: {dolar(dados.mediaDia)}/dia{dados.projecaoMes != null ? ` · projeção do mês: ${dolar(dados.projecaoMes)}` : ''}
                    </p>
                    {dados.faltando.length > 0 && <p className="mt-1 text-[11px] text-amber-300/80">Sem leitura de: {dados.faltando.join(', ')}.</p>}
                </div>
            )}
        </div>
    );
}
