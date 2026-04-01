import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ArrowRight, Zap } from 'lucide-react';
import { Lead } from '@/lib/types';
import { safeName, safePhone, safeClassification } from '@/lib/shared_utils/safeLead';
import { SourceIcon } from './SourceIcon';
import { MoveMenu } from './MoveMenu';
import { formatPhoneBR, getStatusColor, getStatusLabel } from '../utils/helpers';

interface ListRowProps {
    lead: Lead;
    index: number;
    activeMoveMenu: string | null;
    setActiveMoveMenu: (id: string | null) => void;
    handleLeadSmartClick: (lead: Lead) => void;
    handleStatusChange: (leadId: string, newStatus: any) => void;
    setActionLead: (lead: Lead) => void;
}

export const ListRow = ({
    lead,
    index,
    activeMoveMenu,
    setActiveMoveMenu,
    handleLeadSmartClick,
    handleStatusChange,
    setActionLead,
}: ListRowProps) => {
    return (
        <motion.div
            key={lead.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            onClick={() => handleLeadSmartClick(lead)}
            className={`glass-card rounded-[1.5rem] md:rounded-[2.2rem] border border-white/5 transition-all group relative flex items-stretch bg-[#050608]/40 backdrop-blur-3xl hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)] cursor-pointer select-none ${activeMoveMenu === lead.id ? 'z-[200] border-red-500/30 shadow-[0_20px_60px_rgba(0,0,0,0.7)]' : 'z-auto'}`}
        >
            {/* Faixa Lateral de Status (Luz Neon) */}
            <div className={`w-1.5 shrink-0 rounded-l-[1.5rem] md:rounded-l-[2.2rem] ${safeClassification(lead.ai_classification) === 'hot' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' :
                safeClassification(lead.ai_classification) === 'warm' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' :
                    'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                }`} />

            <div className="flex-1 flex flex-col md:flex-row items-center p-4 md:p-6 gap-6 w-full">
                {/* Seção de Identidade */}
                <div className="flex-1 min-w-[250px] flex items-center gap-4 w-full">
                    <div className={`relative h-12 w-12 rounded-2xl flex items-center justify-center transition-all bg-white/[0.02] border-2 ${safeClassification(lead.ai_classification) === 'hot' ? 'border-red-500/20' :
                        safeClassification(lead.ai_classification) === 'warm' ? 'border-amber-500/20' :
                            'border-white/10'
                        }`}>
                        <SourceIcon source={lead.source} name={lead.name} plataforma_meta={lead.plataforma_meta} />
                    </div>
                    <div className="overflow-hidden">
                        <h3 className="font-black text-white text-[15px] tracking-tight leading-none mb-1 group-hover:text-red-400 transition-colors truncate uppercase font-outfit">
                            {safeName(lead.name)}
                        </h3>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <Phone size={10} className="text-red-500/50" />
                                <span className="text-sm font-bold text-white/80 tracking-wider">
                                    {formatPhoneBR(safePhone(lead.phone))}
                                </span>
                            </div>
                            <span className="text-[9px] font-black text-white/10 uppercase tracking-widest hidden sm:block">
                                {new Date(lead.created_at).toLocaleDateString('pt-BR')} às {new Date(lead.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Seção de Interesse */}
                <div className="hidden md:block w-48 shrink-0">
                    <p className="text-sm font-black text-white uppercase tracking-tight font-outfit truncate">
                        {lead.vehicle_interest?.split('|')[0]?.trim() || 'Interesse em Compra'}
                    </p>
                </div>

                {/* Seção de Consultor */}
                <div className="hidden lg:block w-40 shrink-0">
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white/70 uppercase">{lead.consultants_manos_crm?.name?.split(' ')[0] || 'Aguardando'}</span>
                        <span className="text-[8px] text-white/10 uppercase font-black tracking-[0.2em] mt-1">Responsável</span>
                    </div>
                </div>

                {/* Seção de Status */}
                <div className="w-40 shrink-0">
                    <div className="relative group/status">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveMoveMenu(activeMoveMenu === lead.id ? null : lead.id);
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl border transition-all ${activeMoveMenu === lead.id ? 'bg-red-600/20 border-red-500/50 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div className={`h-2 w-2 rounded-full shrink-0 ${getStatusColor(lead.status)} shadow-[0_0_8px_currentColor]`} />
                                <span className="text-[10px] font-black uppercase text-white/60 tracking-wider truncate">
                                    {getStatusLabel(lead.status)}
                                </span>
                            </div>
                            <ArrowRight size={10} className={`text-white/20 transition-transform shrink-0 ${activeMoveMenu === lead.id ? 'rotate-90 text-red-500' : 'group-hover/status:translate-x-0.5'}`} />
                        </button>

                        <MoveMenu
                            isOpen={activeMoveMenu === lead.id}
                            currentStatus={lead.status}
                            onStatusChange={(newStatus) => handleStatusChange(lead.id, newStatus)}
                            onClose={() => setActiveMoveMenu(null)}
                        />
                    </div>
                </div>

                {/* Seção de Ações */}
                <div className="w-24 shrink-0 text-right">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActionLead(lead);
                        }}
                        className="h-10 w-10 flex items-center justify-center glass-card rounded-2xl text-white/20 hover:text-red-500 hover:border-red-500/30 transition-all group/btn ml-auto"
                    >
                        <Zap size={16} className="group-hover/btn:scale-110 transition-transform" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
