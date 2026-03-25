import React, { useState } from 'react';
import { Zap, Calendar, Check, X, MessageSquare, History, ChevronDown, ChevronUp, Clock, AlertCircle, Phone, Car } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStatusConfig, normalizeStatus } from '@/constants/status';

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
    { value: 'neutral', label: 'Neutro', color: '#3b82f6' },
    { value: 'negative', label: 'Negativo', color: '#ef4444' },
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
    editingTemplateId,
    setEditingTemplateId,
    editedTemplates,
    setEditedTemplates,
    handleSendTemplate
}) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const normStatus = normalizeStatus(lead.status);
    const currentStepIndex = FUNNEL_STEPS.findIndex(s => s.id === normStatus);

    return (
        <div className="space-y-4 pb-10">
            {/* Progresso no funil */}
            <div className="bg-[#141418] border border-white/[0.07] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Progresso no funil</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: getStatusConfig(lead.status).color }}>
                        {getStatusConfig(lead.status).label}
                    </span>
                </div>
                <div className="relative flex items-center justify-between">
                    {/* linha de fundo */}
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

            {/* Próximo agendamento / CTA */}
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
                                        onClick={() => {
                                            setSelectedFollowUpId(proximoFollowUp.id);
                                            setShowCompletionModal(true);
                                        }}
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

            {/* Formulário de agendamento */}
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

            {/* Formulário de agendamento ... (mantido igual) */}

            {/* Agendamentos Pendentes (Painel de Ações) */}
            {historicoFollowUps.filter(f => f.status === 'pending' && f.id !== proximoFollowUp?.id).length > 0 && (
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                        <Calendar size={12} className="text-amber-400" />
                        <span className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-widest">Outros Agendamentos</span>
                    </div>
                    {historicoFollowUps.filter(f => f.status === 'pending' && f.id !== proximoFollowUp?.id).map((fu) => (
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
                                    onClick={() => {
                                        setSelectedFollowUpId(fu.id);
                                        setShowCompletionModal(true);
                                    }}
                                    className="p-1.5 hover:bg-white/5 rounded-md text-white/40 hover:text-white transition-colors"
                                >
                                    <Check size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Histórico de follow-ups (Concluídos e Outros) */}
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
                                        <div
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: statusColor }}
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] font-semibold text-white/75 uppercase">
                                                    {fu.type === 'visit' ? 'AGENDA' : fu.type.toUpperCase()}
                                                </span>
                                                <span className="text-[10px] font-medium uppercase" style={{ color: statusColor }}>
                                                    {fu.result || fu.status}
                                                </span>
                                            </div>
                                            {fu.note && (
                                                <p className="text-[11px] text-white/30 mt-0.5 truncate max-w-[200px]">{fu.note}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-white/25 tabular-nums">
                                            {new Date(fu.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                        {isExpanded ? <ChevronUp size={13} className="text-white/20" /> : <ChevronDown size={13} className="text-white/20" />}
                                    </div>
                                </button>
                                {/* ... Resto do AnimatePresence mantido ... */}

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

            {/* Modal de conclusão */}
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
