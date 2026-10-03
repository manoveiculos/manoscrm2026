'use client';

import { useCallback, useEffect, useState } from 'react';
import { Swords, TrendingDown, TrendingUp, Minus, ExternalLink, Sparkles } from 'lucide-react';

const POS: Record<string, { label: string; chip: string; icon: React.ReactNode }> = {
    abaixo: { label: 'Abaixo do mercado', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: <TrendingDown className="w-3 h-3" /> },
    na_media: { label: 'No alvo do mercado', chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30', icon: <Minus className="w-3 h-3" /> },
    acima: { label: 'Acima do mercado', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: <TrendingUp className="w-3 h-3" /> },
};

const brl = (v?: number | null) => (v == null ? '—' : 'R$ ' + Math.round(v).toLocaleString('pt-BR'));
const short = (s: string) => s.replace(/\s+/g, ' ').replace(/\s-\s(?=\w+\s-\s\d{4}\/\d{4}$)/, ' · ');
const quando = (iso?: string | null) => {
    if (!iso) return '';
    const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
    return h < 1 ? 'agora há pouco' : `há ${h}h`;
};

export default function RadarMercado({ authId }: { authId: string | null }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [todos, setTodos] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/dashboard/mercado?authId=${authId || ''}`, { cache: 'no-store' });
            const json = await res.json();
            if (json.success) setData(json);
        } catch { /* silencioso */ } finally { setLoading(false); }
    }, [authId]);

    useEffect(() => {
        load();
        const t = setInterval(load, 10 * 60_000);
        return () => clearInterval(t);
    }, [load]);

    if (loading) return null;
    // Sem dado fresco (agente falhou / ainda não rodou): não mostra nada em vez de mostrar dado velho.
    if (!data || !data.atualizado_em) return null;

    const isGer = data.view === 'gerencia';
    const r = data.resumo || {};
    const itens: any[] = data.itens || [];
    const lista = todos ? itens : itens.slice(0, 6);

    return (
        <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Swords className="w-5 h-5 text-rose-400" /> Radar de Mercado
                    <span className="text-xs font-normal text-zinc-500">carros disputando cliente na região · atualizado {quando(data.atualizado_em)}</span>
                </h2>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20">{r.em_disputa || 0} em disputa</span>
                    <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{r.abaixo || 0} abaixo</span>
                    <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20">{r.na_media || 0} no alvo</span>
                    <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">{r.acima || 0} acima</span>
                    <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700">{r.exclusivos || 0} sem concorrente</span>
                </div>
            </div>

            {itens.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-zinc-500">
                    Nenhum carro nosso com concorrente direto na região hoje.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lista.map((it) => {
                        const p = POS[it.posicao] || POS.na_media;
                        return (
                            <div key={it.id} className={`rounded-2xl border p-4 ${it.em_disputa ? 'border-rose-500/30 bg-rose-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-zinc-100 leading-snug">{short(it.nome)}</div>
                                        <div className="text-[11px] text-zinc-500 mt-0.5">
                                            {Number(it.km).toLocaleString('pt-BR')} km · {it.n_concorrentes} concorrente(s) comparável(is){it.n_lojas ? ` · ${it.n_lojas} de loja` : ''}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-base font-black text-white">{brl(it.preco)}</div>
                                        <div className="text-[10px] text-zinc-500">mediana {brl(it.mediana)}</div>
                                    </div>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.chip}`}>{p.icon} {p.label}{typeof it.gap_pct === 'number' ? ` (${it.gap_pct > 0 ? '+' : ''}${it.gap_pct}%)` : ''}</span>
                                    {it.em_disputa && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-300">EM DISPUTA</span>}
                                </div>

                                {it.argumentos.length > 0 && (
                                    <div className="mt-3">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> Por que ganhamos</div>
                                        <ul className="space-y-1">
                                            {it.argumentos.slice(0, 3).map((a: string, i: number) => (
                                                <li key={i} className="text-[12px] text-zinc-300 leading-snug">• {a}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <p className="mt-2 text-[12px] text-amber-300/90 leading-snug">
                                    {isGer ? `Ação: ${it.acao || it.dica}` : it.dica}
                                </p>

                                {it.concorrentes.length > 0 && (
                                    <details className="mt-2 group">
                                        <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300 select-none">Ver concorrentes</summary>
                                        <ul className="mt-1.5 space-y-1">
                                            {it.concorrentes.map((c: any, i: number) => (
                                                <li key={i} className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                                                    <span className="truncate">{brl(c.preco)} · {Number(c.km || 0).toLocaleString('pt-BR')} km · {c.ano} · {c.tipo === 'pf' ? 'particular' : 'loja'}{c.mesma_versao ? ' · mesma versão' : ''}</span>
                                                    {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline shrink-0 inline-flex items-center gap-0.5">ver <ExternalLink className="w-3 h-3" /></a>}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {itens.length > 6 && (
                <button onClick={() => setTodos(!todos)} className="mt-3 text-xs font-bold text-zinc-400 hover:text-white transition-colors">
                    {todos ? 'Mostrar menos' : `Ver todos (${itens.length})`}
                </button>
            )}
        </section>
    );
}
