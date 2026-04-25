'use client';

import React, { useState } from 'react';
import { Lead, LeadStatus } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { LeadCardV2 } from './LeadCardV2';
import { SafeLeadCard } from '@/components/shared_leads/SafeLeadCard';
import { Activity, Target, Zap, ShieldAlert, ChevronDown } from 'lucide-react';
import { PIPELINE_STAGES, normalizeStatus } from '@/constants/status';

const INITIAL_VISIBLE = 20;
const LOAD_MORE_STEP = 20;

const STAGE_ICONS: Record<string, any> = {
    'entrada': Zap,
    'triagem': Activity,
    'ataque': Target,
    'fechamento': ShieldAlert
};

interface KanbanBoardV2Props {
    leads: Lead[];
    setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
    userName: string;
    onView: (lead: Lead) => void;
    onManage: (lead: Lead) => void;
    onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
}

export const KanbanBoardV2: React.FC<KanbanBoardV2Props> = ({ 
    leads, 
    setLeads, 
    userName, 
    onView, 
    onManage,
    onStatusChange 
}) => {
    const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
    const [isOverColumnId, setIsOverColumnId] = useState<string | null>(null);
    const [columnWithMenuOpen, setColumnWithMenuOpen] = useState<string | null>(null);
    const [columnVisibleCount, setColumnVisibleCount] = useState<Record<string, number>>({});

    const [activeTab, setActiveTab] = useState(PIPELINE_STAGES[0].id);

    const columns = PIPELINE_STAGES.map(s => ({
        id: s.id,
        title: s.label,
        subtitle: s.sublabel,
        icon: STAGE_ICONS[s.id] || Activity,
        color: s.color
    }));

    const getColumnLeads = (columnId: string) => {
        return leads.filter(l => normalizeStatus(l.status) === columnId);
    };

    const handleDragOver = (e: React.DragEvent, columnId: string) => {
        e.preventDefault();
        setIsOverColumnId(columnId);
    };

    const handleDragLeave = () => {
        setIsOverColumnId(null);
    };

    const handleDrop = (e: React.DragEvent, columnId: string) => {
        e.preventDefault();
        setIsOverColumnId(null);
        const leadId = e.dataTransfer.getData('leadId');
        if (leadId) {
            onStatusChange(leadId, columnId as LeadStatus);
        }
    };

    return (
        <div className="h-full w-full flex flex-col bg-[#0C0C0F] overflow-y-hidden overflow-x-hidden min-h-0">
            {/* MOBILE: Tab Switcher (visível apenas < md) */}
            <div className="md:hidden flex items-center gap-1.5 px-3 py-2.5 overflow-x-auto whitespace-nowrap scrollbar-hide shrink-0 border-b border-white/[0.05] bg-[#0F0F12]">
                {columns.map(col => {
                    const count = getColumnLeads(col.id).length;
                    const isActive = activeTab === col.id;
                    return (
                        <button
                            key={col.id}
                            onClick={() => setActiveTab(col.id)}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.05em] transition-all duration-300 relative ${
                                isActive 
                                ? 'text-white' 
                                : 'text-white/20 hover:text-white/40 bg-white/[0.02]'
                            }`}
                        >
                            {isActive && (
                                <motion.div 
                                    layoutId="active-tab-bg"
                                    className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 rounded-xl shadow-[0_4px_12px_rgba(220,38,38,0.25)]"
                                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <span className="relative z-10">{col.title}</span>
                            <span className={`relative z-10 tabular-nums px-1.5 py-0.5 rounded-md text-[9px] ${isActive ? 'bg-white/20 text-white' : 'bg-white/[0.05] text-white/20'}`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="flex h-full w-full gap-2 px-2 pt-2 pb-2 antialiased items-stretch overflow-x-auto md:overflow-x-hidden custom-scrollbar-h min-h-0">
                {columns.map((col, index) => {
                    const colLeads = getColumnLeads(col.id);
                    const visibleLimit = columnVisibleCount[col.id] || INITIAL_VISIBLE;
                    const visibleLeads = colLeads.slice(0, visibleLimit);
                    const hasMore = colLeads.length > visibleLimit;
                    const isClosingStage = col.id === 'fechamento';
                    const isOver = isOverColumnId === col.id;
                    const hasMenuOpen = columnWithMenuOpen === col.id;
                    const isActiveOnMobile = activeTab === col.id;

                    return (
                        <motion.div 
                            key={col.id} 
                            initial={false}
                            animate={{ 
                                opacity: 1,
                                display: 'flex'
                            }}
                            className={`flex-col min-w-[280px] md:min-w-[200px] h-full relative ${
                                !isActiveOnMobile ? 'hidden md:flex' : 'flex w-full'
                            }`}
                            style={{ 
                                flex: '1 1 0%',
                                zIndex: hasMenuOpen ? 100 : 50 - index 
                            }}
                        >
                            {/* Cabeçalho da coluna */}
                            <div className="mb-3 flex items-center justify-between px-1 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <div
                                        className="p-1.5 rounded-lg border"
                                        style={{
                                            backgroundColor: `${col.color}12`,
                                            borderColor: `${col.color}25`,
                                            color: col.color,
                                        }}
                                    >
                                        <col.icon size={13} className={isClosingStage && colLeads.length > 0 ? 'animate-pulse' : ''} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-[12px] text-white/80 leading-none">
                                            {col.title}
                                        </h3>
                                        <span className="text-[9px] text-white/25 block mt-0.5">{col.subtitle}</span>
                                    </div>
                                </div>
                                <span className="text-[12px] font-black tabular-nums text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-md">
                                    {colLeads.length}
                                </span>
                            </div>

                            {/* Corpo da coluna — drop zone */}
                            <div
                                onDragOver={(e) => handleDragOver(e, col.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, col.id)}
                                className={`flex-grow h-0 overflow-y-auto custom-scrollbar space-y-1.5 pb-24 rounded-2xl border transition-colors p-1.5 relative group/col min-h-0 scrollbar-gutter-stable ${
                                    isOver
                                        ? 'bg-white/[0.04] border-white/20'
                                        : isClosingStage && colLeads.length > 0
                                        ? 'bg-[#141418] border-white/[0.06]'
                                        : 'bg-[#0F0F12] border-white/[0.04] hover:border-white/[0.07]'
                                }`}
                            >
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {colLeads.length > 0 ? (
                                        visibleLeads.map(lead => (
                                            <SafeLeadCard key={lead.id} leadId={lead.id} leadName={lead.name} onView={() => onView(lead)}>
                                                <LeadCardV2
                                                    lead={lead}
                                                    onView={onView}
                                                    onManage={onManage}
                                                    onStatusChange={onStatusChange}
                                                    setDraggingLeadId={setDraggingLeadId}
                                                    onMenuOpenChange={(isOpen) => setColumnWithMenuOpen(isOpen ? col.id : null)}
                                                />
                                            </SafeLeadCard>
                                        ))
                                    ) : (
                                        <div className="h-24 flex flex-col items-center justify-center border border-dashed border-white/[0.05] rounded-xl opacity-30 group-hover/col:opacity-50 transition-opacity">
                                            <col.icon size={16} className="mb-1.5 text-white/20" />
                                            <span className="text-[9px] text-white/20 uppercase tracking-widest">Vazio</span>
                                        </div>
                                    )}
                                </AnimatePresence>

                                {hasMore && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setColumnVisibleCount(prev => ({
                                                ...prev,
                                                [col.id]: visibleLimit + LOAD_MORE_STEP
                                            }));
                                        }}
                                        className="w-full py-2 mt-1 rounded-xl border border-dashed border-white/[0.08] text-[10px] font-semibold text-white/30 hover:text-white/50 hover:border-white/15 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <ChevronDown size={10} />
                                        Mais {colLeads.length - visibleLimit} leads
                                    </button>
                                )}

                                {isOver && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="absolute inset-x-2 top-0 h-0.5 bg-white/20 rounded-full z-50"
                                    />
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};
