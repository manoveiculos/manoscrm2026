import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Users, Zap, Calendar, Car, CreditCard, 
    BadgeCheck, Phone, AlertCircle, 
    Activity, Target, ShieldAlert 
} from 'lucide-react';
import { LeadStatus } from '@/lib/types';

interface MoveMenuProps {
    isOpen: boolean;
    currentStatus: LeadStatus;
    onStatusChange: (newStatus: LeadStatus) => void;
    onClose: () => void;
}

export const MoveMenu = ({ isOpen, currentStatus, onStatusChange, onClose }: MoveMenuProps) => {
    const statusOptions = [
        { id: 'entrada' as LeadStatus, label: 'Entrada', icon: <Zap size={14} className="text-yellow-400" /> },
        { id: 'triagem' as LeadStatus, label: 'Triagem', icon: <Activity size={14} className="text-blue-400" /> },
        { id: 'ataque' as LeadStatus, label: 'Ataque', icon: <Target size={14} className="text-red-500" /> },
        { id: 'fechamento' as LeadStatus, label: 'Fechamento', icon: <ShieldAlert size={14} className="text-emerald-500" /> },
        { id: 'closed' as LeadStatus, label: 'Vendido', icon: <BadgeCheck size={14} className="text-emerald-600" /> },
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
                            top: 'calc(100% + 10px)',
                        }}
                        className="absolute right-0 w-60 bg-[#0a0a0ae6] border border-white/10 rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] z-[999] py-3 overflow-hidden backdrop-blur-3xl border-red-500/30 origin-top-right ring-1 ring-white/5"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 to-transparent pointer-events-none" />
                        <div className="relative z-10">
                            <div className="px-5 pb-3 mb-2 border-b border-white/5 text-left">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500/80 flex items-center gap-2">
                                    <Zap size={9} fill="currentColor" /> Mover para Etapa
                                </p>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto px-1.5 space-y-1 custom-scrollbar">
                                {statusOptions.filter(st => st.id !== currentStatus).map((st) => (
                                    <button
                                        key={st.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusChange(st.id);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[11px] font-bold text-white/40 hover:text-white hover:bg-white/[0.03] transition-all group/item text-left"
                                    >
                                        <div className="p-1.5 rounded-lg bg-white/5 group-hover/item:bg-red-600/20 group-hover/item:text-red-500 transition-all">
                                            {st.icon}
                                        </div>
                                        <span className="flex-1 tracking-tight">{st.label}</span>
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
