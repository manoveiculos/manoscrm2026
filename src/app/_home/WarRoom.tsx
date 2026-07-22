'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Trophy, XCircle, Users, AlertTriangle, Inbox, Zap, Pause,
    Flame, Clock, UserCheck, CheckCircle2, MessageSquare, Bot,
    TrendingUp, ArrowRight, ChevronRight, CalendarClock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SEV: Record<string, { ring: string; dot: string; text: string }> = {
    critico: { ring: 'border-red-500/30 bg-red-500/5', dot: 'bg-red-500', text: 'text-red-400' },
    aviso: { ring: 'border-amber-500/30 bg-amber-500/5', dot: 'bg-amber-500', text: 'text-amber-400' },
    info: { ring: 'border-blue-500/25 bg-blue-500/5', dot: 'bg-blue-500', text: 'text-blue-400' },
    ok: { ring: 'border-emerald-500/25 bg-emerald-500/5', dot: 'bg-emerald-500', text: 'text-emerald-400' },
};
const ACTION_ICON: Record<string, React.ReactNode> = {
    inbox: <Inbox className="w-4 h-4" />, user: <Users className="w-4 h-4" />, flame: <Flame className="w-4 h-4" />,
    clock: <Clock className="w-4 h-4" />, x: <XCircle className="w-4 h-4" />, check: <CheckCircle2 className="w-4 h-4" />,
};

