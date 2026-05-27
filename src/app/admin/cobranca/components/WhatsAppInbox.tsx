'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Send, Search, MessageCircle, Phone, RefreshCw, Sparkles } from 'lucide-react';
import { BillingRecord } from '@/types';

interface ConversationSummary {
    telefone: string;
    push_name: string | null;
    last_message: string | null;
    last_direction: 'INBOUND' | 'OUTBOUND';
    last_intent: string | null;
    last_at: string;
    record_id: string | null;
}

interface Message {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    body: string | null;
    media_url: string | null;
    media_type: string | null;
    push_name: string | null;
    ai_intent: string | null;
    ai_summary: string | null;
    created_at: string;
}

interface WhatsAppInboxProps {
    records: BillingRecord[];
    showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const INTENT_COLORS: Record<string, string> = {
    PROMESSA_PAGAMENTO: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    NEGOCIACAO: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    RECUSA: 'bg-red-500/10 text-red-400 border-red-500/20',
    RECLAMACAO: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    INFO_GENERICA: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    SEM_RESPOSTA: 'bg-zinc-700 text-zinc-400 border-zinc-600',
    OUTROS: 'bg-zinc-700 text-zinc-400 border-zinc-600',
};

const INTENT_LABEL: Record<string, string> = {
    PROMESSA_PAGAMENTO: 'Promessa',
    NEGOCIACAO: 'Negociando',
    RECUSA: 'Recusa',
    RECLAMACAO: 'Reclamação',
    INFO_GENERICA: 'Info',
    SEM_RESPOSTA: 'Sem resp',
    OUTROS: 'Outro',
};

export default function WhatsAppInbox({ records, showToast }: WhatsAppInboxProps) {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingConv, setLoadingConv] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [search, setSearch] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const loadConversations = async () => {
        setLoadingConv(true);
        try {
            const res = await fetch('/api/billing/whatsapp-messages?recent=true');
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
            }
        } catch (e) {
            // silencioso
        } finally {
            setLoadingConv(false);
        }
    };

    const loadMessages = async (telefone: string) => {
        setLoadingMsgs(true);
        try {
            const res = await fetch(`/api/billing/whatsapp-messages?telefone=${encodeURIComponent(telefone)}`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
                setTimeout(() => {
                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                }, 50);
            }
        } catch (e) {
            showToast('Erro ao carregar mensagens', 'error');
        } finally {
            setLoadingMsgs(false);
        }
    };

    useEffect(() => {
        loadConversations();
        const interval = setInterval(loadConversations, 15000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedPhone) {
            loadMessages(selectedPhone);
            const interval = setInterval(() => loadMessages(selectedPhone), 8000);
            return () => clearInterval(interval);
        }
    }, [selectedPhone]);

    const filtered = useMemo(() => {
        if (!search) return conversations;
        const s = search.toLowerCase();
        return conversations.filter(c =>
            c.telefone.includes(s) ||
            (c.push_name || '').toLowerCase().includes(s) ||
            (c.last_message || '').toLowerCase().includes(s)
        );
    }, [conversations, search]);

    // Cliente do record amarrado à conversa
    const linkedRecord = useMemo(() => {
        const conv = conversations.find(c => c.telefone === selectedPhone);
        if (!conv?.record_id) return null;
        return records.find(r => r.id === conv.record_id) || null;
    }, [conversations, selectedPhone, records]);

    const handleSend = async () => {
        if (!selectedPhone || !draft.trim() || sending) return;
        setSending(true);
        try {
            const res = await fetch('/api/billing/whatsapp-messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telefone: selectedPhone,
                    message: draft.trim(),
                    recordId: linkedRecord?.id,
                    cpfCnpj: linkedRecord?.cpfCnpj,
                }),
            });
            if (res.ok) {
                setDraft('');
                showToast('Mensagem enviada!', 'success');
                setTimeout(() => loadMessages(selectedPhone), 500);
            } else {
                const err = await res.json();
                showToast(err.error || 'Erro ao enviar', 'error');
            }
        } catch (e) {
            showToast('Falha ao enviar', 'error');
        } finally {
            setSending(false);
        }
    };

    const [analysis, setAnalysis] = useState<any>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const handleAnalyze = async () => {
        if (!linkedRecord) {
            showToast('Conversa não está vinculada a um cliente do CRM', 'error');
            return;
        }
        setAnalyzing(true);
        try {
            const res = await fetch('/api/billing/ai-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordId: linkedRecord.id }),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setAnalysis(data.analysis);
                showToast('Análise IA concluída', 'success');
            } else {
                showToast(data.error || 'Erro na análise IA', 'error');
            }
        } catch (e) {
            showToast('Falha ao chamar IA', 'error');
        } finally {
            setAnalyzing(false);
        }
    };

    // Carrega análise em cache quando troca de conversa
    useEffect(() => {
        if (linkedRecord?.id) {
            fetch(`/api/billing/ai-analyze?recordId=${linkedRecord.id}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => setAnalysis(d?.analysis || null))
                .catch(() => setAnalysis(null));
        } else {
            setAnalysis(null);
        }
    }, [linkedRecord?.id]);

    return (
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl p-0 shadow-2xl overflow-hidden">
            <div className="grid grid-cols-12 h-[600px]">
                {/* Lista de conversas */}
                <div className="col-span-4 border-r border-zinc-800 flex flex-col">
                    <div className="p-3 border-b border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-black text-white flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-violet-400" />
                                Conversas
                            </h4>
                            <button
                                onClick={loadConversations}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                                title="Atualizar"
                            >
                                <RefreshCw className={`w-3 h-3 ${loadingConv ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="relative">
                            <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-zinc-500" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar cliente ou telefone..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {loadingConv && conversations.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500 text-xs">Carregando...</div>
                        ) : filtered.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500 text-xs">
                                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                Nenhuma conversa ainda.<br />
                                Aguardando webhook Evolution.
                            </div>
                        ) : (
                            filtered.map(conv => (
                                <button
                                    key={conv.telefone}
                                    onClick={() => setSelectedPhone(conv.telefone)}
                                    className={`w-full p-3 text-left border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors ${
                                        selectedPhone === conv.telefone ? 'bg-violet-500/10 border-l-2 border-l-violet-500' : ''
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="font-bold text-xs text-white truncate">
                                            {conv.push_name || conv.telefone}
                                        </div>
                                        <div className="text-[9px] text-zinc-500 font-mono shrink-0">
                                            {new Date(conv.last_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-zinc-400 truncate">
                                        {conv.last_direction === 'OUTBOUND' && <span className="text-violet-400">↗ </span>}
                                        {conv.last_message || '(sem texto)'}
                                    </div>
                                    {conv.last_intent && (
                                        <span className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${INTENT_COLORS[conv.last_intent] || INTENT_COLORS.OUTROS}`}>
                                            {INTENT_LABEL[conv.last_intent] || conv.last_intent}
                                        </span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat view */}
                <div className="col-span-8 flex flex-col">
                    {!selectedPhone ? (
                        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                            <div className="text-center">
                                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>Selecione uma conversa para ver as mensagens</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs">
                                        {(linkedRecord?.clienteFornecedor || selectedPhone).slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-white">
                                            {linkedRecord?.clienteFornecedor || conversations.find(c => c.telefone === selectedPhone)?.push_name || selectedPhone}
                                        </div>
                                        <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                                            <Phone className="w-2.5 h-2.5" />
                                            +55 {selectedPhone}
                                            {linkedRecord && (
                                                <span className="ml-2 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold">
                                                    Cliente · {linkedRecord.status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={!linkedRecord || analyzing}
                                    className="px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-black rounded-lg flex items-center gap-1.5 disabled:opacity-40"
                                >
                                    <Sparkles className={`w-3 h-3 ${analyzing ? 'animate-spin' : ''}`} />
                                    {analyzing ? 'Analisando...' : 'Análise IA'}
                                </button>
                            </div>

                            {analysis && (
                                <div className="px-4 py-2.5 bg-violet-500/5 border-b border-violet-500/20 text-[10.5px] space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${INTENT_COLORS[analysis.classification] || 'bg-zinc-700 text-zinc-300 border-zinc-600'}`}>
                                            {analysis.classification}
                                        </span>
                                        <span className="text-zinc-500">Risco:</span>
                                        <span className={`font-black font-mono ${analysis.risk_score > 70 ? 'text-red-400' : analysis.risk_score > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                            {analysis.risk_score}/100
                                        </span>
                                        {analysis.next_action_at && (
                                            <>
                                                <span className="text-zinc-500">→</span>
                                                <span className="font-mono text-zinc-300">{analysis.next_action_at}</span>
                                            </>
                                        )}
                                    </div>
                                    {analysis.next_action && (
                                        <div className="text-zinc-200"><strong className="text-violet-300">Próxima ação:</strong> {analysis.next_action}</div>
                                    )}
                                    {analysis.summary && (
                                        <div className="text-zinc-400 italic">{analysis.summary}</div>
                                    )}
                                </div>
                            )}

                            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-zinc-950/30">
                                {loadingMsgs && messages.length === 0 ? (
                                    <div className="text-center text-zinc-500 text-xs py-8">Carregando mensagens...</div>
                                ) : messages.length === 0 ? (
                                    <div className="text-center text-zinc-500 text-xs py-8">Nenhuma mensagem ainda.</div>
                                ) : (
                                    messages.map(m => (
                                        <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[70%] p-2.5 rounded-2xl text-xs ${
                                                m.direction === 'OUTBOUND'
                                                    ? 'bg-violet-600 text-white rounded-br-sm'
                                                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                                            }`}>
                                                {m.media_type && (
                                                    <div className="text-[10px] opacity-70 italic mb-1">
                                                        [📎 {m.media_type}]
                                                    </div>
                                                )}
                                                {m.body || <em className="opacity-60">(sem texto)</em>}
                                                <div className="text-[9px] opacity-60 mt-1 text-right">
                                                    {new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="p-3 border-t border-zinc-800 flex items-end gap-2">
                                <textarea
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    placeholder="Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"
                                    rows={2}
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!draft.trim() || sending}
                                    className="p-2.5 bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 text-white rounded-xl disabled:opacity-50 shadow-lg shadow-violet-900/20"
                                    title="Enviar"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
