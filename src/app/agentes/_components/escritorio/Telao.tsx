'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CentralAgentes } from '@/lib/agentes/estado';
import type { PainelTelao } from './cena';
import { dolar } from '../icones';

export interface LinhaFeed { id: string; hora: string; agente: string; texto: string; tom: 'ok' | 'erro' | 'espera' | 'novo' | 'rodando'; repeticoes?: number }
export interface Takeover { tipo: 'lead_quente' | 'venda' | 'aprovacao'; titulo: string; sub: string }

type Cena = 'ao_vivo' | 'leads' | 'funil' | 'maestro';
const ROTULO: Record<Cena, string> = { ao_vivo: 'AO VIVO', leads: 'TERMÔMETRO DE LEADS', funil: 'FUNIL E VENDAS', maestro: 'MAESTRO' };
const COR_TOM: Record<LinhaFeed['tom'], string> = { ok: '#9ca3af', erro: '#f87171', espera: '#fb7185', novo: '#fbbf24', rodando: '#34d399' };

const ESTILO_TAKEOVER: Record<Takeover['tipo'], { fundo: string; cor: string; icone: string }> = {
    lead_quente: { fundo: 'linear-gradient(135deg,#7f1d1d,#b91c1c 55%,#450a0a)', cor: '#fecaca', icone: '🔥' },
    venda: { fundo: 'linear-gradient(135deg,#064e3b,#059669 55%,#022c22)', cor: '#a7f3d0', icone: '🎁' },
    aprovacao: { fundo: 'linear-gradient(135deg,#78350f,#d97706 55%,#451a03)', cor: '#fde68a', icone: '✋' },
};

function Confete() {
    // Posições fixas (sem Math.random no render) — pseudo-aleatório determinístico.
    const pecas = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
        x: (i * 137) % 100, atraso: ((i * 53) % 18) / 10, dur: 2.2 + ((i * 29) % 15) / 10,
        cor: ['#fbbf24', '#f87171', '#34d399', '#60a5fa', '#e879f9'][i % 5], w: 6 + (i % 4) * 2,
    })), []);
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {pecas.map((p, i) => (
                <span key={i} className="absolute top-0 block rounded-[1px]" style={{
                    left: `${p.x}%`, width: p.w, height: p.w * 1.6, background: p.cor,
                    animation: `cai ${p.dur}s ${p.atraso}s linear infinite`,
                }} />
            ))}
        </div>
    );
}

function CenaFeed({ linhas }: { linhas: LinhaFeed[] }) {
    return (
        <ol className="space-y-[7px]">
            {linhas.slice(0, 7).map(l => (
                <motion.li key={l.id} layout initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3 items-baseline text-[17px] leading-tight">
                    <span className="tabular-nums w-[52px] shrink-0" style={{ color: '#ffffff55' }}>{l.hora}</span>
                    <span className="h-2 w-2 rounded-full shrink-0 self-center" style={{ background: COR_TOM[l.tom] }} />
                    <span className="truncate text-white/80">
                        <b className="text-white">{l.agente}</b> {l.texto}
                        {l.repeticoes && l.repeticoes > 1 ? <span className="ml-1.5 rounded bg-white/10 px-1.5 text-[13px] text-white/60">×{l.repeticoes}</span> : null}
                    </span>
                </motion.li>
            ))}
        </ol>
    );
}

function CenaLeads({ p }: { p: PainelTelao }) {
    const total = Math.max(1, p.leads.quente + p.leads.morno + p.leads.frio);
    const barras = [
        { r: 'Quentes', n: p.leads.quente, c: '#ef4444' },
        { r: 'Mornos', n: p.leads.morno, c: '#f59e0b' },
        { r: 'Frios', n: p.leads.frio, c: '#38bdf8' },
    ];
    return (
        <div className="space-y-4 pt-1">
            {barras.map(b => (
                <div key={b.r} className="flex items-center gap-4">
                    <span className="w-[100px] text-[19px] font-bold text-white/80">{b.r}</span>
                    <div className="flex-1 h-[26px] rounded-full bg-white/[0.07] overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ background: b.c, boxShadow: `0 0 18px ${b.c}99` }} initial={{ width: 0 }} animate={{ width: `${(b.n / total) * 100}%` }} transition={{ duration: 1.1, ease: 'easeOut' }} />
                    </div>
                    <span className="w-[46px] text-right text-[26px] font-black tabular-nums text-white">{b.n}</span>
                </div>
            ))}
        </div>
    );
}

function CenaFunil({ p }: { p: PainelTelao }) {
    const max = Math.max(1, ...p.funil.map(f => f.n));
    return (
        <div className="flex gap-6 h-full">
            <div className="flex-1 space-y-[9px]">
                {p.funil.map((f, i) => (
                    <div key={f.rotulo} className="flex items-center gap-3">
                        <span className="w-[130px] text-[15px] text-white/65 truncate">{f.rotulo}</span>
                        <div className="flex-1 h-[20px]">
                            <motion.div className="h-full rounded-r-full" style={{ background: `hsl(${350 - i * 6} 80% ${58 - i * 5}%)` }} initial={{ width: 0 }} animate={{ width: `${Math.max(6, (f.n / max) * 100)}%` }} transition={{ duration: 0.9, delay: i * 0.1 }} />
                        </div>
                        <span className="w-8 text-right text-[18px] font-black tabular-nums">{f.n}</span>
                    </div>
                ))}
            </div>
            <div className="w-[190px] rounded-2xl border border-emerald-400/30 bg-emerald-500/10 flex flex-col items-center justify-center">
                <span className="text-[13px] tracking-[0.2em] text-emerald-200/70 font-bold">VENDAS HOJE</span>
                <span className="text-[78px] leading-none font-black text-emerald-300">{p.vendasHoje}</span>
                <span className="text-[14px] text-white/50 mt-1">{p.vendasMes} no mês</span>
            </div>
        </div>
    );
}

