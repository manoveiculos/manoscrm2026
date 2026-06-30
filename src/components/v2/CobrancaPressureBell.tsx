'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Siren, X, Clock, RotateCcw, Check, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInactivityAlerts, type InactivityAlert } from '@/hooks/useInactivityAlerts';

interface Props {
    isCollapsed: boolean;
    role: string | null;
}

function timeAgo(dateStr: string | null): string {
    if (!dateStr) return '—';
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return `${Math.floor(diffH / 24)}d`;
}

const KIND_META: Record<string, { label: string; cls: string }> = {
    warning_8h: { label: '8h parado', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    auto_lost_24h: { label: 'perdido 24h', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
};

export const CobrancaPressureBell = ({ isCollapsed, role }: Props) => {
    const router = useRouter();
    const { alerts, count, warningCount, lostCount, acknowledge } = useInactivityAlerts(role);
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const hasUrgent = count > 0;

    return (
        <div className="relative" ref={panelRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                title={isCollapsed ? `Pressão de Cobrança${count > 0 ? ` (${count})` : ''}` : undefined}
                className={`relative flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-3 px-4 w-full'} py-3 rounded-2xl transition-all group
                    ${isOpen
                        ? 'bg-gradient-to-r from-red-500/[0.08] to-transparent text-white'
                        : hasUrgent
                            ? 'text-red-300 hover:bg-red-500/[0.06]'
                            : 'text-white/40 hover:text-white/90 hover:bg-white/[0.03]'
                    }`}
            >
                <div className="relative shrink-0 flex items-center justify-center w-5">
                    <Siren
                        size={19}
                        strokeWidth={isOpen ? 2.5 : 2}
                        className={`transition-colors ${isOpen ? 'text-red-500' : hasUrgent ? 'text-red-400' : 'group-hover:text-white/70'} ${hasUrgent ? 'animate-pulse' : ''}`}
                    />
                    {count > 0 && (
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-black px-1 shadow-[0_0_12px_rgba(239,68,68,0.9)]"
                        >
                            {count > 9 ? '9+' : count}
                        </motion.span>
                    )}
                </div>
                {!isCollapsed && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`font-bold text-[13px] tracking-tight whitespace-nowrap ${isOpen ? 'text-white' : ''}`}
                    >
                        Pressão de Cobrança
                    </motion.span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: -8, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-full bottom-0 ml-3 w-96 max-h-[460px] bg-[#141418] border border-red-500/[0.15] rounded-2xl shadow-2xl shadow-black/60 z-[200] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-red-600/[0.08] to-transparent">
                            <div className="flex items-center gap-2">
                                <Flame size={15} className="text-red-500" />
                                <span className="text-sm font-black text-white">Leads esfriando</span>
                                <div className="flex items-center gap-1.5 ml-1">
                                    {warningCount > 0 && (
                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">{warningCount} · 8h</span>
                                    )}
                                    {lostCount > 0 && (
                                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md">{lostCount} · 24h</span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="text-white/30 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.05]">
                                <X size={14} />
                            </button>
                        </div>

                        {/* Lista */}
                        <div className="overflow-y-auto max-h-[400px] custom-scrollbar">
                            {alerts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-white/20">
                                    <Check size={28} strokeWidth={1.5} className="mb-2 text-emerald-500/40" />
                                    <p className="text-xs font-bold text-white/40">Pátio sob controle</p>
                                    <p className="text-[10px] mt-0.5">Nenhum lead esfriando agora</p>
                                </div>
                            ) : (
                                alerts.map((a: InactivityAlert) => {
                                    const meta = KIND_META[a.kind] || { label: a.kind, cls: 'bg-white/10 text-white/50 border-white/10' };
                                    return (
                                        <div key={a.id} className="px-4 py-3 border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                                            <div className="flex items-start justify-between gap-2">
                                                <button
                                                    onClick={() => { setIsOpen(false); router.push(`/pipeline?lead=${encodeURIComponent(a.lead_uid)}`); }}
                                                    className="flex-1 min-w-0 text-left group/item"
                                                >
                                                    <p className="text-[13px] font-bold text-white truncate group-hover/item:text-red-400 transition-colors">
                                                        {a.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.cls}`}>
                                                            {meta.label}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-[10px] text-white/35 font-medium">
                                                            <Clock size={10} /> parado há {a.hours_inactive != null ? `${a.hours_inactive}h` : timeAgo(a.ultima_interacao_humana)}
                                                        </span>
                                                        {role === 'admin' && a.consultor_name && (
                                                            <span className="text-[10px] text-white/30 truncate">→ {a.consultor_name}</span>
                                                        )}
                                                    </div>
                                                    {a.vehicle_interest && (
                                                        <p className="text-[10px] text-white/25 truncate mt-0.5">{a.vehicle_interest}</p>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Ações */}
                                            <div className="flex items-center gap-2 mt-2.5">
                                                <button
                                                    onClick={() => acknowledge(a.id, 'will_respond')}
                                                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                                                >
                                                    <Check size={12} /> Vou responder
                                                </button>
                                                <button
                                                    onClick={() => acknowledge(a.id, 'return_to_queue')}
                                                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-white/50 bg-white/[0.04] hover:bg-red-500/15 hover:text-red-300 border border-white/10 hover:border-red-500/20 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                                                    title="Tira o lead de você e devolve à Fila Geral para qualquer vendedor pescar"
                                                >
                                                    <RotateCcw size={12} /> Devolver à fila
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
