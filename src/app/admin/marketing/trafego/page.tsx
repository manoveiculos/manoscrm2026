'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flame, Loader2, RefreshCw, TriangleAlert, UserCheck, Users } from 'lucide-react';
import { ORIGEM_ROTULO, TEMPERATURA_ROTULO, type ResumoTrafego } from '@/lib/trafego/resumo';

/**
 * Tráfego Pago: o painel /admin/trafego do site novo (manosveiculoscompra.com), dentro do CRM.
 * Lê trafego_eventos / trafego_visitantes — o mesmo Supabase do site. Só leitura.
 */

const PERIODOS = [{ d: 1, r: 'Hoje' }, { d: 7, r: '7 dias' }, { d: 30, r: '30 dias' }];
const COR_TEMP: Record<string, string> = {
    muito_quente: 'bg-red-500/15 text-red-300 border-red-500/30',
    quente: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    morno: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    frio: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
};
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}min ${s % 60}s` : `${s}s`);
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const reais = (n: number | null) => (n ? `R$ ${n.toLocaleString('pt-BR')}` : '');

export default function TrafegoPagoPage() {
    const [dias, setDias] = useState(7);
    const [dados, setDados] = useState<ResumoTrafego | null>(null);
    const [vazio, setVazio] = useState(false);
    const [truncado, setTruncado] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await fetch(`/api/admin/trafego?dias=${dias}`, { cache: 'no-store' });
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'erro');
            setDados(j.resumo); setVazio(Boolean(j.vazio)); setTruncado(Boolean(j.truncado)); setErro(null);
        } catch (e) { setErro(e instanceof Error ? e.message : 'erro ao carregar'); } finally { setCarregando(false); }
    }, [dias]);
    useEffect(() => { carregar(); }, [carregar]);

    const t = dados?.totais;
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-400 max-w-2xl">Quem chegou pelos anúncios no site novo, o que olhou e quem já virou lead. Mesma base do painel <span className="text-zinc-200">manosveiculoscompra.com/admin/trafego</span>.</p>
                <div className="flex items-center gap-2">
                    {PERIODOS.map(p => (
                        <button key={p.d} onClick={() => setDias(p.d)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${dias === p.d ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'border-white/10 text-zinc-300 hover:bg-white/5'}`}>{p.r}</button>
                    ))}
                    <button onClick={carregar} aria-label="Atualizar" className="rounded-lg border border-white/10 p-1.5 text-zinc-300 hover:bg-white/5">
                        {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {erro && <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">{erro}</div>}

            {vazio && !erro && !carregando && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 flex gap-3">
                    <TriangleAlert className="w-5 h-5 shrink-0" />
                    <div>
                        <p className="font-medium">Nenhum evento do site no banco neste período.</p>
                        <p className="text-amber-200/80 mt-1">O painel do site guarda os dados em arquivo local. Para o CRM enxergar, o servidor do site precisa da variável <code>SUPABASE_SERVICE_ROLE_KEY</code> e da migration <code>supabase/trafego_inteligencia.sql</code> aplicada. Depois disso os eventos novos aparecem aqui.</p>
                    </div>
                </div>
            )}
            {truncado && <p className="text-xs text-amber-300">Período grande: mostrando só os eventos mais recentes. Escolha um período menor para ver tudo.</p>}

            {t && !vazio && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { r: 'Visitantes', v: t.visitantes, i: Users },
                            { r: 'Quentes', v: t.quentes, i: Flame },
                            { r: 'Identificados', v: t.identificados, i: UserCheck },
                            { r: 'Já no CRM', v: t.noCrm, i: UserCheck },
                        ].map(k => (
                            <div key={k.r} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                                <div className="flex items-center gap-2 text-xs text-zinc-400"><k.i className="w-3.5 h-3.5" />{k.r}</div>
                                <div className="text-2xl font-semibold text-zinc-100 mt-1">{k.v}</div>
                            </div>
                        ))}
                    </div>

                    <section>
                        <h2 className="text-sm font-semibold text-zinc-200 mb-2">Campanhas</h2>
                        <div className="space-y-2">
                            {dados!.campanhas.map(c => (
                                <div key={c.chave} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-xs text-indigo-300 font-semibold uppercase tracking-wide">{ORIGEM_ROTULO[c.origem] || c.origem}</div>
                                            <div className="text-sm font-medium text-zinc-100 truncate">{c.nome}</div>
                                            {c.chave !== 'sem-campanha' && <div className="text-[11px] text-zinc-500">ID {c.chave}</div>}
                                        </div>
                                        <div className="flex gap-4 text-center text-xs text-zinc-400">
                                            <div><div className="text-lg font-semibold text-zinc-100">{c.visitantes}</div>visitantes</div>
                                            <div><div className="text-lg font-semibold text-orange-300">{c.quentes}</div>quentes</div>
                                            <div><div className="text-lg font-semibold text-emerald-300">{c.identificados}</div>leads</div>
                                            <div><div className="text-lg font-semibold text-zinc-100">{dur(c.tempoMedioSeg)}</div>tempo médio</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-zinc-300">
                                        {c.topCarros.map(x => <span key={x.nome} className="rounded-full border border-white/10 px-2 py-0.5">{x.nome} · {x.visitantes}</span>)}
                                        {c.topCidades.map(x => <span key={x.nome} className="rounded-full border border-white/10 px-2 py-0.5 text-zinc-400">{x.nome} · {x.visitantes}</span>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-sm font-semibold text-zinc-200 mb-2">Visitantes quentes</h2>
                        {dados!.visitantesQuentes.length === 0 ? <p className="text-sm text-zinc-500">Ninguém esquentou ainda neste período.</p> : (
                            <div className="space-y-2">
                                {dados!.visitantesQuentes.map(v => (
                                    <div key={v.visitorId} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-sm text-zinc-100">{v.nome || 'Visitante anônimo'}{v.telefone ? <span className="text-zinc-400"> · {v.telefone}</span> : null}</div>
                                            <div className="text-xs text-zinc-400 truncate">{[v.carro && `Viu ${v.carro}`, v.cidade, v.aparelho, `${dur(v.tempoSeg)} no site`].filter(Boolean).join(' · ')}</div>
                                            <div className="text-[11px] text-zinc-500 truncate">{v.campanha} · {quando(v.ultimoEm)}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {v.crmStatus && <span className="text-[11px] text-emerald-300">CRM: {v.crmStatus}</span>}
                                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COR_TEMP[v.temperatura]}`}>{TEMPERATURA_ROTULO[v.temperatura]}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <h2 className="text-sm font-semibold text-zinc-200 mb-2">Carros mais vistos</h2>
                        <div className="rounded-xl border border-white/[0.08] overflow-hidden divide-y divide-white/[0.06]">
                            {dados!.carros.map(c => (
                                <div key={c.nome} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                                    <span className="text-zinc-100 truncate">{c.nome}</span>
                                    <span className="text-xs text-zinc-400 shrink-0">{reais(c.valor)} · {c.visitantes} pessoas · {dur(c.tempoMedioSeg)} em média</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
