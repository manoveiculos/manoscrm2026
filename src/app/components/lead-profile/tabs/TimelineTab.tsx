import React from 'react';
import { Edit3, User, AlertCircle, Bot, Sparkles } from 'lucide-react';
import { TimelineEvent } from '../hooks/useLeadTimeline';

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
    recalculateStrategy?: () => void;
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
    recalculateStrategy
}) => {
    return (
        <div className="space-y-4 pb-10">
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

            {/* Filtros */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {FILTERS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setFilter(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors border ${
                            filter === t.id
                                ? 'bg-red-600 border-red-500/50 text-white'
                                : 'bg-[#141418] border-white/[0.07] text-white/35 hover:text-white/60'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Lista de eventos */}
            {loading ? (
                <div className="flex justify-center py-10">
                    <div className="h-5 w-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : events.length > 0 ? (
                <div className={`${filter === 'whatsapp' ? 'space-y-1 py-4' : 'bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden'}`}>
                    {events.map((event, idx) => {
                        const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.system;
                        const date = new Date(event.created_at);
                        const dateStr = date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

                        // Layout de CHAT para a aba específica de WhatsApp
                        if (filter === 'whatsapp') {
                            const isOut = event.type === 'whatsapp_out';
                            return (
                                <div key={event.id} className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'} px-2`}>
                                    <div 
                                        className={`max-w-[85%] rounded-2xl px-3 py-2.5 shadow-sm border ${
                                            isOut 
                                                ? 'bg-[#3b82f6]/10 border-[#3b82f6]/20 text-blue-50 rounded-tr-none' 
                                                : 'bg-[#25d366]/10 border-[#25d366]/20 text-green-50 rounded-tl-none'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-4 mb-1.5">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider opacity-50`}>
                                                {event.author}
                                            </span>
                                            <span className="text-[9px] opacity-30 tabular-nums">
                                                {dateStr.split(', ')[1]} {/* Só a hora */}
                                            </span>
                                        </div>
                                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                                            {event.description}
                                        </p>
                                        <div className={`mt-1 text-right`}>
                                            <span className="text-[8px] opacity-20 uppercase">
                                                {dateStr.split(', ')[0]}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Layout Padrão de TIMELINE para o restante
                        return (
                            <div key={event.id} className="flex items-start gap-3 px-4 py-3.5 border-b border-white/[0.04] last:border-0">
                                {/* Dot */}
                                <div className="relative mt-1.5 shrink-0">
                                    <div
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: config.color }}
                                    />
                                    {idx < events.length - 1 && (
                                        <div className="absolute top-3 left-[3px] w-px h-full bg-white/[0.05]" />
                                    )}
                                </div>

                                {/* Conteúdo */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                                style={{ color: config.color, backgroundColor: `${config.color}15` }}
                                            >
                                                {config.label}
                                            </span>
                                            <span className="text-[12px] font-semibold text-white/80">{event.title}</span>
                                        </div>
                                        <span className="text-[10px] text-white/20 tabular-nums shrink-0">{dateStr}</span>
                                    </div>

                                    {event.description && (
                                        <p className="text-[12px] text-white/55 leading-relaxed whitespace-pre-wrap">
                                            {event.description}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-1 mt-1.5 text-white/20">
                                        {event.type === 'ai_analysis' ? <Bot size={9} /> : <User size={9} />}
                                        <span className="text-[9px] font-medium uppercase tracking-wider">{event.author}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
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
    );
};
