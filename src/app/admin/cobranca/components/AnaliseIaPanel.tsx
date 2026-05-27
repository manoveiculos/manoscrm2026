'use client';

import { useEffect, useState } from 'react';
import {
    Sparkles, RefreshCw, Copy, CheckCheck, Lightbulb, AlertTriangle,
    Sun, Moon, Coffee, Phone, MessageCircle, Calendar, ArrowRight, Send,
    Printer, History, Share2
} from 'lucide-react';
import { BillingRecord } from '@/types';

interface Prioridade {
    cliente: string;
    telefone: string;
    record_id: string;
    valor: number;
    dias_atraso: number;
    categoria: 'URGENTE_HOJE' | 'FALAR_AGORA' | 'FOLLOWUP_HOJE' | 'MARCAR_AMANHA' | 'ESCALAR_JURIDICO';
    porque: string;
    o_que_fazer: string;
    script_sugerido: string;
    quando_fazer: 'HOJE_MANHA' | 'HOJE_TARDE' | 'AMANHA' | 'EM_3_DIAS' | 'EM_7_DIAS';
    se_nao_responder: string;
}

interface Briefing {
    resumo_dia: string;
    prioridades: Prioridade[];
    alertas: string[];
    dica_do_dia: string;
    _cached?: boolean;
    _cached_at?: string;
}

