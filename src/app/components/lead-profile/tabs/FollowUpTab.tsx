'use client';
import React, { useState } from 'react';
import {
    Zap, Calendar, Check, X, MessageSquare, History, ChevronDown, ChevronUp,
    Clock, AlertCircle, Phone, Car, Bot, ShoppingCart, Send,
    Sparkles, Copy, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStatusConfig, normalizeStatus } from '@/constants/status';

interface ScriptOpt { tipo: string; label: string; mensagem: string; }

interface FollowUpTabProps {
    lead: any;
    proximoFollowUp: any;
    historicoFollowUps: any[];
    loadingFollowUps: boolean;
    showFollowUpForm: boolean;
    setShowFollowUpForm: (val: boolean) => void;
    showCompletionModal: boolean;
    setShowCompletionModal: (val: boolean) => void;
    completionNote: string;
    setCompletionNote: (val: string) => void;
    selectedFollowUpId: string | null;
    setSelectedFollowUpId: (val: string | null) => void;
    followUpForm: any;
    setFollowUpForm: (val: any) => void;
    handleCreateFollowUp: () => void;
    handleCompleteFollowUp: (result: 'positive' | 'neutral' | 'negative') => void;
    getTemplatesForStage: (status: string) => any[];
    fillTemplate: (msg: string, lead: any) => string;
    editingTemplateId: string | null;
    setEditingTemplateId: (val: string | null) => void;
    editedTemplates: Record<string, string>;
    setEditedTemplates: (val: any) => void;
    handleSendTemplate: (template: any, text: string) => void;
    // IA props
    recalculateStrategy?: () => void;
    loadingStatus?: 'idle' | 'analyzing' | 'matching' | 'finalizing';
    scriptOptions?: ScriptOpt[];
    diagnostico?: string;
    orientacao?: string;
    onTabChange?: (tab: any) => void;
    handleSaveCallLog?: (note: string) => Promise<void>;
}

const CHANNEL_OPTIONS = [
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { value: 'call', label: 'Ligação', icon: Phone },
    { value: 'visit', label: 'Visita', icon: Calendar },
    { value: 'test_drive', label: 'Test Drive', icon: Car },
    { value: 'proposal', label: 'Proposta', icon: Zap },
];

const FUNNEL_STEPS = [
    { id: 'entrada', label: 'Novo' },
    { id: 'triagem', label: 'Qualif' },
    { id: 'ataque', label: 'Ataque' },
    { id: 'fechamento', label: 'Negoc' },
    { id: 'vendido', label: 'Vendido' },
];

const RESULT_OPTIONS = [
    { value: 'positive', label: 'Positivo', color: '#22c55e' },
    { value: 'neutral',  label: 'Neutro',   color: '#3b82f6' },
    { value: 'negative', label: 'Negativo',  color: '#ef4444' },
] as const;

function getStatusColor(status: string, result?: string) {
    if (status === 'pending') return '#eab308';
    if (status === 'completed') {
        if (result === 'positive') return '#22c55e';
        if (result === 'negative') return '#ef4444';
        return '#3b82f6';
    }
    return '#6b7280';
}

