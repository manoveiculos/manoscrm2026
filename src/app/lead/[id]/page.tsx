'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trophy, X, CalendarPlus, ArrowLeft, MessageSquare } from 'lucide-react';
import { parseUid } from '@/lib/services/unifiedLead';

/**
 * /lead/[id] — Tela de FECHAMENTO.
 *
 * 3 ações grandes:
 *   - VENDIDO  → captura valor + forma de pagamento + veículo
 *   - PERDIDO  → captura motivo obrigatório
 *   - AGENDAR  → cria follow-up datado
 *
 * Esquerda: dados + sugestão IA
 * Centro:   últimas mensagens (read-only)
 * Direita:  botões de ação
 */

const LOSS_REASONS = [
    { v: 'preco', l: 'Preço' },
    { v: 'concorrente', l: 'Concorrente' },
    { v: 'sem_interesse', l: 'Sem interesse' },
    { v: 'sem_resposta', l: 'Sem resposta' },
    { v: 'credito_negado', l: 'Crédito negado' },
    { v: 'outro', l: 'Outro' },
];

const PAYMENT_METHODS = ['à vista', 'financiado', 'consórcio', 'CDC', 'troca + diferença'];

interface Lead {
    id: string;
    name: string | null;
    phone: string | null;
    vehicle_interest: string | null;
    source: string | null;
    ai_score: number | null;
    ai_classification: string | null;
    status: string | null;
    proxima_acao: string | null;
    last_scripts_json: any;
    valor_investimento: string | null;
    assigned_consultant_id: string | null;
}

interface Message {
    id: number;
    direction: string;
    message_text: string;
    created_at: string;
}

