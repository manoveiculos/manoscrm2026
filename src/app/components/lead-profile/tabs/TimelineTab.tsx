import React from 'react';
import { Edit3, User, AlertCircle, Bot, Sparkles } from 'lucide-react';
import { TimelineEvent } from '../hooks/useLeadTimeline';
import { formatDateBR } from '@/lib/shared_utils/helpers';

interface TimelineTabProps {
    events: TimelineEvent[];
    loading: boolean;
    filter: string;
    setFilter: (val: string) => void;
    newNote: string;
    setNewNote: (val: string) => void;
    isSavingNote: boolean;
    handleAddNote: () => void;
    isAnalyzing?: boolean;
    loadingStatus?: 'idle' | 'analyzing' | 'matching' | 'finalizing';
    recalculateStrategy?: () => void;
    isConversationMode?: boolean;
    diagnostico?: string;
    orientacao?: string;
}

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
    'status_change':      { color: '#3b82f6', label: 'Status' },
    'note':               { color: '#a855f7', label: 'Nota' },
    'call':               { color: '#22c55e', label: 'Ligação' },
    'whatsapp_in':        { color: '#25d366', label: 'Cliente' },
    'whatsapp_out':       { color: '#3b82f6', label: 'Vendedor' },
    'ai_analysis':        { color: '#f59e0b', label: 'Orientação IA' },
    'followup_created':   { color: '#06b6d4', label: 'Agendado' },
    'followup_completed': { color: '#22c55e', label: 'Concluído' },
    'followup_missed':    { color: '#ef4444', label: 'Perdido' },
    'visit':              { color: '#8b5cf6', label: 'Agenda' },
    'proposal':           { color: '#f59e0b', label: 'Proposta' },
    'vehicle_linked':     { color: '#dc2626', label: 'Veículo' },
    'sale':               { color: '#22c55e', label: 'Venda' },
    'system':             { color: '#6b7280', label: 'Sistema' },
};

const FILTERS = [
    { id: 'all', label: 'Tudo' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'note', label: 'Notas' },
    { id: 'ai_analysis', label: 'Orientação IA' },
    { id: 'followup', label: 'Agendas' },
];