export const FollowUpTab: React.FC<FollowUpTabProps> = ({
    lead,
    proximoFollowUp,
    historicoFollowUps,
    loadingFollowUps,
    showFollowUpForm,
    setShowFollowUpForm,
    showCompletionModal,
    setShowCompletionModal,
    completionNote,
    setCompletionNote,
    selectedFollowUpId,
    setSelectedFollowUpId,
    followUpForm,
    setFollowUpForm,
    handleCreateFollowUp,
    handleCompleteFollowUp,
    getTemplatesForStage,
    fillTemplate,
    handleSendTemplate,
    recalculateStrategy,
    loadingStatus = 'idle',
    scriptOptions = [],
    diagnostico,
    orientacao,
    onTabChange,
    handleSaveCallLog,
}) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
    const [showCallModal, setShowCallModal] = useState(false);
    const [callNote, setCallNote] = useState('');
    const [callSaving, setCallSaving] = useState(false);
    const [callSaved, setCallSaved] = useState(false);

    const isAnalyzing = loadingStatus !== 'idle';
    const loadingMsg =
        loadingStatus === 'analyzing'  ? 'Lendo histórico...' :
        loadingStatus === 'matching'   ? 'Cruzando estoque...' :
        loadingStatus === 'finalizing' ? 'Montando diagnóstico...' : 'Analisando...';

    const normStatus = normalizeStatus(lead.status);
    const currentStepIndex = FUNNEL_STEPS.findIndex(s => s.id === normStatus);

    const aiAlerts = historicoFollowUps.filter(f =>
        f.status === 'pending' && (f.type === 'ai_auto' || f.type === 'ai_alert_compra')
    );

    const phone = (lead.phone || '').replace(/\D/g, '');

    const copyScript = (mensagem: string, idx: number) => {
        navigator.clipboard.writeText(mensagem).then(() => {
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx(null), 2000);
        }).catch(() => {});
    };

    const handleCallSave = async () => {
        if (!callNote.trim() || !handleSaveCallLog) return;
        setCallSaving(true);
        try {
            await handleSaveCallLog(callNote.trim());
            setCallSaved(true);
            setTimeout(() => {
                setShowCallModal(false);
                setCallNote('');
                setCallSaved(false);
            }, 1200);
        } catch { /* silencioso */ } finally {
            setCallSaving(false);
        }
    };

    const handleSendViaWhatsApp = (fu: any) => {
        if (phone.length >= 10) {
            window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(fu.note || '')}`, '_blank');
            setSelectedFollowUpId(fu.id);
            handleCompleteFollowUp('positive');
        }
    };

    // Diagnóstico: usa estado da análise IA ou campo persistido no lead
    // Formato salvo: "${diagnostico} | ORIENTAÇÃO: ${orientacao}"
    const aiReasonParts = (lead.ai_reason || '').split('| ORIENTAÇÃO:');
    const diagFromDb = aiReasonParts[0]?.trim() || '';
    const oriFromDb  = aiReasonParts[1]?.trim() || '';

    const diagText = diagnostico || diagFromDb;
    const oriText  = orientacao  || oriFromDb || '';

    return (
        <div className="space-y-4 pb-10">

            {/* ══════════════════════════════════════════════
                PAINEL IA CIRÚRGICA
            ══════════════════════════════════════════════ */}
            <div className="bg-[#141418] border border-amber-500/20 rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/10 bg-amber-500/[0.04]">
                    <div className="flex items-center gap-2">
                        <Bot size={13} className="text-amber-400" />
                        <span className="text-[11px] font-black text-amber-400/90 uppercase tracking-widest">
                            Análise Elite Closer
                        </span>
                    </div>
                    {isAnalyzing && (
                        <span className="flex items-center gap-1.5 text-[10px] text-amber-400/60">
                            <Sparkles size={11} className="animate-spin" />
                            {loadingMsg}
                        </span>
                    )}
                </div>

                {/* Corpo */}
                <div className="px-4 py-3 space-y-3">
                    {isAnalyzing ? (
                        <div className="flex items-center gap-3 py-2">
                            <div className="flex gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <p className="text-[12px] text-white/40 italic">{loadingMsg}</p>
                        </div>
                    ) : diagText ? (
                        <>
                            <div>
                                <p className="text-[9px] font-black text-amber-400/60 uppercase tracking-widest mb-1">Diagnóstico</p>
                                <p className="text-[12px] text-white/75 leading-relaxed">{diagText}</p>
                            </div>
                            {oriText && (
                                <div className="border-t border-white/[0.05] pt-3">
                                    <p className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest mb-1">→ Ação recomendada</p>
                                    <p className="text-[12px] text-emerald-300/80 leading-relaxed font-medium">{oriText}</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-4 text-center">
                            <p className="text-[12px] text-white/25">A análise IA será gerada automaticamente.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════
                SCRIPTS PRONTOS (quando análise foi feita)
            ══════════════════════════════════════════════ */}
            {scriptOptions.length > 0 && (
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                        <MessageSquare size={13} className="text-emerald-400" />
                        <span className="text-[11px] font-semibold text-emerald-300/80 uppercase tracking-widest">Scripts Prontos</span>
                        <span className="ml-auto text-[9px] text-white/20 border border-white/[0.08] rounded px-1.5 py-0.5">copie e envie</span>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                        {scriptOptions.map((opt, i) => (
                            <div key={i} className="px-4 py-3 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">{opt.label}</p>
                                    <p className="text-[12px] text-white/65 leading-relaxed">{opt.mensagem}</p>
                                </div>
                                <div className="flex flex-col gap-2 shrink-0 mt-0.5">
                                    <button
                                        onClick={() => copyScript(opt.mensagem, i)}
                                        title="Copiar"
                                        className="h-7 w-7 rounded-lg border flex items-center justify-center transition-all"
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
                                    {phone.length >= 10 && (
                                        <button
                                            onClick={() => window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(opt.mensagem)}`, '_blank')}
                                            title="Enviar no WhatsApp"
                                            className="h-7 w-7 rounded-lg border border-[#25D366]/20 bg-[#25D366]/08 flex items-center justify-center transition-all hover:bg-[#25D366]/15"
                                        >
                                            <Send size={10} className="text-[#25D366]" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════
                AÇÕES RÁPIDAS
            ══════════════════════════════════════════════ */}
            <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                    <Zap size={12} className="text-red-400" />
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Ações rápidas</span>
                </div>
                <div className="grid grid-cols-4 gap-0 divide-x divide-white/[0.05]">
                    {/* WhatsApp */}
                    <button
                        onClick={() => phone.length >= 10 && window.open(`https://wa.me/55${phone}`, '_blank')}
                        disabled={phone.length < 10}
                        className="flex flex-col items-center gap-1.5 py-4 hover:bg-white/[0.04] transition-colors disabled:opacity-30"
                    >
                        <div className="h-9 w-9 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
                            <MessageSquare size={16} className="text-[#25D366]" />
                        </div>
                        <span className="text-[10px] text-white/40 font-medium">WhatsApp</span>
                    </button>

                    {/* Ligar */}
                    <button
                        onClick={() => setShowCallModal(true)}
                        disabled={phone.length < 10}
                        className="flex flex-col items-center gap-1.5 py-4 hover:bg-white/[0.04] transition-colors disabled:opacity-30"
                    >
                        <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                            <Phone size={16} className="text-purple-400" />
                        </div>
                        <span className="text-[10px] text-white/40 font-medium">Ligar</span>
                    </button>

                    {/* Agendar */}
                    <button
                        onClick={() => setShowFollowUpForm(true)}
                        className="flex flex-col items-center gap-1.5 py-4 hover:bg-white/[0.04] transition-colors"
                    >
                        <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <Calendar size={16} className="text-amber-400" />
                        </div>
                        <span className="text-[10px] text-white/40 font-medium">Agendar</span>
                    </button>

                    {/* Proposta */}
                    <button
                        onClick={() => onTabChange?.('dashboard')}
                        className="flex flex-col items-center gap-1.5 py-4 hover:bg-white/[0.04] transition-colors"
                    >
                        <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                            <FileText size={16} className="text-blue-400" />
                        </div>
                        <span className="text-[10px] text-white/40 font-medium">Proposta</span>
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════
                ALERTAS IA (compra / reengajamento)
            ══════════════════════════════════════════════ */}
            {aiAlerts.length > 0 && (
                <div className="bg-[#141418] border border-amber-500/20 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/10 bg-amber-500/[0.03]">
                        <Bot size={13} className="text-amber-400" />
                        <span className="text-[11px] font-semibold text-amber-400/90 uppercase tracking-widest">
                            Alertas IA — {aiAlerts.length} pendente{aiAlerts.length > 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                        {aiAlerts.map((fu) => {
                            const isCompra = fu.type === 'ai_alert_compra';
                            return (
                                <div key={fu.id} className="px-4 py-3 space-y-3">
                                    <div className="flex items-start gap-2.5">
                                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isCompra ? 'bg-red-500/10 border border-red-500/15' : 'bg-amber-500/10 border border-amber-500/15'}`}>
                                            {isCompra
                                                ? <ShoppingCart size={12} className="text-red-400" />
                                                : <Zap size={12} className="text-amber-400" />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mb-1 ${isCompra ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                {isCompra ? 'Sinal de compra' : 'Reengajamento IA'}
                                            </span>
                                            <p className="text-[12px] text-white/70 leading-relaxed">{fu.note}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleSendViaWhatsApp(fu)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 text-[#25D366] text-[11px] font-semibold rounded-lg transition-colors"
                                        >
                                            <Send size={11} /> Enviar via WhatsApp
                                        </button>
                                        <button
                                            onClick={() => { setSelectedFollowUpId(fu.id); setShowCompletionModal(true); }}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/40 hover:text-white/70 text-[11px] font-medium rounded-lg transition-colors"
                                        >
                                            <Check size={11} /> Concluir
                                        </button>
                                        <button
                                            onClick={() => { setSelectedFollowUpId(fu.id); handleCompleteFollowUp('negative'); }}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] text-white/25 hover:text-white/50 text-[11px] rounded-lg transition-colors"
                                        >
                                            <X size={11} /> Dispensar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════
                PROGRESSO NO FUNIL
            ══════════════════════════════════════════════ */}
            <div className="bg-[#141418] border border-white/[0.07] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Progresso no funil</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: getStatusConfig(lead.status).color }}>
                        {getStatusConfig(lead.status).label}
                    </span>
                </div>
                <div className="relative flex items-center justify-between">
                    <div className="absolute left-3 right-3 h-px bg-white/[0.06]" />
                    {FUNNEL_STEPS.map((step, i) => {
                        const isActive = i <= currentStepIndex;
                        const isCurrent = step.id === normStatus;
                        return (
                            <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5">
                                <div
                                    className="h-2.5 w-2.5 rounded-full border-2 transition-all"
                                    style={{
                                        background: isCurrent ? '#E31E24' : isActive ? '#10b981' : '#111115',
                                        borderColor: isCurrent ? 'rgba(255,255,255,0.6)' : isActive ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)',
                                    }}
                                />
                                <span className={`text-[9px] font-semibold uppercase tracking-wide ${isCurrent ? 'text-white' : isActive ? 'text-emerald-500/50' : 'text-white/15'}`}>
                                    {step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ══════════════════════════════════════════════
                PRÓXIMO AGENDAMENTO / CTA
            ══════════════════════════════════════════════ */}
            {!showFollowUpForm && (
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                        <div className={`h-1.5 w-1.5 rounded-full ${proximoFollowUp ? 'bg-amber-400 animate-pulse' : 'bg-white/20'}`} />
                        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">
                            {proximoFollowUp ? 'Próximo agendamento' : 'Nenhum agendamento'}
                        </span>
                    </div>
                    <div className="px-4 py-4">
                        {proximoFollowUp ? (
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[18px] font-bold text-white">
                                        {new Date(proximoFollowUp.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                                        <span className="text-red-400 ml-2">
                                            {new Date(proximoFollowUp.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className="text-[10px] font-semibold text-white/40 uppercase bg-white/[0.05] px-2 py-0.5 rounded-md">
                                            {proximoFollowUp.type === 'visit' ? 'Agenda' : proximoFollowUp.type}
                                        </span>
                                        {proximoFollowUp.note && (
                                            <span className="text-[11px] text-white/30 italic">"{proximoFollowUp.note}"</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setSelectedFollowUpId(proximoFollowUp.id); setShowCompletionModal(true); }}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[12px] font-semibold rounded-lg transition-colors"
                                    >
                                        <Check size={13} /> Concluir
                                    </button>
                                    <button
                                        onClick={() => setShowFollowUpForm(true)}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.09] text-white/60 hover:text-white text-[12px] font-semibold rounded-lg transition-colors border border-white/[0.07]"
                                    >
                                        <Calendar size={13} /> Reagendar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <p className="text-[13px] text-white/35 italic">Defina a próxima ação tática</p>
                                <button
                                    onClick={() => setShowFollowUpForm(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[12px] font-semibold rounded-lg transition-colors"
                                >
                                    <Calendar size={13} /> Agendar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════
                FORMULÁRIO DE AGENDAMENTO
            ══════════════════════════════════════════════ */}
            <AnimatePresence>
                {showFollowUpForm && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.15 }}
                        className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Novo agendamento</span>
                            <button onClick={() => setShowFollowUpForm(false)} className="text-white/25 hover:text-white/60 transition-colors">
                                <X size={15} />
                            </button>
                        </div>
                        <div className="px-4 py-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-white/30 uppercase tracking-widest">Data e hora</label>
                                    <input
                                        type="datetime-local"
                                        value={followUpForm.scheduled_at}
                                        onChange={e => setFollowUpForm({ ...followUpForm, scheduled_at: e.target.value })}
                                        className="w-full bg-[#0E0E11] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-[12px] outline-none focus:border-white/20 transition-colors"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-white/30 uppercase tracking-widest">Canal</label>
                                    <select
                                        value={followUpForm.type}
                                        onChange={e => setFollowUpForm({ ...followUpForm, type: e.target.value })}
                                        className="w-full bg-[#0E0E11] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-[12px] outline-none focus:border-white/20 transition-colors"
                                    >
                                        {CHANNEL_OPTIONS.map(ch => (
                                            <option key={ch.value} value={ch.value}>{ch.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-white/30 uppercase tracking-widest">Observação</label>
                                <textarea
                                    placeholder="Detalhes para este recontato..."
                                    value={followUpForm.note}
                                    onChange={e => setFollowUpForm({ ...followUpForm, note: e.target.value })}
                                    rows={2}
                                    className="w-full bg-[#0E0E11] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-[12px] outline-none focus:border-white/20 transition-colors resize-none"
                                />
                            </div>
                            <button
                                onClick={handleCreateFollowUp}
                                disabled={loadingFollowUps || !followUpForm.scheduled_at}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white font-semibold text-[12px] rounded-lg transition-colors"
                            >
                                {loadingFollowUps ? 'Agendando...' : 'Confirmar agendamento'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════════════════════════════════════════════
                OUTROS AGENDAMENTOS PENDENTES
            ══════════════════════════════════════════════ */}
            {historicoFollowUps.filter(f => f.status === 'pending' && f.id !== proximoFollowUp?.id && f.type !== 'ai_auto' && f.type !== 'ai_alert_compra').length > 0 && (
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                        <Calendar size={12} className="text-amber-400" />
                        <span className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-widest">Outros Agendamentos</span>
                    </div>
                    {historicoFollowUps.filter(f => f.status === 'pending' && f.id !== proximoFollowUp?.id && f.type !== 'ai_auto' && f.type !== 'ai_alert_compra').map((fu) => (
                        <div key={fu.id} className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                <div>
                                    <span className="text-[12px] font-semibold text-white/75 uppercase">
                                        {fu.type === 'visit' ? 'AGENDA' : fu.type.toUpperCase()}
                                    </span>
                                    {fu.note && <p className="text-[11px] text-white/30 truncate max-w-[200px]">{fu.note}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] text-white/25 tabular-nums">
                                    {new Date(fu.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <button
                                    onClick={() => { setSelectedFollowUpId(fu.id); setShowCompletionModal(true); }}
                                    className="p-1.5 hover:bg-white/5 rounded-md text-white/40 hover:text-white transition-colors"
                                >
                                    <Check size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ══════════════════════════════════════════════
                HISTÓRICO DE FOLLOW-UPS (Concluídos)
            ══════════════════════════════════════════════ */}
            {historicoFollowUps.filter(f => f.status !== 'pending').length > 0 && (
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                        <History size={12} className="text-white/25" />
                        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Histórico de Contatos</span>
                    </div>
                    {historicoFollowUps.filter(f => f.status !== 'pending').map((fu) => {
                        const isExpanded = expandedId === fu.id;
                        const statusColor = getStatusColor(fu.status, fu.result);
                        return (
                            <div key={fu.id} className="border-b border-white/[0.04] last:border-0">
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : fu.id)}
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] font-semibold text-white/75 uppercase">
                                                    {fu.type === 'visit' ? 'AGENDA' : fu.type.toUpperCase()}
                                                </span>
                                                <span className="text-[10px] font-medium uppercase" style={{ color: statusColor }}>
                                                    {fu.result || fu.status}
                                                </span>
                                            </div>
                                            {fu.note && <p className="text-[11px] text-white/30 mt-0.5 truncate max-w-[200px]">{fu.note}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-white/25 tabular-nums">
                                            {new Date(fu.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                        {isExpanded ? <ChevronUp size={13} className="text-white/20" /> : <ChevronDown size={13} className="text-white/20" />}
                                    </div>
                                </button>
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: 'auto' }}
                                            exit={{ height: 0 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <div className="px-4 pb-3 pt-1 border-t border-white/[0.04]">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5 text-white/25">
                                                            <Clock size={10} />
                                                            <span className="text-[9px] font-semibold uppercase tracking-wider">Datas</span>
                                                        </div>
                                                        <p className="text-[10px] text-white/40">
                                                            Agend: {new Date(fu.scheduled_at).toLocaleString('pt-BR')}
                                                        </p>
                                                        {fu.completed_at && (
                                                            <p className="text-[10px] text-emerald-400/60">
                                                                Concluído: {new Date(fu.completed_at).toLocaleString('pt-BR')}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {fu.result_note && (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-1.5 text-white/25">
                                                                <AlertCircle size={10} />
                                                                <span className="text-[9px] font-semibold uppercase tracking-wider">Nota</span>
                                                            </div>
                                                            <p className="text-[11px] italic" style={{ color: statusColor }}>
                                                                "{fu.result_note}"
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ══════════════════════════════════════════════
                MODAL DE LIGAÇÃO
            ══════════════════════════════════════════════ */}
            <AnimatePresence>
                {showCallModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setShowCallModal(false); setCallNote(''); setCallSaved(false); }}
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="relative w-full max-w-sm bg-[#141418] border border-white/[0.09] rounded-2xl p-5 shadow-2xl"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                        <Phone size={15} className="text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-[14px] font-bold text-white leading-tight">{lead.nome || lead.name}</p>
                                        <p className="text-[11px] text-white/35">+55 {phone}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setShowCallModal(false); setCallNote(''); setCallSaved(false); }}
                                    className="text-white/25 hover:text-white/60 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Botão de ligar */}
                            <button
                                onClick={() => window.open(`tel:+55${phone}`)}
                                className="w-full flex items-center justify-center gap-2 py-3 mb-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[13px] rounded-xl transition-colors"
                            >
                                <Phone size={14} />
                                Iniciar Ligação
                            </button>

                            {/* Resumo */}
                            <div className="space-y-1.5 mb-4">
                                <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                                    Resumo da ligação
                                </label>
                                <textarea
                                    value={callNote}
                                    onChange={e => setCallNote(e.target.value)}
                                    placeholder="O que foi combinado? Qual foi o resultado da ligação? O cliente tem interesse? Próximo passo..."
                                    rows={4}
                                    className="w-full bg-[#0E0E11] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-[12px] outline-none resize-none focus:border-purple-500/40 transition-colors"
                                />
                            </div>

                            {/* Botão salvar */}
                            <button
                                onClick={handleCallSave}
                                disabled={!callNote.trim() || callSaving || callSaved || !handleSaveCallLog}
                                className="w-full py-2.5 rounded-xl font-bold text-[13px] transition-all flex items-center justify-center gap-2"
                                style={{
                                    backgroundColor: callSaved ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.9)',
                                    color: callSaved ? '#22c55e' : 'white',
                                    borderWidth: 1,
                                    borderColor: callSaved ? 'rgba(34,197,94,0.3)' : 'transparent',
                                    opacity: (!callNote.trim() || callSaving) ? 0.35 : 1,
                                }}
                            >
                                {callSaved ? (
                                    <><Check size={14} /> Salvo com sucesso!</>
                                ) : callSaving ? (
                                    'Salvando...'
                                ) : (
                                    <><History size={14} /> Salvar registro da ligação</>
                                )}
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ══════════════════════════════════════════════
                MODAL DE CONCLUSÃO
            ══════════════════════════════════════════════ */}
            <AnimatePresence>
                {showCompletionModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowCompletionModal(false)}
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="relative w-full max-w-sm bg-[#141418] border border-white/[0.09] rounded-2xl p-5 shadow-2xl"
                        >
                            <h3 className="text-[15px] font-bold text-white mb-4">Resultado do contato</h3>
                            <textarea
                                value={completionNote}
                                onChange={e => setCompletionNote(e.target.value)}
                                placeholder="Descreva o que aconteceu durante o contato..."
                                rows={3}
                                className="w-full bg-[#0E0E11] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-[13px] outline-none resize-none focus:border-white/20 transition-colors mb-4"
                            />
                            <div className="grid grid-cols-3 gap-2">
                                {RESULT_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => handleCompleteFollowUp(opt.value)}
                                        className="py-2.5 text-white text-[12px] font-semibold rounded-lg transition-colors hover:brightness-110"
                                        style={{ backgroundColor: opt.color }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
