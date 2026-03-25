'use client';

import React, { useRef, useState } from 'react';
import { Lead, LeadStatus } from '@/lib/types';
import { motion } from 'framer-motion';
import { CarFront, Zap, Activity, Target, ArrowRight } from 'lucide-react';
import { formatPhoneBR } from '@/app/leads/utils/helpers';
import { extractWhatsAppScript } from '@/lib/aiParser';
import { normalizeStatus, STAGE_SLA_HOURS } from '@/constants/status';
import { calculateLeadScore, getScoreLabel } from '@/utils/calculateScore';
import { SourceIcon } from '@/app/leads/components/SourceIcon';
import { MoveMenu } from '@/app/leads/components/MoveMenu';

interface LeadCardV2Props {
    lead: Lead;
    onView: (lead: Lead) => void;
    onManage: (lead: Lead) => void;
    onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
    setDraggingLeadId?: (id: string | null) => void;
}

export const LeadCardV2: React.FC<LeadCardV2Props> = ({ 
    lead, 
    onView, 
    onManage, 
    onStatusChange,
    setDraggingLeadId 
}) => {
    const [activeMoveMenu, setActiveMoveMenu] = useState(false);
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Dynamic Score Logic
    const now = new Date();
    const createdAt = new Date(lead.created_at);
    const diffMs = now.getTime() - createdAt.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 3600));
    const diffDays = Math.floor(diffHours / 24);
    
    const scoreVal = calculateLeadScore({
        status: normalizeStatus(lead.status),
        tempoFunilHoras: diffHours,
        totalInteracoes: 0,
        ultimaInteracaoH: diffHours,
        temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
        temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
    });

    const scoreInfo = getScoreLabel(scoreVal);
    const isHot = scoreVal >= 70;
    const isEmergency = scoreVal >= 90;

    // Tempo por extenso: 1h, 2 dias, 1 semana, 2 meses
    function formatTempoInteiro(ms: number): string {
        const min = Math.floor(ms / 60000);
        const hrs = Math.floor(ms / 3600000);
        const days = Math.floor(ms / 86400000);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        if (months >= 1) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
        if (weeks >= 1) return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
        if (days >= 1) return `${days} ${days === 1 ? 'dia' : 'dias'}`;
        if (hrs >= 1) return `${hrs}h`;
        return `${min}min`;
    }
    const tempoInteiro = formatTempoInteiro(diffMs);

    // Cor do tempo por urgência
    let timeColor = '';
    if (diffHours < 3) timeColor = 'text-emerald-400';
    else if (diffHours < 24) timeColor = 'text-amber-400';
    else if (diffDays < 7) timeColor = 'text-orange-400';
    else timeColor = 'text-red-400';

    // Cor de fundo do avatar pela origem
    function getSourceBg(source?: string, plataforma?: string): string {
        const s = (source || '').toLowerCase();
        const p = (plataforma || '').toLowerCase();
        if (s.includes('whatsapp') || p.includes('whatsapp')) return '#25D36618';
        if (s.includes('instagram') || p.includes('instagram')) return '#E4405F18';
        if (s.includes('facebook') || s.includes('meta') || p.includes('facebook')) return '#1877F218';
        if (s.includes('google') || s.includes('gads')) return '#EA433518';
        return '#dc262618';
    }
    function getSourceBorder(source?: string, plataforma?: string): string {
        const s = (source || '').toLowerCase();
        const p = (plataforma || '').toLowerCase();
        if (s.includes('whatsapp') || p.includes('whatsapp')) return '#25D36630';
        if (s.includes('instagram') || p.includes('instagram')) return '#E4405F30';
        if (s.includes('facebook') || s.includes('meta') || p.includes('facebook')) return '#1877F230';
        if (s.includes('google') || s.includes('gads')) return '#EA433530';
        return '#dc262630';
    }

    const handleSmartClick = () => {
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
            onManage(lead);
        } else {
            clickTimerRef.current = setTimeout(() => {
                onView(lead);
                clickTimerRef.current = null;
            }, 250);
        }
    };

    const handleQuickStrike = (e: React.MouseEvent) => {
        e.stopPropagation();
        const phone = lead.phone.replace(/\D/g, '');
        if (phone.length >= 10) {
            const script = lead.proxima_acao || lead.next_step || `Olá ${lead.name.split(' ')[0]}, sou da Manos Veículos.`;
            const extracted = extractWhatsAppScript(script) || script;
            const url = `https://wa.me/55${phone}?text=${encodeURIComponent(extracted)}`;
            window.open(url, '_blank');
        }
    };

    // Score dot color
    const scoreDotColor = scoreVal >= 70 ? '#E31E24' : scoreVal >= 40 ? '#F59E0B' : '#55555F';

    // ── SLA do estágio atual ──────────────────────────────────
    function normalizeToStageId(status: string): string {
        const s = (status || '').toLowerCase();
        if (['new','received','entrada','novo'].includes(s))                   return 'entrada';
        if (['attempt','contacted','triagem'].includes(s))                     return 'triagem';
        if (['confirmed','scheduled','visited','ataque'].includes(s))          return 'ataque';
        if (['test_drive','proposed','negotiation','fechamento'].includes(s))  return 'fechamento';
        return '';
    }
    const stageId   = normalizeToStageId(lead.status);
    const slaHours  = STAGE_SLA_HOURS[stageId] ?? null;
    // usa updated_at como referência de quando entrou na etapa
    const updatedAt = new Date(lead.updated_at || lead.created_at);
    const hoursInStage = (now.getTime() - updatedAt.getTime()) / 3_600_000;
    const slaBreached = slaHours !== null && hoursInStage >= slaHours;
    const slaPct      = slaHours !== null ? Math.min(100, (hoursInStage / slaHours) * 100) : 0;
    const slaColor    = slaPct >= 100 ? '#ef4444'
                      : slaPct >= 75  ? '#f97316'
                      : slaPct >= 50  ? '#f59e0b'
                      : '#22c55e';

    // Left accent border based on urgency / SLA
    const accentBorder = slaBreached ? 'border-l-red-500'
                       : isEmergency ? 'border-l-red-500'
                       : isHot       ? 'border-l-amber-500/60'
                       : 'border-l-transparent';

    return (
        <div
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('leadId', lead.id);
                e.dataTransfer.effectAllowed = 'move';
                setDraggingLeadId?.(lead.id);
            }}
            onDragEnd={() => setDraggingLeadId?.(null)}
            className="w-full"
        >
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={handleSmartClick}
                className={`relative p-2 rounded-xl border border-white/[0.07] border-l-2 ${accentBorder} bg-[#141418] hover:bg-[#1A1A20] hover:border-white/[0.12] transition-colors cursor-grab active:cursor-grabbing select-none ${
                    activeMoveMenu ? 'z-[250] ring-1 ring-white/20' : 'z-10'
                }`}
            >
                <div className="space-y-2">
                    {/* Linha 1: Avatar (origem) + Nome + Score */}
                    <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                            {/* Avatar — ícone da origem */}
                            <div
                                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border overflow-hidden"
                                style={{
                                    backgroundColor: getSourceBg(lead.source, lead.plataforma_meta),
                                    borderColor: getSourceBorder(lead.source, lead.plataforma_meta),
                                }}
                            >
                                <div className="scale-[0.65]">
                                    <SourceIcon source={lead.source} name={lead.name} plataforma_meta={lead.plataforma_meta} className="text-[14px] font-bold text-white/60" />
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-semibold text-[12px] text-white/90 truncate leading-tight">
                                    {lead.name.split(' ')[0]}{lead.name.split(' ').length > 1 ? ' ' + lead.name.split(' ')[1][0] + '.' : ''}
                                </h4>
                                {/* Tempo por extenso + consultor */}
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className={`text-[10px] font-medium ${timeColor}`}>
                                        {tempoInteiro}
                                    </span>
                                    {lead.consultant_name && (
                                        <span className="text-[9px] font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1 py-px rounded leading-none">
                                            {lead.consultant_name.split(' ')[0]}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Score */}
                        <div className="flex items-center gap-0.5 shrink-0">
                            <span className="text-[12px] font-bold tabular-nums text-white/80">{scoreVal}</span>
                            <span className="text-[8px] text-white/30">%</span>
                            <span className="w-1.5 h-1.5 rounded-full ml-0.5 shrink-0" style={{ backgroundColor: scoreDotColor }} />
                        </div>
                    </div>

                    {/* Linha 2: Interesse */}
                    <div className="flex items-center gap-1 px-1.5 py-1 bg-white/[0.03] rounded-lg border border-white/[0.04]">
                        <CarFront size={9} className="text-white/20 shrink-0" />
                        <span className="text-[10px] text-white/50 truncate">
                            {lead.vehicle_interest || 'Interesse não definido'}
                        </span>
                    </div>

                    {/* SLA Bar */}
                    {slaHours !== null && (
                        <div className="space-y-0.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: slaColor }}>
                                    {slaBreached ? '⚠ SLA EXCEDIDO' : `SLA ${stageId}`}
                                </span>
                                <span className="text-[8px] tabular-nums" style={{ color: slaColor }}>
                                    {Math.round(hoursInStage)}h / {slaHours}h
                                </span>
                            </div>
                            <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${slaPct}%`, backgroundColor: slaColor }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Linha 3: Ações */}
                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                        <div className="flex items-center gap-1">
                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveMoveMenu(!activeMoveMenu); }}
                                    className={`h-6 px-2 rounded-lg flex items-center gap-1 transition-all border text-[10px] font-medium ${
                                        activeMoveMenu
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'bg-transparent border-white/[0.06] text-white/35 hover:text-white/65 hover:border-white/15'
                                    }`}
                                >
                                    <ArrowRight size={10} className={activeMoveMenu ? 'rotate-90 transition-transform' : 'transition-transform'} />
                                    Mover
                                </button>
                                <MoveMenu
                                    isOpen={activeMoveMenu}
                                    currentStatus={lead.status as LeadStatus}
                                    onStatusChange={(status) => onStatusChange(lead.id, status)}
                                    onClose={() => setActiveMoveMenu(false)}
                                />
                            </div>

                            <button
                                onClick={handleQuickStrike}
                                className={`h-6 w-6 rounded-lg flex items-center justify-center transition-all border ${
                                    isEmergency
                                        ? 'bg-red-600/15 border-red-500/25 text-red-400'
                                        : 'bg-transparent border-white/[0.06] text-white/25 hover:bg-white/[0.06] hover:text-white/60'
                                }`}
                                title="WhatsApp"
                            >
                                <Zap size={10} />
                            </button>
                        </div>

                        <span className="text-[9px] font-bold px-1 py-0.5 rounded leading-none" style={{ color: scoreInfo.color, backgroundColor: `${scoreInfo.color}12` }}>
                            {scoreInfo.label}
                        </span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
