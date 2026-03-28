'use client';

import React from 'react';
import { Lead } from '@/lib/types';
import { motion } from 'framer-motion';
import { ArrowRight, CarFront, Flame, Zap, Phone } from 'lucide-react';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';
import { calculateLeadScore, getScoreLabel } from '@/utils/calculateScore';
import { normalizeStatus } from '@/constants/status';

interface AIOpportunityCardProps {
    lead: Lead;
    onAction: (lead: Lead) => void;
    userName: string;
    isFeatured?: boolean;
}

export const AIOpportunityCard: React.FC<AIOpportunityCardProps> = ({ lead, onAction, isFeatured = false }) => {
    const now = new Date();
    const createdAt = new Date(lead.created_at);
    const tempoFunilH = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));

    const scoreVal = calculateLeadScore({
        status: normalizeStatus(lead.status),
        tempoFunilHoras: tempoFunilH,
        totalInteracoes: 0,
        ultimaInteracaoH: tempoFunilH,
        temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
        temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
    });

    const displayScore = Math.min(scoreVal, 99);
    const scoreInfo = getScoreLabel(scoreVal);
    const isUrgent = lead.ai_score === 99 || scoreVal >= 95;
    const isHot = scoreVal >= 85;

    const getScoreColor = () => {
        if (isUrgent) return '#ef4444';
        if (scoreVal >= 85) return '#f97316';
        if (scoreVal >= 70) return '#f59e0b';
        return '#22c55e';
    };
    const color = getScoreColor();

    const getHoursText = () => {
        if (tempoFunilH < 1) return `${Math.round(tempoFunilH * 60)}min atrás`;
        if (tempoFunilH < 24) return `${Math.round(tempoFunilH)}h atrás`;
        return `${Math.round(tempoFunilH / 24)}d atrás`;
    };

    if (isFeatured) {
        return (
            <motion.div
                layout
                whileHover={{ scale: 1.01 }}
                onClick={() => onAction(lead)}
                className="relative p-5 rounded-2xl border cursor-pointer group overflow-hidden"
                style={{
                    background: `linear-gradient(135deg, #0f0f12 60%, ${color}08)`,
                    borderColor: `${color}30`,
                    boxShadow: `0 0 30px ${color}10, inset 0 0 30px ${color}05`,
                }}
            >
                {/* Glow top-right */}
                <div className="absolute top-0 right-0 w-32 h-32 blur-[50px] -mr-8 -mt-8 pointer-events-none rounded-full"
                    style={{ backgroundColor: `${color}15` }} />

                {isUrgent && (
                    <motion.div
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest"
                        style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
                    >
                        <Flame size={9} />
                        URGENTE
                    </motion.div>
                )}

                <div className="flex items-center gap-4 relative z-10">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                        <div
                            className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-black border"
                            style={{
                                backgroundColor: `${color}15`,
                                color,
                                borderColor: `${color}30`,
                                boxShadow: `0 0 15px ${color}20`,
                            }}
                        >
                            {lead.name[0].toUpperCase()}
                        </div>
                        <motion.div
                            animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0.4, 0.8] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0f0f12]"
                            style={{ backgroundColor: color }}
                        />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-black text-white tracking-tight">
                                {lead.name.split(' ').slice(0, 2).join(' ')}
                            </h3>
                            <span
                                className="text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0"
                                style={{ color, borderColor: `${color}30`, backgroundColor: `${color}10` }}
                            >
                                {displayScore}%
                            </span>
                        </div>
                        <p className="text-[12px] text-white/40 font-medium mb-1.5">{formatPhoneBR(lead.phone)}</p>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5 text-[11px] text-white/30">
                                <CarFront size={11} className="shrink-0" />
                                <span className="truncate max-w-[140px]">{lead.vehicle_interest || 'Interesse geral'}</span>
                            </div>
                            <span className="text-[10px] text-white/20">{getHoursText()}</span>
                        </div>
                    </div>

                    {/* CTA */}
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); onAction(lead); }}
                        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
                        style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}30` }}
                    >
                        <ArrowRight size={16} />
                    </motion.button>
                </div>
            </motion.div>
        );
    }

    // Compact variant
    return (
        <motion.div
            layout
            whileHover={{ x: 2 }}
            onClick={() => onAction(lead)}
            className="relative flex items-center gap-3 py-3 px-4 rounded-xl border border-white/[0.07] hover:border-white/[0.14] bg-[#0d0d10] cursor-pointer group transition-all"
        >
            <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 border"
                style={{ backgroundColor: `${color}12`, color, borderColor: `${color}25` }}
            >
                {lead.name[0].toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold text-white/90 truncate">{lead.name.split(' ')[0]}</p>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ color, backgroundColor: `${color}15` }}>
                        {displayScore}%
                    </span>
                </div>
                <p className="text-[10px] text-white/25 truncate">{lead.vehicle_interest || formatPhoneBR(lead.phone)}</p>
            </div>

            <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 shrink-0 transition-colors" />
        </motion.div>
    );
};