export default function WarRoom({ authId }: { authId: string | null }) {
    const supabase = useMemo(() => createClient(), []);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(false);
    const [aiPaused, setAiPaused] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/dashboard/home?authId=${authId || ''}`, { cache: 'no-store' });
            const json = await res.json();
            if (json.success) { setData(json); setAiPaused(json.ai_paused); }
        } catch { /* silencioso */ } finally { setLoading(false); }
    }, [authId]);

    // Carga inicial + polling 30s + refetch ao focar a aba + realtime leve
    useEffect(() => {
        load();
        const interval = setInterval(load, 30_000);
        const onVis = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVis);
        const channel = supabase.channel('warroom_home')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_manos_crm' }, load)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_distribuicao_crm_26' }, load)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, load)
            .subscribe((s: any) => setLive(s === 'SUBSCRIBED'));
        return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(channel); };
    }, [load, supabase]);

    const toggleAi = async () => {
        const next = !aiPaused;
        setAiPaused(next);
        await supabase.from('system_settings').update({ ai_paused: next, updated_at: new Date().toISOString() }).eq('id', 'global');
    };

    if (loading) {
        return <div className="flex items-center justify-center min-h-[60vh]"><Zap className="w-8 h-8 text-blue-500 animate-pulse" /></div>;
    }

    const isGer = data?.view === 'gerencia';
    const k = data?.kpis || {};

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-7 pb-20">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-2">
                        War Room <span className="text-sm font-normal text-zinc-500">v5.0</span>
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'}`} />
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                            {isGer ? 'Painel da loja — tempo real' : `Oi ${data?.nome || ''} — seu painel`}
                        </span>
                    </div>
                </div>
                <div className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${aiPaused ? 'bg-red-950/20 border-red-900/50' : 'bg-emerald-950/20 border-emerald-900/50'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${aiPaused ? 'bg-red-500' : 'bg-emerald-500'} text-white`}>
                            {aiPaused ? <Pause size={18} /> : <Zap size={18} />}
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Inteligência SDR</div>
                            <div className={`text-sm font-bold ${aiPaused ? 'text-red-400' : 'text-emerald-400'}`}>{aiPaused ? 'IA PAUSADA' : 'IA OPERANDO 24/7'}</div>
                        </div>
                    </div>
                    <button onClick={toggleAi} className={`px-4 py-2 rounded-xl font-black text-xs transition-all active:scale-95 ${aiPaused ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                        {aiPaused ? 'REATIVAR' : 'PAUSAR'}
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className={`grid grid-cols-2 ${isGer ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
                <Kpi label={isGer ? 'Ganhos hoje' : 'Ganhei hoje'} value={k.ganhos_hoje} icon={<Trophy className="w-5 h-5 text-emerald-400" />} color="text-emerald-400" bg="bg-emerald-500/5" border="border-emerald-500/20" />
                <Kpi label={isGer ? 'Perdas hoje' : 'Perdi hoje'} value={k.perdas_hoje} icon={<XCircle className="w-5 h-5 text-red-400" />} color="text-red-400" bg="bg-red-500/5" border="border-red-500/20" />
                <Kpi label={isGer ? 'Em atendimento' : 'Minha fila'} value={isGer ? k.fila_ativa : k.fila} icon={<Users className="w-5 h-5 text-blue-400" />} color="text-blue-400" bg="bg-blue-500/5" border="border-blue-500/20" />
                <Kpi label="Leads quentes" value={k.sla_critico} icon={<Flame className="w-5 h-5 text-orange-400" />} color="text-orange-400" bg="bg-orange-500/5" border="border-orange-500/20" pulse={k.sla_critico > 0} />
                {isGer && <Kpi label="Esfriando +8h" value={k.esfriando} icon={<Clock className="w-5 h-5 text-amber-400" />} color="text-amber-400" bg="bg-amber-500/5" border="border-amber-500/20" pulse={k.esfriando > 0} />}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUNA PRINCIPAL: PAINEL DE AÇÃO + (ranking | foco) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* PAINEL DE AÇÃO */}
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3"><Zap className="w-5 h-5 text-amber-400" /> O que fazer agora</h2>
                        {/* Agenda de visitas — a nova meta é visita marcada */}
                        <a href="/agenda" className="flex items-center gap-3 p-3.5 mb-2 rounded-2xl border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 transition-colors">
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-red-400 bg-black/20"><CalendarClock className="w-4 h-4" /></span>
                            <div className="flex-1 min-w-0">
                                {isGer ? (
                                    (data?.agenda?.hoje || 0) > 0 ? (
                                        <>
                                            <div className="text-sm font-bold text-zinc-100">{data.agenda.hoje} visita(s) hoje · {data.agenda.loja} na loja · {data.agenda.externa} externa(s)</div>
                                            <div className="text-[12px] text-amber-400">{data.agenda.sem_confirmacao} sem confirmação — cobrar o time pra confirmar.</div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-sm font-bold text-zinc-100">Nenhuma visita agendada na loja hoje</div>
                                            <div className="text-[12px] text-zinc-500">Toda conversa tem que virar visita. Cobre o time.</div>
                                        </>
                                    )
                                ) : (
                                    (data?.agenda?.hoje || 0) + (data?.agenda?.amanha || 0) > 0 ? (
                                        <>
                                            <div className="text-sm font-bold text-zinc-100">Você tem {data.agenda.hoje} visita(s) hoje e {data.agenda.amanha} amanhã</div>
                                            <div className="text-[12px] text-zinc-500">Confirme cada uma e não deixe faltar.</div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-sm font-bold text-zinc-100">Nenhuma visita agendada</div>
                                            <div className="text-[12px] text-zinc-500">Toda conversa tem que virar visita — bora agendar.</div>
                                        </>
                                    )
                                )}
                            </div>
                            <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />
                        </a>
                        <div className="space-y-2">
                            {(data?.acoes || []).map((a: any, i: number) => {
                                const s = SEV[a.sev] || SEV.info;
                                return (
                                    <div key={i} className={`flex items-center gap-3 p-3.5 rounded-2xl border ${s.ring}`}>
                                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.text} bg-black/20`}>{ACTION_ICON[a.icon] || <AlertTriangle className="w-4 h-4" />}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-zinc-100">{a.titulo}</div>
                                            <div className="text-[12px] text-zinc-500">{a.detalhe}</div>
                                        </div>
                                        {a.cta && <a href={a.cta.href} className="shrink-0 text-[11px] font-black px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center gap-1">{a.cta.label}<ArrowRight className="w-3 h-3" /></a>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* GERÊNCIA: RANKING */}
                    {isGer && (
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3"><Users className="w-5 h-5 text-blue-400" /> Consultores</h2>
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="text-zinc-500 text-[10px] uppercase tracking-wider">
                                        <tr>
                                            <th className="text-left px-4 py-2.5">Consultor</th>
                                            <th className="text-right px-2 py-2.5">Fila</th>
                                            <th className="text-right px-2 py-2.5">Quentes</th>
                                            <th className="text-right px-2 py-2.5">Esfriando</th>
                                            <th className="text-right px-2 py-2.5">Mexidos hoje</th>
                                            <th className="text-right px-4 py-2.5">Vendas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(data?.ranking || []).map((r: any) => (
                                            <tr key={r.id} className="border-t border-zinc-800/80">
                                                <td className="px-4 py-2.5 font-semibold text-white">{r.nome}</td>
                                                <td className="px-2 py-2.5 text-right text-zinc-300">{r.fila}</td>
                                                <td className={`px-2 py-2.5 text-right font-semibold ${r.quentes > 0 ? 'text-orange-400' : 'text-zinc-600'}`}>{r.quentes || '—'}</td>
                                                <td className={`px-2 py-2.5 text-right ${r.esfriando > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>{r.esfriando || '—'}</td>
                                                <td className={`px-2 py-2.5 text-right ${r.mexidos_hoje === 0 && r.fila > 0 ? 'text-red-400 font-semibold' : 'text-zinc-300'}`}>{r.mexidos_hoje}</td>
                                                <td className="px-4 py-2.5 text-right font-bold text-emerald-400">{r.vendas_hoje || '—'}</td>
                                            </tr>
                                        ))}
                                        {(data?.ranking || []).length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-600 text-xs">Sem consultores ativos.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* CONSULTOR: FOCO DE HOJE */}
                    {!isGer && (
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3"><TrendingUp className="w-5 h-5 text-emerald-400" /> Seu foco de hoje</h2>
                            <div className="space-y-2">
                                {(data?.foco || []).length === 0 ? (
                                    <div className="p-6 text-center text-zinc-600 border-2 border-dashed border-zinc-900 rounded-2xl text-sm">Nada urgente na sua fila. 👊</div>
                                ) : (data.foco.map((f: any) => (
                                    <a key={f.uid} href="/inbox" className="flex items-center gap-3 p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 transition-colors group">
                                        <span className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0 font-black text-xs">{f.ai_score || '·'}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-zinc-100 truncate">{f.nome}{f.veiculo ? <span className="text-zinc-500 font-normal"> · {f.veiculo}</span> : ''}</div>
                                            <div className="text-[12px] text-amber-400">{f.motivo}</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
                                    </a>
                                )))}
                            </div>
                        </div>
                    )}
                </div>

                {/* SIDEBAR: CTA + ATIVIDADE REAL */}
                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-2xl shadow-blue-900/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-white font-black text-lg mb-2">{isGer ? 'Bora cobrar o time?' : 'Bora vender?'}</h3>
                            <p className="text-blue-100 text-sm mb-5 leading-relaxed">
                                {isGer
                                    ? `${k.esfriando} leads esfriando e ${k.fila_ativa} em atendimento na loja agora.`
                                    : `Você tem ${k.fila} na fila e ${k.sla_critico} quente(s).`}
                            </p>
                            <a href="/inbox" className="block w-full bg-white text-blue-600 text-center py-3 rounded-xl font-black shadow-lg hover:scale-105 transition-transform active:scale-95">ABRIR INBOX AGORA</a>
                        </div>
                        <Zap className="absolute -bottom-8 -right-8 w-40 h-40 text-white/10 rotate-12" />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest">Atividade real</h3>
                            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-1 rounded font-bold">48h</span>
                        </div>
                        <div className="space-y-2">
                            <AnimatePresence mode="popLayout">
                                {(data?.atividade || []).length === 0 ? (
                                    <div className="p-6 text-center text-zinc-600 border-2 border-dashed border-zinc-900 rounded-2xl text-sm">Sem atividade nas últimas 48h.</div>
                                ) : (data.atividade.map((act: any) => (
                                    <motion.div key={act.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                                        className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-xl flex items-center gap-3">
                                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ACT_STYLE(act.tipo).bg} ${ACT_STYLE(act.tipo).fg}`}>{ACT_STYLE(act.tipo).icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-semibold text-zinc-200 truncate">{act.texto}</div>
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-tight">{new Date(act.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    </motion.div>
                                )))}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ACT_STYLE(tipo: string): { bg: string; fg: string; icon: React.ReactNode } {
    switch (tipo) {
        case 'mensagem_in': return { bg: 'bg-blue-500/10', fg: 'text-blue-400', icon: <MessageSquare size={15} /> };
        case 'mensagem_out': return { bg: 'bg-zinc-700/30', fg: 'text-zinc-300', icon: <UserCheck size={15} /> };
        case 'ia': return { bg: 'bg-violet-500/10', fg: 'text-violet-400', icon: <Bot size={15} /> };
        case 'venda': return { bg: 'bg-emerald-500/10', fg: 'text-emerald-400', icon: <Trophy size={15} /> };
        default: return { bg: 'bg-zinc-700/30', fg: 'text-zinc-300', icon: <MessageSquare size={15} /> };
    }
}

function Kpi({ label, value, icon, color, bg, border, pulse }: { label: string; value: number; icon: React.ReactNode; color: string; bg: string; border: string; pulse?: boolean }) {
    return (
        <div className={`p-4 rounded-2xl border ${bg} ${border} relative overflow-hidden`}>
            <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
                {icon}
            </div>
            <div className={`text-3xl font-black ${color}`}>{value ?? 0}</div>
            {pulse && (
                <div className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                </div>
            )}
        </div>
    );
}
