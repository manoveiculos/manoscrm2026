'use client';

import React, { useRef, useState } from 'react';
import { Lead, LeadStatus } from '@/lib/types';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';
import { safeDisplayName, safeFirstName, safePhone, safeWhatsAppUrl, safeVendorFirstName } from '@/lib/shared_utils/safeLead';
import { CarFront, Zap, Activity, Target, ChevronDown } from 'lucide-react';
import { extractWhatsAppScript } from '@/lib/aiParser';
import { motion, AnimatePresence } from 'framer-motion';
import { normalizeStatus, getStatusConfig } from '@/constants/status';
import { calculateLeadScore, getScoreLabel } from '@/utils/calculateScore';
import { getLeadUnqualifiedReason } from '@/utils/leadQualification';
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
        const script = lead.proxima_acao || lead.next_step || `Olá ${safeFirstName(lead.name)}, tudo bem?`;
        const extracted = extractWhatsAppScript(script) || script;
        const url = safeWhatsAppUrl(lead.phone, extracted);
        if (url) window.open(url, '_blank');
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
                    const aiScore = Number(lead.ai_score) || 0;
                    const calculated = calculateLeadScore({
                        status: normalizeStatus(lead.status),
                        tempoFunilHoras: tempoFunilH,
                        totalInteracoes: 0,
                        ultimaInteracaoH: tempoFunilH,
                        temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
                        temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
                    });
                    
                    // Se o status for perdido/vendido, usa o calculado (0/100). 
                    // Caso contrário, se existir aiScore da IA, respeita ele.
                    const score = (normalizeStatus(lead.status) === 'perdido' || normalizeStatus(lead.status) === 'vendido') 
                        ? calculated 
                        : (aiScore > 0 ? aiScore : calculated);
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
                                    score >= 80
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
                                        {safeDisplayName(lead.name)}
                                    </span>
                                    <span
                                        className="shrink-0 inline-block px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide"
                                        style={{ color: status.hex, backgroundColor: `${status.hex}12`, border: `1px solid ${status.hex}20` }}
                                    >
                                        {status.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-white/30 truncate">
                                    <span className="tabular-nums shrink-0">{formatPhoneBR(safePhone(lead.phone))}</span>
                                    <span className="text-white/10 shrink-0">·</span>
                                    <span className="text-blue-400/80 font-medium truncate">
                                        {lead.cidade || lead.region || 'Não informado'}
                                    </span>
                                    {lead.vehicle_interest && lead.vehicle_interest !== '---' && (
                                        <>
                                            <span className="text-white/10 shrink-0">·</span>
                                            <span className="truncate">{lead.vehicle_interest}</span>
                                        </>
                                    )}
                                </div>
                                {(() => {
                                    const reason = getLeadUnqualifiedReason(lead);
                                    if (!reason) return null;
                                    return (
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <div className="h-1 w-1 rounded-full bg-amber-500/40" />
                                            <span className="text-[9px] font-black text-amber-500/40 uppercase tracking-widest">{reason}</span>
                                        </div>
                                    );
                                })()}
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
                                const aiScore = Number(lead.ai_score) || 0;
                                const calculated = calculateLeadScore({
                                    status: normalizeStatus(lead.status),
                                    tempoFunilHoras: tempoFunilH,
                                    totalInteracoes: 0,
                                    ultimaInteracaoH: tempoFunilH,
                                    temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
                                    temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
                                });

                                const score = (normalizeStatus(lead.status) === 'perdido' || normalizeStatus(lead.status) === 'vendido') 
                                    ? calculated 
                                    : (aiScore > 0 ? aiScore : calculated);
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
                                                    score >= 80
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
                                                    {safeDisplayName(lead.name)}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] text-white/30 tabular-nums">
                                                        {formatPhoneBR(safePhone(lead.phone))}
                                                    </span>
                                                    {(() => {
                                                        const reason = getLeadUnqualifiedReason(lead);
                                                        if (!reason) return null;
                                                        return (
                                                            <>
                                                                <span className="h-2 w-[1px] bg-white/10" />
                                                                <span className="text-[8px] font-black text-amber-500/30 uppercase tracking-[0.15em] whitespace-nowrap">{reason}</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
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
                                            <div className="relative">
                                                {role === 'admin' && consultants.length > 0 ? (
                                                    <>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveConsultantMenu(activeConsultantMenu === lead.id ? null : lead.id);
                                                            }}
                                                            className="text-[11px] text-white/50 truncate block max-w-[110px] hover:text-white/80 transition-colors flex items-center gap-1"
                                                        >
                                                            {lead.vendedor || lead.primeiro_vendedor || '—'}
                                                            <ChevronDown size={10} className="text-white/30 shrink-0" />
                                                        </button>
                                                        {activeConsultantMenu === lead.id && (
                                                            <div className="absolute z-50 top-full left-0 mt-1 bg-[#1a1a1e] border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px] max-h-[200px] overflow-y-auto">
                                                                {consultants.map((c) => (
                                                                    <button
                                                                        key={c.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onConsultantChange?.(lead.id, c.id);
                                                                            setActiveConsultantMenu(null);
                                                                        }}
                                                                        className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                                                                            lead.assigned_consultant_id === c.id
                                                                                ? 'text-emerald-400 bg-emerald-400/10'
                                                                                : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                                                                        }`}
                                                                    >
                                                                        {c.name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-[11px] text-white/50 truncate block max-w-[110px]">
                                                        {lead.vendedor || lead.primeiro_vendedor || '—'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[11px] text-white/40 uppercase tracking-tighter truncate block max-w-[100px]">
                                                {lead.source || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] font-bold tabular-nums" style={{ color: score >= 80 ? info.color : 'rgba(255,255,255,0.35)' }}>
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