export const TimelineTab: React.FC<TimelineTabProps> = ({
    events,
    loading,
    filter,
    setFilter,
    newNote,
    setNewNote,
    isSavingNote,
    handleAddNote,
    isAnalyzing,
    recalculateStrategy,
    isConversationMode,
    diagnostico,
    orientacao
}) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Auto-scroll para a última mensagem no modo conversa
    React.useEffect(() => {
        if (isConversationMode && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events, isConversationMode]);

    // Filtro e Ordenação
    const filteredEvents = events.filter(e => {
        if (isConversationMode) {
            return e.type === 'whatsapp_in' || e.type === 'whatsapp_out';
        }
        if (filter === 'whatsapp') return e.type === 'whatsapp_in' || e.type === 'whatsapp_out';
        if (filter === 'note') return e.type === 'note';
        if (filter === 'ai_analysis') return e.type === 'ai_analysis';
        if (filter === 'followup') return e.type.includes('followup') || e.type === 'visit';
        
        // No modo Histórico (default/all), removemos logs redundantes de sistema
        const isRedundantSystem = e.type === 'system' && (e.description?.includes('🔧') || e.description?.includes('AI_SUMMARY'));
        return !isRedundantSystem;
    });

    // IMPORTANTE: No WhatsApp a ordem é Cronológica (Antigo -> Novo)
    // No Histórico a ordem é Inversa (Novo -> Antigo)
    const sortedEvents = isConversationMode 
        ? [...filteredEvents].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        : filteredEvents;

    return (
        <div className="flex flex-col h-full max-h-[calc(100vh-250px)] space-y-4">
            {/* Sticky Insights da IA */}
            {orientacao && (
                <div className="shrink-0 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-2 shadow-lg shadow-black/20 animate-in fade-in slide-in-from-top-2 duration-500">
                    <div className="flex items-center gap-2 mb-1.5 text-amber-500">
                        <Sparkles size={14} className="animate-pulse" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Diretriz do Mentor</span>
                    </div>
                    <p className="text-[12px] text-amber-50/90 font-medium leading-relaxed italic">
                        "{orientacao}"
                    </p>
                </div>
            )}

            {/* Sub-Header com Filtros ou Campo de Nota */}
            {!isConversationMode && (
                <div className="space-y-4 shrink-0">
                    {/* Campo de nota */}
                    <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                            <Edit3 size={12} className="text-red-500" />
                            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Nova nota</span>
                        </div>
                        <div className="px-4 py-3 space-y-3">
                            <textarea
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                                placeholder="O que aconteceu no atendimento?"
                                rows={2}
                                className="w-full bg-[#0E0E11] border border-white/[0.07] rounded-lg px-3 py-2 text-white text-[13px] outline-none focus:border-white/20 transition-colors resize-none"
                            />
                            <div className="flex justify-end">
                                <button
                                    onClick={handleAddNote}
                                    disabled={isSavingNote || !newNote.trim()}
                                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white text-[12px] font-semibold rounded-lg transition-colors"
                                >
                                    {isSavingNote ? 'Salvando...' : 'Registrar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista de eventos com scrollRef */}
            <div 
                ref={scrollRef}
                className={`flex-1 overflow-y-auto no-scrollbar pr-1 ${
                    isConversationMode ? 'space-y-2 py-4' : 'bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden divide-y divide-white/[0.04]'
                }`}
            >
                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="h-5 w-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : sortedEvents.length > 0 ? (
                    sortedEvents.map((event, idx) => {
                        const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.system;
                        const dateStr = formatDateBR(event.created_at);

                        // Layout de CHAT para a aba específica de WhatsApp
                        if (isConversationMode) {
                            const isOut = event.type === 'whatsapp_out';
                            return (
                                <div key={event.id} className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'} px-1 py-1`}>
                                    <div 
                                        className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm border ${
                                            isOut 
                                                ? 'bg-[#3b82f6]/10 border-[#3b82f6]/20 text-blue-50 rounded-tr-none' 
                                                : 'bg-[#25d366]/10 border-[#25d366]/20 text-green-50 rounded-tl-none'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-4 mb-1">
                                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-40">
                                                {event.author}
                                            </span>
                                            <span className="text-[8px] opacity-25 tabular-nums uppercase">
                                                {dateStr}
                                            </span>
                                        </div>
                                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                                            {event.description}
                                        </p>
                                    </div>
                                </div>
                            );
                        }

                        // Layout Padrão de TIMELINE para o Histórico (Log de sistema ou IA)
                        const isAI = event.type === 'ai_analysis';
                        return (
                            <div 
                                key={event.id} 
                                className={`flex items-start gap-3 px-4 py-3.5 transition-colors border-b border-white/[0.04] last:border-0 ${
                                    isAI ? 'bg-amber-500/[0.03] border-l-2 border-l-amber-500/50' : 'hover:bg-white/[0.02]'
                                }`}
                            >
                                {/* Dot Indicator */}
                                <div className="relative mt-1.5 shrink-0">
                                    <div
                                        className={`h-2.5 w-2.5 rounded-full ${isAI ? 'animate-pulse' : ''}`}
                                        style={{ backgroundColor: config.color }}
                                    />
                                    {idx < sortedEvents.length - 1 && (
                                        <div className="absolute top-4 left-[4px] w-px h-10 bg-white/[0.05]" />
                                    )}
                                </div>

                                {/* Event Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                                className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                                                style={{ color: config.color, backgroundColor: `${config.color}15` }}
                                            >
                                                {config.label}
                                            </span>
                                            <span className={`text-[12px] font-semibold ${isAI ? 'text-amber-50' : 'text-white/80'}`}>
                                                {event.title}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-white/20 tabular-nums shrink-0">{dateStr}</span>
                                    </div>

                                    {event.description && (
                                        <div className={`text-[12px] leading-relaxed whitespace-pre-wrap ${isAI ? 'text-amber-50/70 italic' : 'text-white/55'}`}>
                                            {event.description}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-1 mt-1.5 text-white/20">
                                        {isAI ? <Sparkles size={9} /> : <User size={9} />}
                                        <span className="text-[9px] font-medium uppercase tracking-wider">{event.author}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="py-14 text-center text-white/25">
                        {filter === 'ai_analysis' ? (
                            <div className="flex flex-col items-center">
                                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                                    <Bot size={22} className="text-amber-500/50" />
                                </div>
                                <p className="text-[14px] font-bold text-white/80">Sem orientação no momento</p>
                                <p className="text-[11px] mt-1 mb-6 max-w-[200px] mx-auto">Solicite ao Especialista IA para analisar o histórico completo deste lead.</p>
                                
                                <button
                                    onClick={recalculateStrategy}
                                    disabled={isAnalyzing}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white text-[12px] font-bold rounded-xl transition-all shadow-lg shadow-amber-900/20"
                                >
                                    <Sparkles size={13} className={isAnalyzing ? 'animate-spin' : ''} />
                                    {isAnalyzing ? 'Analisando histórico...' : 'Solicitar Mentor IA'}
                                </button>
                            </div>
                        ) : (
                            <>
                                <AlertCircle size={20} className="mx-auto mb-3" />
                                <p className="text-[12px]">Nenhum registro encontrado.</p>
                                <p className="text-[11px] mt-0.5">Adicione uma nota para iniciar o histórico.</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
