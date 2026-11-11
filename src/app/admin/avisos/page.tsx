'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { rotuloTipo, type AvisoRegistro, type ResumoSemana } from '@/lib/avisos/historico';

interface Resposta {
    success: boolean; error?: string;
    semana: ResumoSemana;
    anteriores: { inicio: string; total: number; falhas: number; cobrancas: number }[];
    avisos: AvisoRegistro[]; totalFiltrado: number;
}

const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso));
const hora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(',', '');
const dataISO = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * /admin/avisos — tudo que o CRM mandou aos consultores (lead novo, cobrança, cliente pediu humano…),
 * semana a semana, com resumo por consultor e planilha para a reunião.
 */
export default function AvisosPage() {
    const [semanaRef, setSemanaRef] = useState<string>(() => dataISO(new Date()));
    const [consultor, setConsultor] = useState('');
    const [tipo, setTipo] = useState('');
    const [status, setStatus] = useState('');
    const [dados, setDados] = useState<Resposta | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const consulta = useMemo(() => {
        const p = new URLSearchParams({ semana: semanaRef });
        if (consultor) p.set('consultor', consultor);
        if (tipo) p.set('tipo', tipo);
        if (status) p.set('status', status);
        return p;
    }, [semanaRef, consultor, tipo, status]);

    const carregar = useCallback(async () => {
        setCarregando(true); setErro(null);
        try {
            const r = await fetch(`/api/admin/avisos?${consulta}`, { cache: 'no-store' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.success) { setErro(j.error || 'Não foi possível carregar.'); setDados(null); }
            else setDados(j as Resposta);
        } catch { setErro('Sem conexão.'); } finally { setCarregando(false); }
    }, [consulta]);
    useEffect(() => { void carregar(); }, [carregar]);

    const mover = (semanas: number) => {
        const d = new Date(`${semanaRef}T12:00:00-03:00`);
        d.setUTCDate(d.getUTCDate() + semanas * 7);
        setSemanaRef(dataISO(d));
    };
    const csv = `/api/admin/avisos?${new URLSearchParams({ ...Object.fromEntries(consulta), formato: 'csv' })}`;
    const s = dados?.semana;
    const consultores = s?.porConsultor.map(c => c.consultor) ?? [];
    const tipos = s ? Object.keys(s.porTipo) : [];
    const max = Math.max(1, ...(dados?.anteriores.map(a => a.total) ?? [0]), s?.total ?? 0);

    return (
        <div className="w-full max-w-6xl mx-auto px-4 py-6 space-y-5">
            <header className="flex flex-wrap items-center gap-3">
                <span className="h-11 w-11 rounded-2xl bg-sky-500/15 text-sky-300 flex items-center justify-center"><Megaphone size={22} /></span>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-black text-white leading-tight">Avisos e cobranças</h1>
                    <p className="text-[12px] text-white/50">Tudo que o CRM mandou aos consultores pelo WhatsApp, guardado para a reunião semanal.</p>
                </div>
                <button type="button" onClick={() => void carregar()} aria-label="Atualizar" className="h-11 w-11 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/70"><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></button>
                <a href={csv} className="min-h-[44px] rounded-xl bg-white text-black px-4 text-[13px] font-black flex items-center gap-2"><Download size={15} /> Baixar planilha</a>
            </header>

            <div className="flex items-center gap-2">
                <button type="button" onClick={() => mover(-1)} aria-label="Semana anterior" className="h-11 w-11 rounded-xl bg-white/[0.06] flex items-center justify-center"><ChevronLeft size={18} /></button>
                <p className="flex-1 text-center text-[14px] font-black text-white">
                    {s ? `Semana de ${dia(s.inicio)} a ${dia(new Date(Date.parse(s.fim) - 1).toISOString())}` : '…'}
                </p>
                <button type="button" onClick={() => mover(1)} aria-label="Próxima semana" className="h-11 w-11 rounded-xl bg-white/[0.06] flex items-center justify-center"><ChevronRight size={18} /></button>
            </div>

            {erro && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-100">{erro}</p>}
            {carregando && !dados && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/40" /></div>}

            {dados && s && (<>
                <section className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="Resumo da semana">
                    {[
                        ['Avisos enviados', s.enviados, 'text-white'],
                        ['Cobranças', s.cobrancas, 'text-amber-300'],
                        ['Falharam', s.falhas, s.falhas ? 'text-red-300' : 'text-white/60'],
                        ['Consultores avisados', s.porConsultor.length, 'text-sky-300'],
                    ].map(([rot, n, cor]) => (
                        <div key={String(rot)} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                            <p className={`text-3xl font-black tabular-nums ${cor}`}>{n as number}</p>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-white/45 mt-1">{rot as string}</p>
                        </div>
                    ))}
                </section>

                <section className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <h2 className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-3">Por consultor</h2>
                        {s.porConsultor.length === 0 && <p className="text-[13px] text-white/40">Nenhum aviso nesta semana.</p>}
                        <ul className="space-y-2">
                            {s.porConsultor.map(c => (
                                <li key={c.consultor} className="text-[13px]">
                                    <button type="button" onClick={() => setConsultor(consultor === c.consultor ? '' : c.consultor)} className={`w-full text-left rounded-xl px-3 py-2 min-h-[44px] ${consultor === c.consultor ? 'bg-sky-500/15' : 'bg-white/[0.03]'}`}>
                                        <span className="flex items-center justify-between"><strong className="text-white">{c.consultor}</strong><span className="tabular-nums text-white/70">{c.total}{c.falhas ? <span className="text-red-300"> · {c.falhas} falha(s)</span> : null}</span></span>
                                        <span className="block text-[11px] text-white/45">{Object.entries(c.porTipo).map(([t, n]) => `${rotuloTipo(t)} ${n}`).join(' · ')}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <h2 className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-3">Últimas semanas (total de avisos)</h2>
                        <ul className="space-y-1.5">
                            {[{ inicio: s.inicio, total: s.total, cobrancas: s.cobrancas, falhas: s.falhas }, ...dados.anteriores].map((a, i) => (
                                <li key={a.inicio} className="flex items-center gap-2 text-[12px]">
                                    <span className={`w-12 tabular-nums ${i === 0 ? 'font-black text-white' : 'text-white/50'}`}>{dia(a.inicio)}</span>
                                    <span className="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden"><span className={`block h-full rounded-full ${i === 0 ? 'bg-sky-400' : 'bg-white/30'}`} style={{ width: `${(a.total / max) * 100}%` }} /></span>
                                    <span className="w-24 text-right tabular-nums text-white/60">{a.total} · {a.cobrancas} cobr.</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <h2 className="text-[11px] font-black uppercase tracking-widest text-white/45 mr-auto">Tudo que foi enviado · {dados.totalFiltrado}</h2>
                        {([['Consultor', consultor, setConsultor, consultores.map(c => [c, c])], ['Tipo', tipo, setTipo, tipos.map(t => [t, rotuloTipo(t)])], ['Situação', status, setStatus, [['enviado', 'Enviado'], ['falhou', 'Falhou']]]] as const).map(([rot, val, set, ops]) => (
                            <label key={rot} className="text-[12px] text-white/55 flex items-center gap-1.5">
                                {rot}
                                <select value={val} onChange={(e) => set(e.target.value)} className="min-h-[40px] rounded-xl bg-white/[0.06] border border-white/[0.08] px-2 text-white">
                                    <option value="">Todos</option>
                                    {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                            </label>
                        ))}
                    </div>
                    <ul className="space-y-2">
                        {dados.avisos.length === 0 && <li className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-center text-[13px] text-white/40">Nenhum aviso com esses filtros.</li>}
                        {dados.avisos.map(a => (
                            <li key={a.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                                    <strong className="text-white">{a.consultorNome}</strong>
                                    <span className="rounded-full bg-white/[0.08] px-2 py-px text-[11px] font-bold text-white/70">{rotuloTipo(a.tipo)}</span>
                                    {a.status === 'falhou' && <span className="rounded-full bg-red-500/20 px-2 py-px text-[11px] font-bold text-red-200">Falhou{a.erro ? `: ${a.erro}` : ''}</span>}
                                    <span className="ml-auto tabular-nums text-white/40">{hora(a.criadoEm)}</span>
                                </p>
                                <p className="mt-1.5 text-[13px] text-white/75 whitespace-pre-line break-words">{a.mensagem}</p>
                                {a.leadRef && <p className="mt-1 text-[11px] text-white/35">Lead {a.leadRef}</p>}
                            </li>
                        ))}
                    </ul>
                    {dados.totalFiltrado > dados.avisos.length && <p className="mt-2 text-center text-[12px] text-white/40">Mostrando {dados.avisos.length} de {dados.totalFiltrado}. A planilha leva todos.</p>}
                </section>
            </>)}
        </div>
    );
}
