'use client';
import React from 'react';
import { Bot, Zap, Sparkles, MessageSquare, Phone, ChevronRight } from 'lucide-react';
import { Lead } from '../types';

interface TacticalActionProps {
    lead: Lead;
    isAnalyzing: boolean;
    recalculateStrategy: () => void;
    handleExecuteAIDirective: () => void;
    onTabChange: (tab: 'dashboard' | 'timeline' | 'followup' | 'arsenal') => void;
    fallbackAction: { emoji: string; titulo: string; descricao: string };
}

export const TacticalAction: React.FC<TacticalActionProps> = ({
    lead,
    isAnalyzing,
    recalculateStrategy,
    handleExecuteAIDirective,
    onTabChange,
    fallbackAction,
}) => {
    const actionText = lead.proxima_acao || lead.next_step || fallbackAction.descricao;

    return (
        <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
            {/* Cabeçalho da seção */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                    <Bot size={14} className="text-white/40" />
                    <span className="text-[11px] font-semibold text-white/60 uppercase tracking-widest">
                        Próxima ação IA
                    </span>
                </div>
                <button
                    onClick={recalculateStrategy}
                    disabled={isAnalyzing}
                    className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                >
                    <Sparkles size={11} className={isAnalyzing ? 'animate-spin' : ''} />
                    {isAnalyzing ? 'Analisando…' : 'Recalcular'}
                </button>
            </div>

            {/* Texto da ação */}
            <div className="px-4 py-3 border-b border-white/[0.05]">
                <p className="text-[13px] text-white/70 leading-relaxed">
                    {actionText}
                </p>
            </div>

            {/* Botões de ação — estilo lista poker app */}
            <button
                onClick={handleExecuteAIDirective}
                className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors group"
            >
                <div className="h-8 w-8 rounded-lg bg-red-600/10 border border-red-500/15 flex items-center justify-center shrink-0">
                    <Zap size={14} className="text-red-400" />
                </div>
                <div className="flex-1 text-left">
                    <p className="text-[13px] font-semibold text-white">Executar ação</p>
                    <p className="text-[11px] text-white/35">Abrir scripts de follow-up</p>
                </div>
                <ChevronRight size={15} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </button>

            <button
                onClick={() => onTabChange('followup')}
                className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors group"
            >
                <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    <MessageSquare size={14} className="text-white/40" />
                </div>
                <div className="flex-1 text-left">
                    <p className="text-[13px] font-medium text-white/75">Script WhatsApp</p>
                    <p className="text-[11px] text-white/30">Ver templates da etapa atual</p>
                </div>
                <ChevronRight size={15} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </button>

            <button
                onClick={() => onTabChange('timeline')}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.04] transition-colors group"
            >
                <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    <Phone size={14} className="text-white/40" />
                </div>
                <div className="flex-1 text-left">
                    <p className="text-[13px] font-medium text-white/75">Ver histórico</p>
                    <p className="text-[11px] text-white/30">Timeline de interações</p>
                </div>
                <ChevronRight size={15} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </button>
        </div>
    );
};
