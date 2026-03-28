'use client';

import React, { useRef, useState } from 'react';
import { Lead, LeadStatus } from '@/lib/types';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';
import { CarFront, Zap, Activity, Target, ChevronDown } from 'lucide-react';
import { extractWhatsAppScript } from '@/lib/aiParser';
import { motion, AnimatePresence } from 'framer-motion';
import { normalizeStatus, getStatusConfig } from '@/constants/status';
import { calculateLeadScore, getScoreLabel } from '@/utils/calculateScore';
import { MoveMenu } from '@/components/shared_leads/MoveMenu';

interface LeadListV2Props {
    leads: Lead[];
    onView: (lead: Lead) => void;
    onManage: (lead: Lead) => void;
    onStatusChange?: (leadId: string, newStatus: LeadStatus) => void;
    onConsultantChange?: (leadId: string, consultantId: string) => void;
    role?: 'admin' | 'consultant';
    consultants?: any[];
}

export function LeadListV2({ 
    leads, 
    onView, 
    onManage, 
    onStatusChange, 
    onConsultantChange,
    role = 'consultant',
    consultants = []
}: LeadListV2Props) {
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [activeStatusMenu, setActiveStatusMenu] = useState<string | null>(null);
    const [activeConsultantMenu, setActiveConsultantMenu] = useState<string | null>(null);

    const handleSmartClick = (lead: Lead) => {
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

    const handleQuickStrike = (e: React.MouseEvent, lead: Lead) => {
        e.stopPropagation();
        const phone = lead.phone.replace(/\D/g, '');
        if (phone.length >= 10) {
            const script = lead.proxima_acao || lead.next_step || `Olá ${lead.name.split(' ')[0]}, tudo bem?`;
            const extracted = extractWhatsAppScript(script) || script;
            window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(extracted)}`, '_blank');
        }
    };

    const getStatusStyle = (rawStatus: string) => {
        const config = getStatusConfig(rawStatus);
        return {
            color: `text-[${config.color}]` || 'text-white/40',
            border: `border-[${config.color}]/20` || 'border-white/10',
            label: config.label,
            hex: config.color
        };
    };

    if (leads.length === 0) {
        return (
            <div className="py-16 text-center bg-[#141418] border border-white/[0.07] rounded-2xl">
                <Target size={20} className="mx-auto mb-3 text-white/10" />
                <p className="text-[11px] text-white/20 uppercase tracking-widest">Nenhum lead encontrado</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* ── MOBILE: cards empilhados (< md) ── */}
            <div className="flex flex-col gap-2 md:hidden">
                {leads.map((lead) => {
                    const status = getStatusStyle(lead.status);
                    const now = new Date();
                    const createdAt = new Date(lead.created_at);
                    const tempoFunilH = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
                    const aiScore = Number(lead.ai_score);
                    const score = aiScore > 0 ? aiScore : calculateLeadScore({
                        status: normalizeStatus(lead.status),
                        tempoFunilHoras: tempoFunilH,
                        totalInteracoes: 0,
                        ultimaInteracaoH: tempoFunilH,
                        temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
                        temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
                    });
                    const info = getScoreLabel(score);

                    return (
                        <div
                            key={lead.id}
                            onClick={() => handleSmartClick(lead)}
                            className="bg-[#141418] border border-white/[0.07] rounded-xl px-3 py-3 flex items-center gap-3 cursor-pointer active:bg-white/[0.04] transition-colors"
                        >
                            {/* Botão WhatsApp */}
                            <button
                                onClick={(e) => handleQuickStrike(e, lead)}
                                className={`shrink-0 h-10 w-10 rounded-lg flex items-center justify-center border transition-all ${
                                    score >= 70
                                        ? 'bg-red-600/15 border-red-500/25 text-red-400 active:bg-red-600 active:text-white'
                                        : 'bg-white/[0.04] border-white/[0.06] text-white/30 active:bg-white/10'
                                }`}
                            >
                                <Zap size={14} />
                            </button>

                            {/* Dados principais */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <span className="text-[13px] font-semibold text-white/85 truncate">
                                        {lead.name.split(' ')[0]}{lead.name.split(' ').length > 1 ? ' ' + lead.name.split(' ')[1][0] + '.' : ''}
                                    </span>
                                    <span
                                        className="shrink-0 inline-block px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide"
                                        style={{ color: status.hex, backgroundColor: `${status.hex}12`, border: `1px solid ${status.hex}20` }}
                                    >
                                        {status.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-white/30 truncate">
                                    <span className="tabular-nums shrink-0">{formatPhoneBR(lead.phone)}</span>
                                    {(() => {
                                        const vendorName = lead.vendedor || lead.consultant_name;
                                        if (!vendorName) return null;
                                        return (
                                            <>
                                                <span className="text-white/10 shrink-0">·</span>
                                                <span className="text-blue-400/80 font-medium truncate">
                                                    {vendorName.split(' ')[0]}
                                                </span>
                                            </>
                                        );
                                    })()}
                                    {lead.vehicle_interest && lead.vehicle_interest !== '---' && (
                                        <>
                                            <span className="text-white/10 shrink-0">·</span>
                                            <span className="truncate">{lead.vehicle_interest}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Score + data */}
                            <div className="shrink-0 flex flex-col items-end gap-1">
                                <span className="text-[13px] font-bold tabular-nums" style={{ color: score >= 70 ? info.color : 'rgba(255,255,255,0.35)' }}>
                                    {score}%
                                </span>
                                <span className="text-[10px] text-white/25 tabular-nums">
                                    {new Date(lead.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── DESKTOP: tabela (≥ md) ── */}
            <div className="hidden md:block bg-[#141418] border border-white/[0.07] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse table-fixed min-w-[860px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] bg-[#0F0F12]">
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest w-12"></th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest min-w-[180px]">Nome</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest min-w-[140px]">Interesse</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest w-32 text-center">Status</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest w-32">Consultor</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest w-28">Origem</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest w-24">Score</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest w-32 text-right">Data/Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.map((lead, idx) => {
                                const status = getStatusStyle(lead.status);
                                const now = new Date();
                                const createdAt = new Date(lead.created_at);
                                const tempoFunilH = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
                                const aiScore = Number(lead.ai_score);
                                const score = aiScore > 0 ? aiScore : calculateLeadScore({
                                    status: normalizeStatus(lead.status),
                                    tempoFunilHoras: tempoFunilH,
                                    totalInteracoes: 0,
                                    ultimaInteracaoH: tempoFunilH,
                                    temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
                                    temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
                                });
                                const info = getScoreLabel(score);

                                return (
                                    <tr
                                        key={lead.id}
                                        onClick={() => handleSmartClick(lead)}
                                        className={`group cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-white/[0.03] ${
                                            idx % 2 === 0 ? 'bg-[#141418]' : 'bg-[#111115]'
                                        }`}
                                    >
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={(e) => handleQuickStrike(e, lead)}
                                                className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all border ${
                                                    score >= 70
                                                        ? 'bg-red-600/15 border-red-500/25 text-red-400 hover:bg-red-600 hover:text-white'
                                                        : 'bg-white/[0.04] border-white/[0.06] text-white/20 hover:bg-white/10 hover:text-white/60'
                                                }`}
                                            >
                                                <Zap size={12} />
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[13px] font-semibold text-white/85 group-hover:text-white transition-colors truncate">
                                                    {lead.name.split(' ')[0]}{lead.name.split(' ').length > 1 ? ' ' + lead.name.split(' ')[1][0] + '.' : ''}
                                                </span>
                                                <span className="text-[11px] text-white/30 tabular-nums">
                                                    {formatPhoneBR(lead.phone)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <CarFront size={11} className="text-white/20 shrink-0" />
                                                <span className="text-[12px] text-white/50 truncate max-w-[160px]">
                                                    {lead.vehicle_interest || '—'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="relative inline-block">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveStatusMenu(activeStatusMenu === lead.id ? null : lead.id);
                                                    }}
                                                    className="inline-block px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all hover:brightness-125 active:scale-95"
                                                    style={{ color: status.hex, backgroundColor: `${status.hex}12`, border: `1px solid ${status.hex}20` }}
                                                >
                                                    {status.label}
                                                </button>
                                                
                                                <MoveMenu 
                                                    isOpen={activeStatusMenu === lead.id}
                                                    currentStatus={lead.status as LeadStatus}
                                                    onStatusChange={(newStatus) => {
                                                        onStatusChange?.(lead.id, newStatus);
                                                        setActiveStatusMenu(null);
                                                    }}
                                                    onClose={() => setActiveStatusMenu(null)}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {role === 'admin' ? (
                                                <div className="relative">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveConsultantMenu(activeConsultantMenu === lead.id ? null : lead.id);
                                                        }}
                                                        className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white transition-colors group/cons"
                                                    >
                                                        <span className="truncate block max-w-[110px]">
                                                            {lead.vendedor || lead.consultant_name || lead.primeiro_vendedor || '—'}
                                                        </span>
                                                        <ChevronDown size={10} className="text-white/20 group-hover/cons:text-white/50 transition-colors" />
                                                    </button>
                                                    
                                                    <AnimatePresence>
                                                        {activeConsultantMenu === lead.id && (
                                                            <>
                                                                <div 
                                                                    className="fixed inset-0 z-[100]" 
                                                                    onClick={(e) => { e.stopPropagation(); setActiveConsultantMenu(null); }} 
                                                                />
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                                    className="absolute left-0 mt-2 w-48 bg-[#1A1A20] border border-white/10 rounded-xl shadow-2xl p-1.5 z-[110] overflow-hidden"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-0.5">
                                                                        {consultants.map(c => (
                                                                            <button
                                                                                key={c.id}
                                                                                onClick={() => {
                                                                                    onConsultantChange?.(lead.id, c.id);
                                                                                    setActiveConsultantMenu(null);
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 rounded-lg text-[11px] text-white/60 hover:bg-white/5 hover:text-white transition-all flex items-center justify-between group/opt"
                                                                            >
                                                                                {c.name}
                                                                                {(lead.assigned_consultant_id === c.id || lead.primeiro_vendedor === c.name) && (
                                                                                    <div className="w-1 h-1 rounded-full bg-red-500" />
                                                                                )}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-white/50 truncate block max-w-[110px]">
                                                    {lead.vendedor || lead.consultant_name || lead.primeiro_vendedor || '—'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[11px] text-white/40 uppercase tracking-tighter truncate block max-w-[100px]">
                                                {lead.source || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] font-bold tabular-nums" style={{ color: score >= 70 ? info.color : 'rgba(255,255,255,0.35)' }}>
                                                    {score}%
                                                </span>
                                                <div className="h-1 w-10 bg-white/[0.06] rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: info.color }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[11px] text-white/70 tabular-nums">
                                                    {new Date(lead.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                                </span>
                                                <span className="text-[10px] text-white/20 tabular-nums">
                                                    {new Date(lead.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
