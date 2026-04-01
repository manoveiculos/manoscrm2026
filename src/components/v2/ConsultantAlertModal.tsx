'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, MessageSquare, ChevronRight, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CoworkAlert {
    id: string;
    title: string;
    message: string;
    type: string;
    priority: number;
    created_at: string;
}

interface ConsultantInfo {
    id: string;
    name: string;
}

const PRIORITY_CONFIG: Record<number, { label: string; color: string; border: string; glow: string; pulseBg: string }> = {
    1: {
        label: 'CRÍTICO',
        color: '#ef4444',
        border: 'border-red-500/40',
        glow: '0 0 40px rgba(239,68,68,0.2)',
        pulseBg: 'bg-red-600',
    },
    2: {
        label: 'ATENÇÃO',
        color: '#f59e0b',
        border: 'border-amber-500/40',
        glow: '0 0 40px rgba(245,158,11,0.15)',
        pulseBg: 'bg-amber-500',
    },
    3: {
        label: 'AVISO',
        color: '#3b82f6',
        border: 'border-blue-500/30',
        glow: '0 0 30px rgba(59,130,246,0.1)',
        pulseBg: 'bg-blue-600',
    },
};

export const ConsultantAlertModal = () => {
    const [alerts, setAlerts] = useState<CoworkAlert[]>([]);
    const [consultant, setConsultant] = useState<ConsultantInfo | null>(null);
    const [showContest, setShowContest] = useState(false);
    const [contestReason, setContestReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const current = alerts[0] ?? null;
    const p = current ? (PRIORITY_CONFIG[current.priority] ?? PRIORITY_CONFIG[2]) : null;

    // Bloqueia tecla Escape enquanto há aviso pendente
    useEffect(() => {
        if (!current) return;
        const handle = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener('keydown', handle, true);
        return () => window.removeEventListener('keydown', handle, true);
    }, [current]);

    const fetchAlerts = useCallback(async (consultantId: string) => {
        try {
            const res = await fetch(`/api/v2/cowork-alerts?consultantId=${consultantId}`);
            const data = await res.json();
            if (data.success) setAlerts(data.alerts ?? []);
        } catch {
            // falha silenciosa — não interrompe o app
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: cons } = await supabase
                .from('consultants_manos_crm')
                .select('id, name, role')
                .eq('auth_id', user.id)
                .maybeSingle();

            if (!cons) return;

            // Admin não recebe pop-up forçado
            if (cons.role === 'admin') return;

            setConsultant({ id: cons.id, name: cons.name });
            await fetchAlerts(cons.id);
        };

        init();

        // Re-verifica a cada 3 minutos
        const timer = setInterval(() => {
            if (consultant) fetchAlerts(consultant.id);
        }, 3 * 60 * 1000);

        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRespond = async (action: 'acknowledged' | 'contested') => {
        if (!current || !consultant) return;
        if (action === 'contested' && !contestReason.trim()) return;

        setSubmitting(true);
        try {
            await fetch('/api/v2/cowork-alerts/respond', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alert_id: current.id,
                    consultant_id: consultant.id,
                    consultant_name: consultant.name,
                    action,
                    contest_reason: contestReason.trim() || null,
                }),
            });
            // Remove o aviso atual e mostra o próximo (se houver)
            setAlerts(prev => prev.slice(1));
            setShowContest(false);
            setContestReason('');
        } catch {
            // falha silenciosa
        }
        setSubmitting(false);
    };

    if (!current || !consultant) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="cowork-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-6"
                style={{ backdropFilter: 'blur(10px)', backgroundColor: 'rgba(0,0,0,0.88)' }}
            >
                {/* Pulso ambiente para alertas críticos */}
                {current.priority === 1 && (
                    <motion.div
                        animate={{ opacity: [0.04, 0.1, 0.04] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                        className="absolute inset-0 bg-red-600 pointer-events-none"
                    />
                )}

                <motion.div
                    key={current.id}
                    initial={{ scale: 0.88, opacity: 0, y: 24 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: -8 }}
                    transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                    className={`relative w-full max-w-lg bg-[#0c0c0f] border rounded-2xl overflow-hidden shadow-2xl ${p!.border}`}
                    style={{ boxShadow: p!.glow }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Faixa de prioridade no topo */}
                    <div
                        className="px-6 py-3 flex items-center justify-between"
                        style={{ backgroundColor: p!.color + '18', borderBottom: `1px solid ${p!.color}30` }}
                    >
                        <div className="flex items-center gap-3">
                            <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                            >
                                <AlertTriangle size={15} style={{ color: p!.color }} />
                            </motion.div>
                            <span className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: p!.color }}>
                                {p!.label} — AVISO DA GERÊNCIA
                            </span>
                        </div>
                        {alerts.length > 1 && (
                            <span className="text-[9px] font-black text-white/25 uppercase tracking-widest">
                                aviso 1 de {alerts.length}
                            </span>
                        )}
                    </div>

                    {/* Corpo do aviso */}
                    <div className="p-6 space-y-5">
                        <div>
                            <h2 className="text-xl font-black text-white leading-tight tracking-tight">
                                {current.title}
                            </h2>
                            <p className="mt-3 text-sm text-white/60 leading-relaxed whitespace-pre-line">
                                {current.message}
                            </p>
                        </div>

                        <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">
                            {new Date(current.created_at).toLocaleString('pt-BR', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            })} · Manos Veículos CRM
                        </p>

                        {/* Formulário de contestação */}
                        <AnimatePresence>
                            {showContest && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                                        <p className="text-[9px] font-black text-amber-400/80 uppercase tracking-widest">
                                            Por que você não concorda?
                                        </p>
                                        <textarea
                                            value={contestReason}
                                            onChange={e => setContestReason(e.target.value)}
                                            placeholder="Explique o motivo da sua contestação. A gerência irá analisar."
                                            rows={3}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 resize-none outline-none focus:border-amber-500/40 transition-all"
                                            autoFocus
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Botões de ação */}
                        <div className="flex flex-col gap-2 pt-1">
                            {!showContest ? (
                                <>
                                    <motion.button
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => handleRespond('acknowledged')}
                                        disabled={submitting}
                                        className="w-full py-3.5 rounded-xl text-white font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                        style={{
                                            backgroundColor: p!.color,
                                            boxShadow: `0 8px 24px ${p!.color}40`,
                                        }}
                                    >
                                        <CheckCircle size={15} />
                                        Ciente — vou agir agora
                                        <ChevronRight size={14} className="ml-auto opacity-50" />
                                    </motion.button>

                                    <button
                                        onClick={() => setShowContest(true)}
                                        className="w-full py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-white/35 hover:text-white/60 font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                                    >
                                        <MessageSquare size={13} />
                                        Não concordo — Contestar
                                    </button>
                                </>
                            ) : (
                                <>
                                    <motion.button
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => handleRespond('contested')}
                                        disabled={submitting || !contestReason.trim()}
                                        className="w-full py-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                                    >
                                        <Send size={14} />
                                        {submitting ? 'Enviando...' : 'Enviar contestação'}
                                    </motion.button>

                                    <button
                                        onClick={() => { setShowContest(false); setContestReason(''); }}
                                        className="w-full py-2.5 text-white/25 hover:text-white/50 font-bold text-[11px] uppercase tracking-widest transition-all"
                                    >
                                        ← Voltar
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
