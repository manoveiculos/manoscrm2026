import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Zap, Calendar, Car, CreditCard, BadgeCheck, Phone, AlertCircle } from 'lucide-react';
import { LeadStatus } from '@/lib/types';

interface MoveMenuProps {
    isOpen: boolean;
    currentStatus: LeadStatus;
    onStatusChange: (newStatus: LeadStatus) => void;
    onClose: () => void;
}

export const MoveMenu = ({ isOpen, currentStatus, onStatusChange, onClose }: MoveMenuProps) => {
    const statusOptions = [
        { id: 'received' as LeadStatus, label: 'Aguardando', icon: <Users size={14} /> },
        { id: 'attempt' as LeadStatus, label: 'Em Atendimento', icon: <Zap size={14} /> },
        { id: 'scheduled' as LeadStatus, label: 'Agendado', icon: <Calendar size={14} /> },
        { id: 'visited' as LeadStatus, label: 'Visita e Test Drive', icon: <Car size={14} /> },
        { id: 'proposed' as LeadStatus, label: 'Negociação', icon: <CreditCard size={14} /> },
        { id: 'closed' as LeadStatus, label: 'Vendido', icon: <BadgeCheck size={14} className="text-emerald-500" /> },
        { id: 'comprado' as LeadStatus, label: 'Comprado', icon: <Car size={14} className="text-indigo-500" /> },
        { id: 'post_sale' as LeadStatus, label: 'Sem Contato', icon: <Phone size={14} className="text-white/40" /> },
        { id: 'lost' as LeadStatus, label: 'Perda Total', icon: <AlertCircle size={14} className="text-white/20" /> }
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Click Outside Backdrop */}
                    <div
                        className="fixed inset-0 z-[105]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        style={{
                            top: 'calc(100% + 15px)',
                        }}
                        className="absolute right-0 w-64 bg-[#0a0a0a] border border-white/20 rounded-2xl shadow-[0_40px_120px_rgba(0,0,0,1),0_0_20px_rgba(220,38,38,0.15)] z-[210] py-4 overflow-hidden backdrop-blur-3xl border-red-500/50 origin-top-right"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 to-transparent pointer-events-none" />
                        <div className="relative z-10">
                            <div className="px-6 pb-4 mb-2 border-b border-white/10 text-left">
                                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500 flex items-center gap-2">
                                    <Zap size={10} fill="currentColor" /> Mover Lead para...
                                </p>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto px-2 space-y-1.5 custom-scrollbar">
                                {statusOptions.filter(st => st.id !== currentStatus).map((st) => (
                                    <button
                                        key={st.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusChange(st.id);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[12px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all group/item text-left"
                                    >
                                        <div className="p-2 rounded-lg bg-white/5 group-hover/item:bg-red-600/30 group-hover/item:text-red-500 transition-all">
                                            {st.icon}
                                        </div>
                                        <span className="flex-1">{st.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
