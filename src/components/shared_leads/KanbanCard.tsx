import React from 'react';
import { motion } from 'framer-motion';
import { Zap, ArrowRight } from 'lucide-react';
import { Lead, LeadStatus } from '@/lib/types';
import { safeInitials, safeName } from '@/lib/shared_utils/safeLead';
import { SourceIcon } from './SourceIcon';
import { MoveMenu } from './MoveMenu';

interface KanbanCardProps {
    lead: Lead;
    isMobile: boolean;
    draggingLeadId: string | null;
    activeMoveMenu: string | null;
    setActiveMoveMenu: (id: string | null) => void;
    handleLeadSmartClick: (lead: Lead) => void;
    handleStatusChange: (leadId: string, newStatus: LeadStatus) => void;
    setActionLead: (lead: Lead) => void;
    setDraggingLeadId: (id: string | null) => void;
}

export const KanbanCard = ({
    lead,
    isMobile,
    draggingLeadId,
    activeMoveMenu,
    setActiveMoveMenu,
    handleLeadSmartClick,
    handleStatusChange,
    setActionLead,
    setDraggingLeadId,
}: KanbanCardProps) => {
    return (
        <motion.div
            key={lead.id}
            layoutId={isMobile ? undefined : lead.id}
            draggable
            onDragStart={(e) => {
                const dragEvent = e as unknown as React.DragEvent;
                if (dragEvent.dataTransfer) {
                    dragEvent.dataTransfer.setData('leadId', lead.id);
                    dragEvent.dataTransfer.effectAllowed = 'move';
                }
                setDraggingLeadId(lead.id);
            }}
            onDragEnd={() => {
                setDraggingLeadId(null);
            }}
            onClick={() => handleLeadSmartClick(lead)}
            className={`glass-card rounded-2xl p-4 cursor-grab active:cursor-grabbing hover:border-red-500/30 transition-all group relative select-none border border-white/5 ${activeMoveMenu === lead.id ? 'z-[200] border-red-500/50 shadow-[0_0_50px_rgba(220,38,38,0.2)]' : 'z-10'} ${draggingLeadId === lead.id ? 'opacity-40 scale-[0.98] shadow-none !border-red-500/50 relative z-[200]' : 'opacity-100'}`}
        >
            <div className="flex justify-between items-start mb-3 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-[10px] font-black text-white shadow-lg shrink-0">
                        {safeInitials(lead.name)}
                    </div>
                    {(() => {
                        if (!lead.created_at) return null;

                        const now = new Date();
                        const created = new Date(lead.created_at);
                        const diffMs = now.getTime() - created.getTime();
                        const diffHours = Math.floor(diffMs / (1000 * 3600));
                        const diffDays = Math.floor(diffHours / 24);

                        let timeLabel = '';
                        let badgeColor = '';

                        if (diffHours < 24) {
                            timeLabel = `${diffHours}h`;
                            if (diffHours < 3) {
                                badgeColor = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
                            } else {
                                badgeColor = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
                            }
                        } else {
                            timeLabel = `${diffDays}d`;
                            badgeColor = 'text-red-500 bg-red-500/10 border-red-500/20';
                        }

                        return (
                            <div
                                className={`px-2 py-1 rounded-lg border ${badgeColor} text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm shrink-0`}
                                title={`Lead recebido há ${diffHours} horas`}
                            >
                                ⏳ {timeLabel}
                            </div>
                        );
                    })()}
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative z-[100]">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveMoveMenu(activeMoveMenu === lead.id ? null : lead.id);
                            }}
                            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all border shadow-lg ${activeMoveMenu === lead.id ? 'bg-red-600 border-red-500 text-white shadow-red-600/20' : 'bg-white/10 border-white/10 text-white/60 hover:text-red-500 hover:bg-white/20'}`}
                        >
                            <ArrowRight size={18} className={activeMoveMenu === lead.id ? 'rotate-90 transition-transform' : 'transition-transform'} />
                        </button>

                        <MoveMenu
                            isOpen={activeMoveMenu === lead.id}
                            currentStatus={lead.status}
                            onStatusChange={(newStatus) => handleStatusChange(lead.id, newStatus)}
                            onClose={() => setActiveMoveMenu(null)}
                        />
                    </div>

                    <div className="text-right">
                        <div className="text-xl font-black text-white leading-none">
                            {lead.ai_score || 0}<span className="text-[10px] text-red-500 ml-0.5">%</span>
                        </div>
                        <p className="text-[8px] font-black text-white/20 uppercase tracking-tighter">Score IA</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-2">
                <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <SourceIcon source={lead.source} name={lead.name} plataforma_meta={lead.plataforma_meta} className="text-[10px] font-black text-white/40" />
                </div>
                <h4 className="text-sm font-black text-white tracking-tight leading-tight truncate">{safeName(lead.name)}</h4>
            </div>
            <p className="text-[10px] font-bold text-white/40 mb-3 truncate italic">
                {lead.vehicle_interest?.split('|')[0]?.trim() || 'Interesse em Compra'}
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10">
                <span className="px-2 py-0.5 rounded-lg bg-red-600/10 text-[9px] font-black text-red-500 border border-red-500/10 max-w-[120px] truncate">
                    {lead.origem || 'Contato Direto WhatsApp'}
                </span>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setActionLead(lead);
                    }}
                    className="h-7 px-3 glass-card rounded-lg flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-red-400 hover:border-red-500/30 transition-all group/btn"
                >
                    <Zap size={10} className="group-hover/btn:text-red-500 transition-colors" /> Ações
                </button>
            </div>
        </motion.div>
    );
};