function CenaMaestro({ dados }: { dados: CentralAgentes }) {
    const m = dados.maestro;
    const itens = [
        { r: 'Aprovações', n: m.aprovacoes, alerta: m.aprovacoes > 0 },
        { r: 'Sem dono', n: m.conversasSemDono, alerta: m.conversasSemDono > 0 },
        { r: 'Alertas', n: m.alertas, alerta: m.alertas > 0 },
    ];
    return (
        <div className="flex gap-4 items-stretch h-full">
            {itens.map(i => (
                <div key={i.r} className={`flex-1 rounded-2xl border flex flex-col items-center justify-center ${i.alerta ? 'border-red-500/60 bg-red-600/15' : 'border-white/10 bg-white/[0.04]'}`}>
                    <span className={`text-[64px] leading-none font-black ${i.alerta ? 'text-red-300' : 'text-white/80'}`}>{i.n}</span>
                    <span className="text-[14px] tracking-[0.18em] uppercase text-white/55 mt-2 font-bold">{i.r}</span>
                </div>
            ))}
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] flex flex-col items-center justify-center">
                <span className="text-[34px] leading-none font-black text-white/90">{dolar(m.custoHojeUsd)}</span>
                <span className="text-[14px] tracking-[0.18em] uppercase text-white/55 mt-2 font-bold">IA hoje</span>
            </div>
        </div>
    );
}

export function Telao({ dados, painel, linhas, takeover, cenaFixa }: {
    dados: CentralAgentes; painel: PainelTelao | null; linhas: LinhaFeed[]; takeover: Takeover | null; cenaFixa?: number | null;
}) {
    // Sem `painel` (números ainda não existem na API) o telão só mostra cenas reais: ao vivo e maestro.
    const CENAS: Cena[] = painel ? ['ao_vivo', 'leads', 'funil', 'maestro'] : ['ao_vivo', 'maestro'];
    const [i, setI] = useState(0);
    const total = CENAS.length;
    useEffect(() => {
        if (cenaFixa != null || takeover) return;
        const t = setInterval(() => setI(v => (v + 1) % total), 9000);
        return () => clearInterval(t);
    }, [cenaFixa, takeover, total]);
    const cena = CENAS[(cenaFixa ?? i) % total];
    const est = takeover ? ESTILO_TAKEOVER[takeover.tipo] : null;

    return (
        <div className="absolute inset-0 rounded-[22px] p-[10px]" style={{ background: 'linear-gradient(160deg,#2a2a34,#111118)', boxShadow: '0 0 0 2px #3f3f4a, 0 30px 80px -20px #000, 0 0 90px -10px #dc262633' }}>
            <div className="relative h-full w-full rounded-[14px] overflow-hidden px-7 pt-5 pb-4" style={{ background: 'radial-gradient(120% 100% at 50% 0%,#101826,#05080f 70%)' }}>
                <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 4px)' }} />
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 pulso" />
                        <span className="text-[15px] font-black tracking-[0.28em] text-white/85">{ROTULO[cena]}</span>
                    </div>
                    <div className="flex gap-1.5">
                        {CENAS.map((c, k) => <span key={c} className="h-1.5 rounded-full transition-all" style={{ width: k === (cenaFixa ?? i) ? 26 : 8, background: k === (cenaFixa ?? i) ? '#ef4444' : '#ffffff30' }} />)}
                    </div>
                </div>
                <div className="relative h-[198px]">
                    <AnimatePresence mode="wait">
                        <motion.div key={cena} className="absolute inset-0" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
                            {cena === 'ao_vivo' && <CenaFeed linhas={linhas} />}
                            {cena === 'leads' && painel && <CenaLeads p={painel} />}
                            {cena === 'funil' && painel && <CenaFunil p={painel} />}
                            {cena === 'maestro' && <CenaMaestro dados={dados} />}
                        </motion.div>
                    </AnimatePresence>
                </div>

                <AnimatePresence>
                    {takeover && est && (
                        <motion.div key={takeover.titulo + takeover.sub} className="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
                            style={{ background: est.fundo }} initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                            {takeover.tipo === 'venda' && <Confete />}
                            {takeover.tipo === 'lead_quente' && <div aria-hidden className="absolute inset-0 pulso-forte" style={{ boxShadow: 'inset 0 0 90px 10px #ef4444aa' }} />}
                            <span className="text-[64px] leading-none mb-1 balanca">{est.icone}</span>
                            <span className="text-[44px] leading-[1.05] font-black tracking-wide text-white drop-shadow">{takeover.titulo}</span>
                            <span className="text-[24px] mt-2 font-semibold" style={{ color: est.cor }}>{takeover.sub}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