interface AnaliseIaPanelProps {
    records: BillingRecord[];
    showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const CATEGORIA_CONFIG: Record<Prioridade['categoria'], { label: string; color: string; bg: string; emoji: string }> = {
    URGENTE_HOJE: { label: 'Urgente Hoje', color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/30', emoji: '🔥' },
    FALAR_AGORA: { label: 'Falar Agora', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/30', emoji: '💬' },
    FOLLOWUP_HOJE: { label: 'Follow-up Hoje', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30', emoji: '📅' },
    MARCAR_AMANHA: { label: 'Marcar para Amanhã', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/30', emoji: '⏰' },
    ESCALAR_JURIDICO: { label: 'Escalar Jurídico', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/30', emoji: '⚖️' },
};

const QUANDO_LABEL: Record<Prioridade['quando_fazer'], { label: string; icon: any }> = {
    HOJE_MANHA: { label: 'Hoje de manhã', icon: Coffee },
    HOJE_TARDE: { label: 'Hoje à tarde', icon: Sun },
    AMANHA: { label: 'Amanhã', icon: Moon },
    EM_3_DIAS: { label: 'Em 3 dias', icon: Calendar },
    EM_7_DIAS: { label: 'Em 7 dias', icon: Calendar },
};

function brl(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AnaliseIaPanel({ records, showToast }: AnaliseIaPanelProps) {
    const [briefing, setBriefing] = useState<Briefing | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [copiedScript, setCopiedScript] = useState<number | null>(null);
    const [sendingMsg, setSendingMsg] = useState<number | null>(null);
    const [history, setHistory] = useState<{ date: string; created_at: string }[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [sendingToCamila, setSendingToCamila] = useState(false);
    const todayStr = new Date().toISOString().slice(0, 10);

    const loadHistory = async () => {
        try {
            const res = await fetch('/api/billing/ai-daily-briefing/history');
            if (res.ok) {
                const data = await res.json();
                setHistory(data.history || []);
            }
        } catch {
            // silencioso
        }
    };

    const loadCached = async (date?: string) => {
        setLoading(true);
        try {
            const url = date
                ? `/api/billing/ai-daily-briefing/history?date=${date}`
                : '/api/billing/ai-daily-briefing';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setBriefing(data.briefing);
                setSelectedDate(date || todayStr);
            }
        } catch (e) {
            // silencioso
        } finally {
            setLoading(false);
        }
    };

    const sendToCamila = async () => {
        if (!briefing) return;
        if (!window.confirm(
            'Enviar a análise IA do dia para o WhatsApp da Camila (+55 47 98845-2087)?\n\n' +
            'Vai disparar 1 mensagem de resumo + 1 mensagem para cada prioridade (' + (briefing.prioridades?.length || 0) + ' no total).\n\n' +
            'Intervalo de 1,5s entre cada para não tomar ban.'
        )) return;
        setSendingToCamila(true);
        try {
            const res = await fetch('/api/billing/ai-daily-briefing/send-to-camila', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    briefing,
                    date: selectedDate || todayStr,
                }),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                showToast(`✅ ${data.sent} mensagem(ns) enviada(s) para a Camila${data.failed > 0 ? ` (${data.failed} falharam)` : ''}`, 'success');
            } else {
                showToast(data.error || 'Erro ao enviar para Camila', 'error');
            }
        } catch (e) {
            showToast('Falha ao enviar', 'error');
        } finally {
            setSendingToCamila(false);
        }
    };

    const handlePrint = () => {
        document.body.classList.add('print-briefing');
        setTimeout(() => {
            window.print();
            setTimeout(() => document.body.classList.remove('print-briefing'), 500);
        }, 100);
    };

    const generate = async (force = false) => {
        setGenerating(true);
        try {
            const res = await fetch('/api/billing/ai-daily-briefing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force }),
            });
            const data = await res.json();
            if (res.ok && data.briefing) {
                setBriefing(data.briefing);
                setSelectedDate(todayStr);
                loadHistory();
                showToast(data.cached ? 'Briefing do dia carregado (cache).' : 'Briefing gerado pela IA!', 'success');
            } else {
                showToast(data.error || 'Erro ao gerar briefing', 'error');
            }
        } catch (e) {
            showToast('Falha ao chamar IA', 'error');
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => {
        loadCached();
        loadHistory();
    }, []);

    const copyScript = (script: string, idx: number) => {
        navigator.clipboard.writeText(script);
        setCopiedScript(idx);
        showToast('Script copiado! Cole no WhatsApp.', 'success');
        setTimeout(() => setCopiedScript(null), 2500);
    };

    const sendDirect = async (p: Prioridade, idx: number) => {
        if (!p.telefone) {
            showToast('Sem telefone cadastrado para este cliente', 'error');
            return;
        }
        if (!window.confirm(
            `Enviar mensagem agora para ${p.cliente}?\n\nTelefone: ${p.telefone}\n\nMensagem:\n${p.script_sugerido}`
        )) return;

        setSendingMsg(idx);
        try {
            const res = await fetch('/api/billing/whatsapp-messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telefone: p.telefone,
                    message: p.script_sugerido,
                    recordId: p.record_id,
                }),
            });
            if (res.ok) {
                showToast(`✅ Mensagem enviada para ${p.cliente}!`, 'success');
            } else {
                const err = await res.json();
                showToast(err.error || 'Erro ao enviar', 'error');
            }
        } catch (e) {
            showToast('Falha ao enviar', 'error');
        } finally {
            setSendingMsg(null);
        }
    };

    if (loading) {
        return (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-12 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">Carregando análise IA do dia...</p>
            </div>
        );
    }

    return (
        <div className="space-y-5 briefing-root">
            {/* Print styles */}
            <style jsx global>{`
                @media print {
                    body.print-briefing { background: white !important; color: black !important; }
                    body.print-briefing .no-print { display: none !important; }
                    body.print-briefing .briefing-root,
                    body.print-briefing .briefing-root * {
                        color: black !important;
                        background: white !important;
                        border-color: #ccc !important;
                        box-shadow: none !important;
                    }
                    body.print-briefing .briefing-root .prioridade-card { page-break-inside: avoid; border: 1px solid #999 !important; margin-bottom: 8px; }
                    @page { size: A4; margin: 1.2cm; }
                }
            `}</style>

            {/* Print-only header */}
            <div className="hidden print:block mb-4 pb-3 border-b-2 border-black">
                <h1 className="text-2xl font-black">Manos Veículos — Análise IA do Setor de Cobrança</h1>
                <p className="text-sm">
                    Data: {selectedDate || todayStr} · Gerado em {briefing?._cached_at ? new Date(briefing._cached_at).toLocaleString('pt-BR') : '—'}
                </p>
            </div>

            {/* Header */}
            <div className="bg-gradient-to-br from-violet-500/10 to-indigo-500/5 border border-violet-500/20 rounded-3xl p-6 no-print">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className="p-3 rounded-2xl bg-violet-500/20 border border-violet-500/30">
                            <Sparkles className="w-6 h-6 text-violet-300" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">Análise IA do Dia</h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Sua assistente IA analisa todas as cobranças e te diz exatamente o que fazer hoje.
                            </p>
                            {briefing?._cached_at && (
                                <p className="text-[10px] text-zinc-500 mt-1.5 font-mono">
                                    {selectedDate && selectedDate !== todayStr ? `Análise de ${selectedDate} · ` : ''}
                                    Gerado em {new Date(briefing._cached_at).toLocaleString('pt-BR')}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Histórico */}
                        {history.length > 0 && (
                            <div className="relative">
                                <select
                                    value={selectedDate || todayStr}
                                    onChange={(e) => loadCached(e.target.value)}
                                    className="px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold rounded-xl cursor-pointer focus:outline-none focus:border-violet-500 pr-8 appearance-none"
                                    title="Ver análise de um dia anterior"
                                >
                                    {history.map(h => (
                                        <option key={h.date} value={h.date}>
                                            📅 {h.date === todayStr ? 'Hoje' : new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                                        </option>
                                    ))}
                                </select>
                                <History className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                            </div>
                        )}

                        {/* Imprimir */}
                        {briefing && (
                            <button
                                onClick={handlePrint}
                                className="px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-200 hover:text-white font-black text-xs rounded-xl flex items-center gap-2 transition-all"
                                title="Imprimir ou salvar como PDF (Ctrl+P)"
                            >
                                <Printer className="w-4 h-4" />
                                Imprimir / PDF
                            </button>
                        )}

                        {/* Enviar Camila */}
                        {briefing && briefing.prioridades?.length > 0 && (
                            <button
                                onClick={sendToCamila}
                                disabled={sendingToCamila}
                                className="px-3 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 font-black text-xs rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                                title="Envia a análise completa para o WhatsApp da Camila (+55 47 98845-2087)"
                            >
                                <Share2 className={`w-4 h-4 ${sendingToCamila ? 'animate-pulse' : ''}`} />
                                {sendingToCamila ? 'Enviando...' : 'Enviar p/ Camila'}
                            </button>
                        )}

                        {/* Gerar / Atualizar */}
                        <button
                            onClick={() => generate(true)}
                            disabled={generating}
                            className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-violet-900/20 transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                            {generating ? 'Gerando...' : briefing ? 'Atualizar' : 'Gerar Análise'}
                        </button>
                    </div>
                </div>

                {/* Resumo do dia */}
                {briefing?.resumo_dia && (
                    <div className="mt-4 p-4 bg-zinc-950/50 rounded-2xl border border-zinc-800">
                        <div className="flex items-start gap-2">
                            <Sun className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-zinc-200 leading-relaxed">{briefing.resumo_dia}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Sem briefing ainda */}
            {!briefing && (
                <div className="bg-zinc-900/40 border border-dashed border-zinc-700 rounded-3xl p-12 text-center">
                    <Sparkles className="w-12 h-12 text-violet-500/50 mx-auto mb-3" />
                    <h4 className="text-sm font-black text-white mb-1">Ainda não tem análise hoje</h4>
                    <p className="text-xs text-zinc-400 mb-4">
                        Clique em <strong>Gerar Análise do Dia</strong> acima para a IA olhar todas as suas cobranças<br />
                        e te dar uma lista priorizada do que fazer.
                    </p>
                </div>
            )}

            {/* Alertas */}
            {briefing && briefing.alertas?.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                    <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Alertas do Dia
                    </h4>
                    <ul className="space-y-1.5 text-xs text-zinc-300">
                        {briefing.alertas.map((a, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="text-amber-400 mt-0.5">→</span>
                                <span>{a}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Prioridades */}
            {briefing && briefing.prioridades?.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider px-1">
                        Suas Prioridades de Hoje ({briefing.prioridades.length})
                    </h4>

                    {briefing.prioridades.map((p, idx) => {
                        const cfg = CATEGORIA_CONFIG[p.categoria] || CATEGORIA_CONFIG.URGENTE_HOJE;
                        const quando = QUANDO_LABEL[p.quando_fazer] || QUANDO_LABEL.HOJE_MANHA;
                        const QuandoIcon = quando.icon;

                        return (
                            <div key={idx} className={`prioridade-card border rounded-2xl p-4 ${cfg.bg}`}>
                                {/* Header da prioridade */}
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                        <div className="text-2xl shrink-0">{cfg.emoji}</div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
                                                    {cfg.label}
                                                </span>
                                                <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                                                    <QuandoIcon className="w-3 h-3" />
                                                    {quando.label}
                                                </span>
                                            </div>
                                            <h5 className="text-base font-black text-white uppercase truncate">
                                                {p.cliente}
                                            </h5>
                                            <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                                                <span className="flex items-center gap-1 font-mono">
                                                    <Phone className="w-2.5 h-2.5" />
                                                    {p.telefone}
                                                </span>
                                                <span className="font-mono font-black text-sky-400">{brl(p.valor)}</span>
                                                {p.dias_atraso > 0 && (
                                                    <span className="font-mono text-red-400 font-bold">
                                                        {p.dias_atraso} dias atraso
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Por que */}
                                <div className="mt-3 p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/50">
                                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                                        Por que é prioridade?
                                    </div>
                                    <p className="text-xs text-zinc-300 leading-relaxed">{p.porque}</p>
                                </div>

                                {/* O que fazer */}
                                <div className="mt-2 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                                    <div className="text-[10px] font-black text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                                        <ArrowRight className="w-3 h-3" />
                                        O QUE FAZER AGORA
                                    </div>
                                    <p className="text-xs text-zinc-100 leading-relaxed font-bold">{p.o_que_fazer}</p>
                                </div>

                                {/* Script WhatsApp */}
                                {p.script_sugerido && (
                                    <div className="mt-2 p-3 bg-zinc-950/60 rounded-xl border border-violet-500/20">
                                        <div className="flex items-center justify-between mb-1.5 gap-2">
                                            <div className="text-[10px] font-black text-violet-300 uppercase tracking-wider flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3" />
                                                Mensagem Pronta — copie e cole no WhatsApp
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    onClick={() => copyScript(p.script_sugerido, idx)}
                                                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-[10px] font-bold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all"
                                                >
                                                    {copiedScript === idx ? (
                                                        <><CheckCheck className="w-3 h-3 text-emerald-400" /> Copiado</>
                                                    ) : (
                                                        <><Copy className="w-3 h-3" /> Copiar</>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => sendDirect(p, idx)}
                                                    disabled={sendingMsg === idx}
                                                    className="px-2.5 py-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-lg text-[10px] font-black text-white flex items-center gap-1.5 disabled:opacity-50 transition-all"
                                                    title="Envia direto pelo WhatsApp (instância camila-cobranca)"
                                                >
                                                    <Send className="w-3 h-3" />
                                                    {sendingMsg === idx ? 'Enviando...' : 'Enviar Agora'}
                                                </button>
                                            </div>
                                        </div>
                                        <pre className="text-xs text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed bg-zinc-900/60 p-2 rounded border border-zinc-800/50">
                                            {p.script_sugerido}
                                        </pre>
                                    </div>
                                )}

                                {/* Se não responder */}
                                {p.se_nao_responder && (
                                    <div className="mt-2 p-2.5 rounded-xl border border-zinc-800/50 bg-zinc-900/30">
                                        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                                            Se o cliente não responder
                                        </div>
                                        <p className="text-[11px] text-zinc-400 italic">{p.se_nao_responder}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Dica do dia */}
            {briefing?.dica_do_dia && (
                <div className="bg-gradient-to-br from-amber-500/8 to-orange-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 shrink-0">
                        <Lightbulb className="w-4 h-4 text-amber-300" />
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider mb-1">
                            Dica de Cobrança para Hoje
                        </h4>
                        <p className="text-xs text-zinc-200 leading-relaxed">{briefing.dica_do_dia}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