export default function LeadDetailPage() {
    const params = useParams();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const rawId = String(params?.id || '');
    const parsed = useMemo(() => parseUid(rawId), [rawId]);
    const leadId = parsed?.nativeId || rawId;
    const leadTable = parsed?.table || 'leads_manos_crm';

    const [lead, setLead] = useState<Lead | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [showSold, setShowSold] = useState(false);
    const [showLost, setShowLost] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);

    // Sold
    const [soldValue, setSoldValue] = useState('');
    const [soldPayment, setSoldPayment] = useState(PAYMENT_METHODS[0]);
    const [soldVehicle, setSoldVehicle] = useState('');

    // Lost
    const [lossReason, setLossReason] = useState(LOSS_REASONS[0].v);
    const [lossNote, setLossNote] = useState('');

    // Schedule
    const [scheduleAt, setScheduleAt] = useState('');
    const [scheduleNote, setScheduleNote] = useState('');

    useEffect(() => {
        let alive = true;
        async function load() {
            // Lê da view unificada — funciona para qualquer tabela origem
            const { data: l } = await supabase
                .from('leads_unified')
                .select('uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, proxima_acao, assigned_consultant_id')
                .eq('table_name', leadTable)
                .eq('native_id', leadId)
                .maybeSingle();

            if (!alive) return;
            const lead: Lead | null = l ? {
                id: l.native_id,
                name: l.name,
                phone: l.phone,
                vehicle_interest: l.vehicle_interest,
                source: l.source,
                ai_score: l.ai_score,
                ai_classification: l.ai_classification,
                status: l.status,
                proxima_acao: l.proxima_acao,
                last_scripts_json: null,
                valor_investimento: null,
                assigned_consultant_id: l.assigned_consultant_id,
            } : null;
            setLead(lead);
            setSoldVehicle(lead?.vehicle_interest || '');

            const { data: msgs } = await supabase
                .from('whatsapp_messages')
                .select('id, direction, message_text, created_at')
                .eq('lead_id', leadId)
                .order('created_at', { ascending: false })
                .limit(30);
            if (alive) setMessages((msgs || []).reverse());
            setLoading(false);
        }
        if (leadId) load();
        return () => { alive = false; };
    }, [leadId, leadTable, supabase]);

    async function handleSold() {
        if (!soldValue || !soldPayment) return;
        setSubmitting(true);
        try {
            await fetch('/api/lead/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: leadId,
                    lead_table: leadTable,
                    finish_type: 'venda',
                    vehicle_details: `${soldVehicle} | ${soldPayment} | R$ ${soldValue}`,
                    consultant_id: lead?.assigned_consultant_id,
                }),
            });
            router.push('/inbox');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleLost() {
        if (!lossReason) return;
        setSubmitting(true);
        try {
            await fetch('/api/lead/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: leadId,
                    lead_table: leadTable,
                    finish_type: 'perda',
                    loss_reason: lossNote ? `${lossReason}: ${lossNote}` : lossReason,
                    consultant_id: lead?.assigned_consultant_id,
                }),
            });
            router.push('/inbox');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSchedule() {
        if (!scheduleAt) return;
        setSubmitting(true);
        try {
            await supabase.from('follow_ups').insert({
                lead_id: leadId,
                consultant_id: lead?.assigned_consultant_id,
                scheduled_at: new Date(scheduleAt).toISOString(),
                type: 'manual',
                status: 'pending',
                notes: scheduleNote || 'Retorno agendado pelo vendedor',
            });
            setShowSchedule(false);
            setScheduleAt('');
            setScheduleNote('');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) return <div className="p-6 text-gray-400">Carregando…</div>;
    if (!lead) return <div className="p-6 text-gray-400">Lead não encontrado.</div>;

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <button onClick={() => router.push('/inbox')} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-3">
                <ArrowLeft className="w-4 h-4" /> Voltar
            </button>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Esquerda — dados */}
                <aside className="md:col-span-3 bg-zinc-900 rounded-lg p-4">
                    <h2 className="text-xl font-bold text-white">{lead.name || 'Sem nome'}</h2>
                    <p className="text-sm text-gray-400 mt-1">{lead.phone || '—'}</p>
                    <div className="mt-3 space-y-1 text-sm">
                        <div><span className="text-gray-500">Interesse:</span> {lead.vehicle_interest || '—'}</div>
                        <div><span className="text-gray-500">Origem:</span> {lead.source || '—'}</div>
                        <div><span className="text-gray-500">Score IA:</span> {lead.ai_score ?? 0}</div>
                        <div><span className="text-gray-500">Status:</span> {lead.status || 'novo'}</div>
                    </div>

                    {lead.proxima_acao && (
                        <div className="mt-4 p-3 bg-blue-900/30 border border-blue-800 rounded text-sm">
                            <div className="text-xs text-blue-300 mb-1">💡 IA sugere</div>
                            <p className="text-gray-200 italic">{lead.proxima_acao}</p>
                        </div>
                    )}
                </aside>

                {/* Centro — conversa */}
                <section className="md:col-span-6 bg-zinc-900 rounded-lg p-4 flex flex-col" style={{ maxHeight: '70vh' }}>
                    <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" /> Conversa WhatsApp
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {messages.length === 0 ? (
                            <p className="text-sm text-gray-500">Nenhuma mensagem ainda.</p>
                        ) : (
                            messages.map(m => (
                                <div
                                    key={m.id}
                                    className={`text-sm p-2 rounded max-w-[85%] ${m.direction === 'inbound' ? 'bg-zinc-800 text-gray-100' : 'bg-blue-900/40 text-blue-100 ml-auto'}`}
                                >
                                    {m.message_text}
                                    <div className="text-[10px] text-gray-500 mt-1">{new Date(m.created_at).toLocaleString('pt-BR')}</div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Direita — ações */}
                <aside className="md:col-span-3 space-y-3">
                    <button onClick={() => setShowSold(true)} className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2">
                        <Trophy className="w-5 h-5" /> VENDIDO
                    </button>
                    <button onClick={() => setShowLost(true)} className="w-full bg-red-700 hover:bg-red-600 text-white py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2">
                        <X className="w-5 h-5" /> PERDIDO
                    </button>
                    <button onClick={() => setShowSchedule(true)} className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-4 rounded-lg font-semibold flex items-center justify-center gap-2">
                        <CalendarPlus className="w-5 h-5" /> AGENDAR RETORNO
                    </button>
                    {lead.phone && (
                        <a
                            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                            target="_blank" rel="noreferrer"
                            className="block w-full bg-emerald-600 hover:bg-emerald-500 text-center text-white py-3 rounded-lg font-medium"
                        >
                            Abrir WhatsApp
                        </a>
                    )}
                </aside>
            </div>

            {showSold && (
                <Modal title="Confirmar VENDA" onClose={() => setShowSold(false)}>
                    <label className="block text-sm text-gray-300 mb-1">Valor (R$)</label>
                    <input value={soldValue} onChange={e => setSoldValue(e.target.value)} type="number" className="w-full p-2 rounded bg-zinc-800 text-white mb-3" />
                    <label className="block text-sm text-gray-300 mb-1">Forma de pagamento</label>
                    <select value={soldPayment} onChange={e => setSoldPayment(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white mb-3">
                        {PAYMENT_METHODS.map(p => <option key={p}>{p}</option>)}
                    </select>
                    <label className="block text-sm text-gray-300 mb-1">Veículo vendido</label>
                    <input value={soldVehicle} onChange={e => setSoldVehicle(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white mb-4" />
                    <button disabled={submitting || !soldValue} onClick={handleSold} className="w-full bg-green-600 disabled:bg-gray-700 text-white py-3 rounded font-bold">
                        {submitting ? 'Salvando…' : 'CONFIRMAR VENDA'}
                    </button>
                </Modal>
            )}

            {showLost && (
                <Modal title="Marcar PERDA" onClose={() => setShowLost(false)}>
                    <label className="block text-sm text-gray-300 mb-1">Motivo *</label>
                    <select value={lossReason} onChange={e => setLossReason(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white mb-3">
                        {LOSS_REASONS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                    </select>
                    <label className="block text-sm text-gray-300 mb-1">Observação (opcional)</label>
                    <textarea value={lossNote} onChange={e => setLossNote(e.target.value)} rows={3} className="w-full p-2 rounded bg-zinc-800 text-white mb-4" />
                    <button disabled={submitting} onClick={handleLost} className="w-full bg-red-700 disabled:bg-gray-700 text-white py-3 rounded font-bold">
                        {submitting ? 'Salvando…' : 'CONFIRMAR PERDA'}
                    </button>
                </Modal>
            )}

            {showSchedule && (
                <Modal title="Agendar retorno" onClose={() => setShowSchedule(false)}>
                    <label className="block text-sm text-gray-300 mb-1">Data e hora *</label>
                    <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white mb-3" />
                    <label className="block text-sm text-gray-300 mb-1">Nota (opcional)</label>
                    <textarea value={scheduleNote} onChange={e => setScheduleNote(e.target.value)} rows={2} className="w-full p-2 rounded bg-zinc-800 text-white mb-4" />
                    <button disabled={submitting || !scheduleAt} onClick={handleSchedule} className="w-full bg-blue-600 disabled:bg-gray-700 text-white py-3 rounded font-bold">
                        {submitting ? 'Salvando…' : 'AGENDAR'}
                    </button>
                </Modal>
            )}
        </div>
    );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
