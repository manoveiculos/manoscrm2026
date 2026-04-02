'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, ExternalLink, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNewLeadNotifications } from '@/hooks/useNewLeadNotifications';

interface NotificationBellProps {
    isCollapsed: boolean;
    role: string | null;
}

function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMin = Math.floor((now - then) / 60000);
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
}

function sourceLabel(source: string): string {
    if (!source) return 'Direto';
    const s = source.toLowerCase();
    if (s.includes('facebook') || s.includes('meta')) return 'Facebook';
    if (s.includes('instagram')) return 'Instagram';
    if (s.includes('whatsapp')) return 'WhatsApp';
    if (s.includes('google')) return 'Google';
    if (s.includes('olx')) return 'OLX';
    if (s.includes('webmotors')) return 'Webmotors';
    return source.slice(0, 12);
}

export const NotificationBell = ({ isCollapsed, role }: NotificationBellProps) => {
    const router = useRouter();
    const { unseenCount, leads, markAllSeen, markSeen } = useNewLeadNotifications(role);
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const autoMarkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Click-outside fecha o dropdown
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    // Auto-mark seen após 2s com o painel aberto
    useEffect(() => {
        if (isOpen && unseenCount > 0) {
            autoMarkTimer.current = setTimeout(() => {
                markAllSeen();
            }, 2000);
        }
        return () => {
            if (autoMarkTimer.current) clearTimeout(autoMarkTimer.current);
        };
    }, [isOpen, unseenCount, markAllSeen]);

    const handleLeadClick = (leadId: string) => {
        markSeen(leadId);
        setIsOpen(false);
        router.push(`/pipeline?lead=${leadId}`);
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Botão do sininho */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                title={isCollapsed ? `Notificações${unseenCount > 0 ? ` (${unseenCount})` : ''}` : undefined}
                className={`relative flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-3 px-4 w-full'} py-3 rounded-2xl transition-all group
                    ${isOpen
                        ? 'bg-gradient-to-r from-white/[0.05] to-transparent text-white'
                        : 'text-white/40 hover:text-white/90 hover:bg-white/[0.03]'
                    }`}
            >
                <div className="relative shrink-0 flex items-center justify-center w-5">
                    <Bell
                        size={19}
                        strokeWidth={isOpen ? 2.5 : 2}
                        className={`transition-colors ${isOpen ? 'text-red-500' : 'group-hover:text-white/70'} ${unseenCount > 0 ? 'animate-[bell-ring_0.5s_ease-in-out]' : ''}`}
                    />
                    {/* Badge vermelho */}
                    {unseenCount > 0 && (
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black px-1 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                        >
                            {unseenCount > 9 ? '9+' : unseenCount}
                        </motion.span>
                    )}
                </div>
                {!isCollapsed && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`font-bold text-[13px] tracking-tight whitespace-nowrap ${isOpen ? 'text-white' : 'group-hover:translate-x-0.5 transition-transform'}`}
                    >
                        Notificações
                    </motion.span>
                )}
            </button>

            {/* Dropdown panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: -8, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-full top-0 ml-3 w-80 max-h-[420px] bg-[#141418] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 z-[200] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                            <div className="flex items-center gap-2">
                                <Bell size={14} className="text-red-500" />
                                <span className="text-sm font-black text-white">Novos Leads</span>
                                {leads.length > 0 && (
                                    <span className="text-[10px] font-bold text-white/30 bg-white/[0.05] px-1.5 py-0.5 rounded-md">
                                        {leads.length}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                {unseenCount > 0 && (
                                    <button
                                        onClick={markAllSeen}
                                        className="flex items-center gap-1 text-[10px] font-bold text-white/30 hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.03]"
                                        title="Marcar todos como vistos"
                                    >
                                        <CheckCheck size={12} />
                                        <span className="hidden sm:inline">Visto</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="text-white/30 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.05]"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Lista de leads */}
                        <div className="overflow-y-auto max-h-[360px] custom-scrollbar">
                            {leads.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-white/20">
                                    <Bell size={28} strokeWidth={1.5} className="mb-2 opacity-40" />
                                    <p className="text-xs font-bold">Nenhum lead pendente</p>
                                    <p className="text-[10px] mt-0.5">Novos leads aparecerão aqui</p>
                                </div>
                            ) : (
                                leads.map((lead) => {
                                    const isUnseen = !lead.id; // placeholder, real check below
                                    return (
                                        <button
                                            key={lead.id}
                                            onClick={() => handleLeadClick(lead.id)}
                                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left border-b border-white/[0.03] last:border-b-0 group/item"
                                        >
                                            {/* Dot indicador */}
                                            <div className="mt-1.5 shrink-0">
                                                <div className={`w-2 h-2 rounded-full ${unseenCount > 0 ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]' : 'bg-white/10'}`} />
                                            </div>

                                            {/* Info do lead */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[13px] font-bold text-white truncate group-hover/item:text-red-400 transition-colors">
                                                        {lead.name || 'Sem nome'}
                                                    </p>
                                                    <span className="text-[10px] text-white/25 font-medium shrink-0">
                                                        {timeAgo(lead.created_at)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-bold text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                                        {sourceLabel(lead.source)}
                                                    </span>
                                                    {lead.vehicle_interest && (
                                                        <span className="text-[10px] text-white/20 truncate">
                                                            {lead.vehicle_interest}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Seta */}
                                            <ExternalLink size={12} className="mt-1 shrink-0 text-white/10 group-hover/item:text-white/30 transition-colors" />
                                        </button>
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
