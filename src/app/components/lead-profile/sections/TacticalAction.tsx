'use client';
import React, { useState, useEffect } from 'react';
import { Bot, Zap, Sparkles, MessageSquare, Phone, ChevronRight, FileText, X, ArrowRightLeft, Copy, Check } from 'lucide-react';
import { Lead } from '../types';

const PROPOSAL_CACHE_HOURS = 6;

interface Proposta {
    titulo: string;
    pitch: string;
    cenarios: { label: string; entrada: string; parcela: string; obs: string }[];
    cta: string;
}

interface ScriptOpt {
    tipo: string;
    label: string;
    mensagem: string;
}

interface TacticalActionProps {
    lead: Lead;
    loadingStatus: 'idle' | 'analyzing' | 'matching' | 'finalizing';
    recalculateStrategy: () => void;
    handleExecuteAIDirective: () => void;
    onTabChange: (tab: 'dashboard' | 'timeline' | 'followup' | 'arsenal') => void;
    fallbackAction: { emoji: string; titulo: string; descricao: string };
    scriptOptions?: ScriptOpt[];
}

export const TacticalAction: React.FC<TacticalActionProps> = ({
    lead,
    loadingStatus,
    recalculateStrategy,
    handleExecuteAIDirective,
    onTabChange,
    fallbackAction,
    scriptOptions = [],
}) => {
    const isAnalyzing = loadingStatus !== 'idle';
    const loadingMessage = 
        loadingStatus === 'analyzing' ? 'Lendo chat...' :
        loadingStatus === 'matching' ? 'Vibrando estoque...' :
        loadingStatus === 'finalizing' ? 'Fechando script...' : 'Analisando...';

    const [proposta, setProposta] = useState<Proposta | null>(null);
    const [propostaLoading, setPropostaLoading] = useState(false);
    const [propostaFromCache, setPropostaFromCache] = useState(false);
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

    // Carrega proposta do cache se existir e for recente
    useEffect(() => {
        if (lead.last_proposal_json && lead.last_proposal_at) {
            const ageHours = (Date.now() - new Date(lead.last_proposal_at).getTime()) / 3_600_000;
            if (ageHours < PROPOSAL_CACHE_HOURS) {
                setProposta(lead.last_proposal_json);
                setPropostaFromCache(true);
            }
        }
    }, [lead.id]);

    const gerarProposta = async () => {
        setPropostaLoading(true);
        setProposta(null);
        setPropostaFromCache(false);
        try {
            const res = await fetch('/api/lead/generate-proposal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId: lead.id }),
            });
            const data = await res.json();
            if (data.titulo) setProposta(data);
        } catch { /* silencioso */ } finally {
            setPropostaLoading(false);
        }
    };

    const copyScript = (mensagem: string, idx: number) => {
        navigator.clipboard.writeText(mensagem).then(() => {
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx(null), 2000);
        }).catch(() => {});
    };

    const actionText = lead.proxima_acao || lead.next_step || fallbackAction.descricao;

    return (
        <>
        {/* Banner de handoff — exibido quando o lead foi redistribuído */}
        {lead.handoff_summary && (
            <div className="bg-cyan-500/[0.06] border border-cyan-500/20 rounded-xl px-4 py-3 mb-3 flex gap-3">
                <ArrowRightLeft size={14} className="text-cyan-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <p className="text-[11px] font-bold text-cyan-300 uppercase tracking-widest mb-1">Briefing de passagem</p>
                    <p className="text-[12px] text-white/60 leading-relaxed">{lead.handoff_summary}</p>
                </div>
            </div>
        )}
        <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
            {/* Cabeçalho da seção */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                    <Bot size={14} className="text-white/40" />
                    <span className="text-[11px] font-semibold text-white/60 uppercase tracking-widest">
                        Próxima ação IA
                    </span>
                </div>
                {isAnalyzing && (
                    <span className="flex items-center gap-1.5 text-[10px] text-white/30">
                        <Sparkles size={11} className="animate-spin" />
                        {loadingMessage}
                    </span>
                )}
            </div>

            {/* Texto da ação — estado de loading ou texto real */}
            <div className="px-4 py-3 border-b border-white/[0.05]">
                {isAnalyzing ? (
                    <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <p className="text-[12px] text-white/35 italic">{loadingMessage}</p>
                    </div>
                ) : (
                    <p className="text-[13px] text-white/70 leading-relaxed">
                        {actionText}
                    </p>
                )}
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
                className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors group"
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

            {/* Botão de proposta: só aparece como link discreto "Regerar" quando já existe cache, ou como loading */}
            {(propostaLoading || propostaFromCache) && (
                <div className="flex items-center justify-end px-4 py-2 border-t border-white/[0.03]">
                    <button
                        onClick={gerarProposta}
                        disabled={propostaLoading}
                        className="flex items-center gap-1.5 text-[10px] text-blue-400/50 hover:text-blue-300 transition-colors disabled:opacity-40"
                    >
                        <FileText size={10} className={propostaLoading ? 'animate-pulse' : ''} />
                        {propostaLoading ? 'Gerando proposta…' : 'Regerar proposta'}
                    </button>
                </div>
            )}
        </div>

        {/* ── SCRIPTS PRONTOS — gerados pelo Elite Closer após Recalcular ── */}
        {scriptOptions.length > 0 && (
            <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden mt-3">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                    <MessageSquare size={13} className="text-emerald-400" />
                    <span className="text-[11px] font-semibold text-emerald-300/80 uppercase tracking-widest">Scripts Prontos</span>
                    <span className="ml-auto text-[9px] text-white/20 border border-white/10 rounded px-1 py-0.5">copie e envie</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                    {scriptOptions.map((opt, i) => (
                        <div key={i} className="px-4 py-3 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-1">{opt.label}</p>
                                <p className="text-[12px] text-white/65 leading-relaxed">{opt.mensagem}</p>
                            </div>
                            <button
                                onClick={() => copyScript(opt.mensagem, i)}
                                className="shrink-0 h-7 w-7 rounded-lg border flex items-center justify-center transition-all mt-0.5"
                                style={copiedIdx === i
                                    ? { borderColor: 'rgba(34,197,94,0.4)', backgroundColor: 'rgba(34,197,94,0.08)' }
                                    : { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'transparent' }
                                }
                            >
                                {copiedIdx === i
                                    ? <Check size={11} className="text-emerald-400" />
                                    : <Copy size={11} className="text-white/30" />
                                }
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* ── PAINEL DE PROPOSTA COMPLETO ── */}
        {proposta && (
            <ProposalPanel
                proposta={proposta}
                propostaFromCache={propostaFromCache}
                phone={(lead.phone || '').replace(/\D/g, '')}
                onClose={() => { setProposta(null); setPropostaFromCache(false); }}
                onRegenerate={gerarProposta}
                loading={propostaLoading}
            />
        )}
        </>
    );
};

// ─── Sub-componente: painel de proposta ───────────────────────────────────────
interface ProposalPanelProps {
    proposta: Proposta & { cenarios: any[] };
    propostaFromCache: boolean;
    phone: string;
    onClose: () => void;
    onRegenerate: () => void;
    loading: boolean;
}

function ProposalPanel({ proposta, propostaFromCache, phone, onClose, onRegenerate, loading }: ProposalPanelProps) {
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    const copy = (text: string, idx: number) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx(null), 2000);
        }).catch(() => {});
    };

    const COLORS = [
        { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', text: '#34d399', badge: 'rgba(16,185,129,0.15)' },
        { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', text: '#60a5fa', badge: 'rgba(59,130,246,0.15)' },
        { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', text: '#a78bfa', badge: 'rgba(139,92,246,0.15)' },
    ];

    return (
        <div className="bg-[#0E0E12] border border-blue-500/20 rounded-xl overflow-hidden mt-3">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-blue-500/[0.04]">
                <div className="flex items-center gap-2.5">
                    <FileText size={13} className="text-blue-400" />
                    <span className="text-[11px] font-black text-blue-300/90 uppercase tracking-widest">{proposta.titulo}</span>
                    {propostaFromCache && (
                        <span className="text-[8px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 uppercase">cache</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onRegenerate}
                        disabled={loading}
                        className="text-[10px] text-blue-400/50 hover:text-blue-300 transition-colors disabled:opacity-30 flex items-center gap-1"
                    >
                        <Sparkles size={9} className={loading ? 'animate-spin' : ''} />
                        Regerar
                    </button>
                    <button onClick={onClose} className="text-white/20 hover:text-white/50 transition-colors ml-1">
                        <X size={13} />
                    </button>
                </div>
            </div>

            {/* Preço do veículo + configuração */}
            {(proposta as any).veiculo_preco && (
                <div className="px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02] flex items-center gap-4">
                    <div>
                        <span className="text-[9px] font-bold text-white/25 uppercase tracking-widest">Valor do veículo</span>
                        <p className="text-[14px] font-black text-white/80">{(proposta as any).veiculo_preco}</p>
                    </div>
                    <div className="h-6 w-px bg-white/[0.07]" />
                    <div>
                        <span className="text-[9px] font-bold text-white/25 uppercase tracking-widest">Taxa</span>
                        <p className="text-[12px] font-bold text-amber-400/80">2,00% a.m.</p>
                    </div>
                    <div className="h-6 w-px bg-white/[0.07]" />
                    <div>
                        <span className="text-[9px] font-bold text-white/25 uppercase tracking-widest">Prazo</span>
                        <p className="text-[12px] font-bold text-white/60">48x</p>
                    </div>
                </div>
            )}

            {/* Pitch do consultor */}
            {proposta.pitch && (
                <div className="px-4 py-3 border-b border-white/[0.05]">
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-1">Argumento de abertura</p>
                    <p className="text-[12px] text-white/55 leading-relaxed italic">"{proposta.pitch}"</p>
                </div>
            )}

            {/* Cenários */}
            <div className="divide-y divide-white/[0.05]">
                {proposta.cenarios.map((c: any, i: number) => {
                    const col = COLORS[i] || COLORS[0];
                    const isExpanded = expandedIdx === i;
                    const hasMensagem = !!c.mensagem_whatsapp;

                    return (
                        <div key={i} className="px-4 py-3">
                            {/* Linha principal do cenário */}
                            <div className="flex items-start gap-3">
                                {/* Badge entrada % */}
                                <div
                                    className="h-10 w-10 rounded-xl flex flex-col items-center justify-center shrink-0 mt-0.5 gap-0"
                                    style={{ backgroundColor: col.badge, border: `1px solid ${col.border}` }}
                                >
                                    <span className="text-[9px] font-black leading-tight" style={{ color: col.text }}>
                                        {c.label?.replace('Entrada ', '') || `${i === 0 ? '20%' : i === 1 ? '30%' : '40%'}`}
                                    </span>
                                    <span className="text-[8px] text-white/30 leading-tight">{(c as any).prazo || '48x'}</span>
                                </div>

                                {/* Info principal */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        <span className="text-[15px] font-bold text-white/90">{c.parcela}</span>
                                        <span className="text-[11px] text-white/35">entrada {c.entrada}</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                        {(c as any).financiado && <span className="text-[10px] text-white/25">financiado {(c as any).financiado}</span>}
                                        {c.total && <span className="text-[10px] text-white/25">· total {c.total}</span>}
                                    </div>
                                    {c.obs && <p className="text-[10px] italic mt-0.5" style={{ color: col.text + 'bb' }}>{c.obs}</p>}
                                </div>

                                {/* Botões de ação */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {/* Copiar mensagem completa */}
                                    {hasMensagem && (
                                        <button
                                            onClick={() => copy(c.mensagem_whatsapp, i)}
                                            title="Copiar mensagem completa"
                                            className="h-7 w-7 rounded-lg border flex items-center justify-center transition-all"
                                            style={copiedIdx === i
                                                ? { borderColor: 'rgba(34,197,94,0.4)', backgroundColor: 'rgba(34,197,94,0.08)' }
                                                : { borderColor: col.border, backgroundColor: col.bg }
                                            }
                                        >
                                            {copiedIdx === i
                                                ? <Check size={11} className="text-emerald-400" />
                                                : <Copy size={11} style={{ color: col.text }} />
                                            }
                                        </button>
                                    )}
                                    {/* Enviar WhatsApp */}
                                    {hasMensagem && phone.length >= 10 && (
                                        <button
                                            onClick={() => window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(c.mensagem_whatsapp)}`, '_blank')}
                                            title="Enviar via WhatsApp"
                                            className="h-7 w-7 rounded-lg border border-[#25D366]/25 bg-[#25D366]/08 flex items-center justify-center transition-all hover:bg-[#25D366]/20"
                                        >
                                            <MessageSquare size={11} className="text-[#25D366]" />
                                        </button>
                                    )}
                                    {/* Expandir mensagem */}
                                    {hasMensagem && (
                                        <button
                                            onClick={() => setExpandedIdx(isExpanded ? null : i)}
                                            title="Ver mensagem completa"
                                            className="h-7 w-7 rounded-lg border border-white/[0.07] bg-transparent flex items-center justify-center transition-all hover:bg-white/[0.04]"
                                        >
                                            <ChevronRight size={11} className={`text-white/25 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Mensagem expandida */}
                            {isExpanded && hasMensagem && (
                                <div
                                    className="mt-3 rounded-xl p-3 text-[11px] leading-relaxed whitespace-pre-wrap"
                                    style={{ backgroundColor: col.bg, border: `1px solid ${col.border}`, color: 'rgba(255,255,255,0.6)' }}
                                >
                                    {c.mensagem_whatsapp}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* CTA do consultor */}
            {proposta.cta && (
                <div className="px-4 py-3 border-t border-white/[0.05] bg-gradient-to-r from-blue-500/[0.06] to-transparent">
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-1">Fechamento sugerido</p>
                    <p className="text-[12px] text-blue-300/70 font-medium leading-snug">→ {proposta.cta}</p>
                </div>
            )}
        </div>
    );
}
