'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Lead } from '@/lib/types';
import { leadService } from '@/lib/leadService';
import { supabase } from '@/lib/supabase';
import { normalizeStatus, STAGE_SLA_HOURS, getStatusConfig } from '@/constants/status';
import { safeDisplayName, safePhone, safeWhatsAppUrl } from '@/lib/shared_utils/safeLead';
import {
    Flame, Clock, TrendingDown, Target, MessageSquare,
    ChevronRight, Trophy, Crosshair, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SniperPanelProps {
    consultantId?: string;
    onOpenLead: (lead: Lead) => void;
    salesCount: number;
    salesGoal?: number;
    isAdmin?: boolean;
}

interface SniperLaneProps {
    title: string;
    icon: React.ElementType;
    accent: string;
    leads: Lead[];
    onOpenLead: (lead: Lead) => void;
    emptyText: string;
    renderBadge: (lead: Lead) => React.ReactNode;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SniperPanel({ consultantId, onOpenLead, salesCount, salesGoal, isAdmin = false }: SniperPanelProps) {
    const effectiveGoal = salesGoal ?? (isAdmin ? 20 : 5);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeads = async () => {
            setLoading(true);
            try {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
                const result = await leadService.getLeadsPaginated(supabase as any, {
                    consultantId,
                    role: consultantId ? 'consultant' : 'admin',
                    pipelineOnly: true,
                    limit: 200,
                    startDate: thirtyDaysAgo,
                });
                setLeads(result.leads);
            } catch {
                /* silencioso */
            } finally {
                setLoading(false);
            }
        };
        fetchLeads();
    }, [consultantId]);

    // ── LANE 1: Quentes Agora (score >= 70 OR classification hot) ──
    const hotLeads = useMemo(() => {
        return leads
            .filter(l => (l.ai_score && l.ai_score >= 70) || l.ai_classification === 'hot')
            .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0))
            .slice(0, 5);
    }, [leads]);

    // ── LANE 2: SLA Estourado (tempo no estágio > SLA configurado) ──
    const slaBreached = useMemo(() => {
        const now = Date.now();
        return leads
            .filter(l => {
                const stage = normalizeStatus(l.status);
                const slaHours = STAGE_SLA_HOURS[stage];
                if (!slaHours) return false;
                const ref = l.updated_at || l.created_at;
                if (!ref) return false;
                const hoursInStage = (now - new Date(ref).getTime()) / 3_600_000;
                return hoursInStage > slaHours;
            })
            .sort((a, b) => {
                const aStage = normalizeStatus(a.status);
                const bStage = normalizeStatus(b.status);
                const aRef = a.updated_at || a.created_at;
                const bRef = b.updated_at || b.created_at;
                const aExcess = (Date.now() - new Date(aRef).getTime()) / 3_600_000 - (STAGE_SLA_HOURS[aStage] || 999);
                const bExcess = (Date.now() - new Date(bRef).getTime()) / 3_600_000 - (STAGE_SLA_HOURS[bStage] || 999);
                return bExcess - aExcess;
            })
            .slice(0, 5);
    }, [leads]);

    // ── LANE 3: Esfriando (churn_probability > 50) ──
    const churnRisk = useMemo(() => {
        return leads
            .filter(l => l.churn_probability && l.churn_probability > 50)
            .sort((a, b) => (b.churn_probability || 0) - (a.churn_probability || 0))
            .slice(0, 5);
    }, [leads]);

    // ── Meta ──
    const progress = Math.min(100, effectiveGoal > 0 ? (salesCount / effectiveGoal) * 100 : 0);
    const remaining = Math.max(0, effectiveGoal - salesCount);
    const goalMet = salesCount >= effectiveGoal;

    if (loading) {
        return <SniperSkeleton />;
    }

    return (
        <div className="w-full space-y-5">
            {/* ── META DO MÊS ── */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${goalMet ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-red-500/10 border border-red-500/15'}`}>
                            {goalMet ? <Trophy size={14} className="text-emerald-400" /> : <Target size={14} className="text-red-400" />}
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Meta do Mês</p>
                            <p className="text-[14px] font-black text-white leading-tight">
                                <span className={goalMet ? 'text-emerald-400' : 'text-white'}>{salesCount}</span>
                                <span className="text-white/20"> / {effectiveGoal} vendas</span>
                            </p>
                        </div>
                    </div>
                    {!goalMet && (
                        <span className="text-[11px] font-bold text-white/35">
                            Faltam <span className="text-red-400 font-black">{remaining}</span>
                        </span>
                    )}
                    {goalMet && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                            Meta batida!
                        </span>
                    )}
                </div>
                <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className={`h-full rounded-full ${goalMet ? 'bg-emerald-500' : progress > 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    />
                </div>
            </div>

            {/* ── SNIPER LANES ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SniperLane
                    title="QUENTES AGORA"
                    icon={Flame}
                    accent="#ef4444"
                    leads={hotLeads}
                    onOpenLead={onOpenLead}
                    emptyText="Nenhum lead quente"
                    renderBadge={(l) => <ScoreBadge score={l.ai_score || 0} />}
                />
                <SniperLane
                    title="CLIENTES ESPERANDO"
                    icon={Clock}
                    accent="#f59e0b"
                    leads={slaBreached}
                    onOpenLead={onOpenLead}
                    emptyText="Nenhum cliente esperando"
                    renderBadge={(l) => <SlaBadge lead={l} />}
                />
                <SniperLane
                    title="ESFRIANDO"
                    icon={TrendingDown}
                    accent="#8b5cf6"
                    leads={churnRisk}
                    onOpenLead={onOpenLead}
                    emptyText="Sem risco de churn"
                    renderBadge={(l) => <ChurnBadge probability={l.churn_probability || 0} />}
                />
            </div>
        </div>
    );
}

// ─── Lane Component ──────────────────────────────────────────────────────────

function SniperLane({ title, icon: Icon, accent, leads, onOpenLead, emptyText, renderBadge }: SniperLaneProps) {
    return (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                    <div
                        className="h-6 w-6 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${accent}15`, color: accent }}
                    >
                        <Icon size={12} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{title}</span>
                </div>
                <span
                    className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md"
                    style={{ color: accent, backgroundColor: `${accent}15` }}
                >
                    {leads.length}
                </span>
            </div>

            {/* Leads */}
            <div className="divide-y divide-white/[0.04]">
                {leads.length > 0 ? (
                    leads.map((lead) => (
                        <SniperLeadRow
                            key={lead.id}
                            lead={lead}
                            onOpenLead={onOpenLead}
                            badge={renderBadge(lead)}
                        />
                    ))
                ) : (
                    <div className="px-4 py-6 text-center">
                        <p className="text-[11px] text-white/20">{emptyText}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Lead Row ────────────────────────────────────────────────────────────────

function SniperLeadRow({ lead, onOpenLead, badge }: { lead: Lead; onOpenLead: (l: Lead) => void; badge: React.ReactNode }) {
    const waUrl = safeWhatsAppUrl(lead.phone);
    const statusCfg = getStatusConfig(lead.status);

    return (
        <button
            onClick={() => onOpenLead(lead)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors group text-left"
        >
            {/* Avatar */}
            <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black"
                style={{ backgroundColor: `${statusCfg.color}15`, color: statusCfg.color }}
            >
                {(lead.name || '?')[0].toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white/80 truncate group-hover:text-white transition-colors">
                    {safeDisplayName(lead.name)}
                </p>
                <p className="text-[10px] text-white/25 truncate">
                    {lead.vehicle_interest || safePhone(lead.phone) || 'Sem dados'}
                </p>
            </div>

            {/* Badge */}
            {badge}

            {/* WhatsApp quick action */}
            {waUrl && (
                <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 w-7 rounded-lg border border-[#25D366]/20 bg-[#25D366]/8 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#25D366]/20"
                    title="WhatsApp"
                >
                    <MessageSquare size={11} className="text-[#25D366]" />
                </a>
            )}

            <ChevronRight size={12} className="text-white/10 group-hover:text-white/30 shrink-0 transition-colors" />
        </button>
    );
}

// ─── Badge Components ────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
    const color = score >= 85 ? '#ef4444' : score >= 70 ? '#f59e0b' : '#6b7280';
    return (
        <span
            className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md shrink-0"
            style={{ color, backgroundColor: `${color}15` }}
        >
            {score}
        </span>
    );
}

function SlaBadge({ lead }: { lead: Lead }) {
    const stage = normalizeStatus(lead.status);
    const slaHours = STAGE_SLA_HOURS[stage] || 0;
    const ref = lead.updated_at || lead.created_at;
    const hoursOver = ref ? Math.round((Date.now() - new Date(ref).getTime()) / 3_600_000 - slaHours) : 0;

    const label = hoursOver >= 24 ? `${Math.round(hoursOver / 24)}d` : `${hoursOver}h`;
    const isCritical = hoursOver > slaHours * 2;

    return (
        <span
            className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1 ${
                isCritical ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
            }`}
        >
            <AlertTriangle size={9} />
            +{label}
        </span>
    );
}

function ChurnBadge({ probability }: { probability: number }) {
    const isCritical = probability >= 80;
    return (
        <span
            className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md shrink-0 ${
                isCritical ? 'bg-red-500/15 text-red-400' : 'bg-purple-500/15 text-purple-400'
            }`}
        >
            {probability}%
        </span>
    );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SniperSkeleton() {
    return (
        <div className="w-full space-y-5 animate-pulse">
            <div className="h-20 bg-white/[0.03] rounded-2xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white/[0.03] rounded-2xl h-64" />
                ))}
            </div>
        </div>
    );
}
