'use client';

import React, { useRef } from 'react';
import { Lead } from '@/lib/types';
import { formatPhoneBR } from '@/app/leads/utils/helpers';
import { CarFront, Zap, Activity, Target } from 'lucide-react';
import { extractWhatsAppScript } from '@/lib/aiParser';
import { motion } from 'framer-motion';
import { normalizeStatus, getStatusConfig } from '@/constants/status';
import { calculateLeadScore, getScoreLabel } from '@/utils/calculateScore';

interface LeadListV2Props {
    leads: Lead[];
    onView: (lead: Lead) => void;
    onManage: (lead: Lead) => void;
}

export function LeadListV2({ leads, onView, onManage }: LeadListV2Props) {
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    return (
        <div className="w-full bg-[#141418] border border-white/[0.07] rounded-2xl overflow-hidden">
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
                            const score = calculateLeadScore({
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
                                    {/* WhatsApp */}
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

                                    {/* Nome + Telefone */}
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

                                    {/* Interesse */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <CarFront size={11} className="text-white/20 shrink-0" />
                                            <span className="text-[12px] text-white/50 truncate max-w-[160px]">
                                                {lead.vehicle_interest || '—'}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-3 text-center">
                                        <span
                                            className="inline-block px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide"
                                            style={{ color: status.hex, backgroundColor: `${status.hex}12`, border: `1px solid ${status.hex}20` }}
                                        >
                                            {status.label}
                                        </span>
                                    </td>

                                    <td className="px-4 py-3">
                                        <span className="text-[11px] text-white/50 truncate block max-w-[110px]">
                                            {lead.consultant_name || lead.primeiro_vendedor || '—'}
                                        </span>
                                    </td>

                                    {/* Origem */}
                                    <td className="px-4 py-3">
                                        <span className="text-[11px] text-white/40 uppercase tracking-tighter truncate block max-w-[100px]">
                                            {lead.source || '—'}
                                        </span>
                                    </td>

                                    {/* Score */}
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

                                    {/* Data / Hora */}
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
            {leads.length === 0 && (
                <div className="py-16 text-center">
                    <Target size={20} className="mx-auto mb-3 text-white/10" />
                    <p className="text-[11px] text-white/20 uppercase tracking-widest">Nenhum lead encontrado</p>
                </div>
            )}
        </div>
    );
}
