'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trophy, X, CalendarPlus, ArrowLeft, MessageSquare, Activity, Archive } from 'lucide-react';
import { parseUid } from '@/lib/services/unifiedLead';
import CannedResponses, { CannedContext } from '@/components/CannedResponses';
import FollowupHistory from '@/components/FollowupHistory';

const ARCHIVE_REASONS = [
    { v: 'nao_e_lead', l: 'Spam / não é lead real' },
    { v: 'pediu_pra_parar', l: 'Pediu pra parar de receber msgs' },
    { v: 'comprou_em_outro_lugar', l: 'Já comprou em outro lugar' },
    { v: 'numero_errado', l: 'Número errado / não responde' },
    { v: 'outro', l: 'Outro motivo' },
];

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
    ai_summary: string | null;
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
    const [analyzing, setAnalyzing] = useState(false);
    const [consultantName, setConsultantName] = useState<string>('');
    const [showConfetti, setShowConfetti] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [showSold, setShowSold] = useState(false);
    const [showLost, setShowLost] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [showArchive, setShowArchive] = useState(false);
    const [archiveReason, setArchiveReason] = useState(ARCHIVE_REASONS[0].v);

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
            // Se a view não tiver alguma coluna nova (caso após migration falha),
            // tentamos primeiro com ai_summary e fazemos retry sem ele.
            const COLS_FULL = 'uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, proxima_acao, assigned_consultant_id, ai_summary';
            const COLS_FALLBACK = 'uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, proxima_acao, assigned_consultant_id';

            let l: any = null;
            let queryError: string | null = null;
            const tryQuery = async (cols: string) =>
                supabase.from('leads_unified')
                    .select(cols)
                    .eq('table_name', leadTable)
                    .eq('native_id', leadId)
                    .maybeSingle();

            const r1 = await tryQuery(COLS_FULL);
            if (r1.error) {
                console.warn('[LeadDetail] view sem ai_summary, tentando fallback:', r1.error.message);
                const r2 = await tryQuery(COLS_FALLBACK);
                if (r2.error) {
                    queryError = r2.error.message;
                } else {
                    l = r2.data;
                }
            } else {
                l = r1.data;
            }

            if (!alive) return;
            if (queryError) {
                setLoadError(`Erro ao buscar lead: ${queryError}`);
                setLoading(false);
                return;
            }

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
                ai_summary: l.ai_summary ?? null,
            } : null;
            setLead(lead);
            setSoldVehicle(lead?.vehicle_interest || '');

            const { data: msgs, error: msgError } = await supabase
                .from('whatsapp_messages')
                .select('id, direction, message_text, created_at')
                .eq('lead_id', leadId)
                .order('created_at', { ascending: false })
                .limit(30);
            
            if (msgError) {
                console.warn('[LeadDetail] Erro ao buscar mensagens:', msgError.message);
            }
            if (alive) setMessages((msgs || []).reverse());

            // Resolve nome do consultor logado pra usar nas mensagens prontas
            try {
                const { data: auth } = await supabase.auth.getUser();
                if (auth?.user) {
                    const { data: cons } = await supabase
                        .from('consultants_manos_crm')
                        .select('name')
                        .eq('user_id', auth.user.id)
                        .maybeSingle();
                    if (alive && cons?.name) setConsultantName(cons.name);
                }
            } catch {}

            setLoading(false);
        }
        if (leadId) load();
        return () => { alive = false; };
    }, [leadId, leadTable, supabase]);

    // Realtime: nova msg em whatsapp_messages do lead atual aparece automático
    useEffect(() => {
        if (!leadId) return;
        const channel = supabase
            .channel(`lead-msgs-${leadId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'whatsapp_messages',
                    filter: `lead_id=eq.${leadId}`,
                },
                (payload: any) => {
                    const m = payload.new;
                    if (m && m.message_text) {
                        setMessages(prev => {
                            // Evita duplicar se a msg já está na lista (vinda do load inicial)
                            if (prev.some(x => x.id === m.id)) return prev;
                            return [...prev, {
                                id: m.id,
                                direction: m.direction || 'outbound',
                                message_text: m.message_text,
                                created_at: m.created_at,
                            }];
                        });
                    }
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [leadId, supabase]);

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
            // Comemoração antes de redirecionar
            setShowSold(false);
            setShowConfetti(true);
            setTimeout(() => router.push('/inbox'), 2400);
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

    async function handleAnalyze() {
        setAnalyzing(true);
        try {
            const res = await fetch('/api/lead/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId: leadId,
                    table: leadTable,
                    messages: messages // envia mensagens carregadas para acelerar análise
                }),
            });
            const data = await res.json();
            if (data.success && lead) {
                // Atualiza o resumo localmente
                setLead({
                    ...lead,
                    ai_summary: `[${new Date().toLocaleString('pt-BR')}] 🤖 ANÁLISE:\n${data.diagnostico}\n\nORIENTAÇÃO: ${data.orientacao}`,
                    proxima_acao: data.scriptWhatsApp
                });
            }
        } catch (err) {
            console.error('Falha ao analisar:', err);
        } finally {
            setAnalyzing(false);
        }
    }

    async function handleArchive() {
        if (!archiveReason) return;
        setSubmitting(true);
        try {
            await fetch('/api/lead/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: leadId,
                    lead_table: leadTable,
                    reason: archiveReason,
                    archived_by: lead?.assigned_consultant_id,
                    archive: true,
                }),
            });
            setShowArchive(false);
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
    if (loadError) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <button onClick={() => router.push('/inbox')} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-3">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <div className="bg-red-900/30 border border-red-800 rounded-lg p-5">
                    <h2 className="text-lg font-bold text-red-300 mb-2">Erro ao carregar lead</h2>
                    <p className="text-sm text-red-100 mb-3">{loadError}</p>
                    <p className="text-xs text-gray-400">
                        UID solicitado: <code className="bg-zinc-900 px-2 py-0.5 rounded">{leadTable}:{leadId}</code>
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                        Se o erro mencionar coluna inexistente, aplique a última migration SQL no Supabase
                        (<code>20260505_view_add_ai_summary.sql</code>).
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-3 text-xs bg-zinc-800 hover:bg-zinc-700 text-gray-200 px-3 py-1.5 rounded"
                    >
                        Tentar novamente
                    </button>
                </div>
            </div>
        );
    }
    if (!lead) return (
        <div className="p-6 max-w-2xl mx-auto">
            <button onClick={() => router.push('/inbox')} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-3">
                <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <div className="bg-zinc-900 rounded-lg p-5 border border-zinc-800">
                <h2 className="text-lg font-bold text-gray-300 mb-1">Lead não encontrado</h2>
                <p className="text-sm text-gray-400">Esse UID não existe mais ou foi arquivado.</p>
                <p className="text-xs text-gray-500 mt-2">
                    UID: <code className="bg-zinc-950 px-2 py-0.5 rounded">{leadTable}:{leadId}</code>
                </p>
            </div>
        </div>
    );

    return (
        <div className="p-2 md:p-4 max-w-7xl mx-auto w-full overflow-x-hidden">
            <button onClick={() => router.push('/inbox')} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-3">
                <ArrowLeft className="w-4 h-4" /> Voltar
            </button>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Esquerda — dados */}
                <aside className="md:col-span-3 bg-zinc-900 rounded-lg p-3 md:p-4 min-w-0">
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

                {/* Centro — conversa real + resumo IA empilhados */}
                <section className="md:col-span-6 flex flex-col gap-3 min-w-0">
                    {/* CONVERSA REAL */}
                    <div className="bg-zinc-900 rounded-lg p-3 md:p-4 flex flex-col min-w-0" style={{ maxHeight: '50vh', minHeight: '300px' }}>
                        <div className="flex items-center justify-between mb-2 gap-2">
                            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" /> Conversa WhatsApp
                                {messages.length > 0 && (
                                    <span className="text-[10px] font-mono text-gray-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                                        {messages.length} msg{messages.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </h3>
                            <CannedResponses
                                ctx={{
                                    leadFirstName: (lead.name || '').trim().split(/\s+/)[0] || '',
                                    vehicleInterest: lead.vehicle_interest || '',
                                    consultantFirstName: (consultantName || '').trim().split(/\s+/)[0] || '',
                                    leadPhone: lead.phone || undefined,
                                } as CannedContext}
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                            {messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center py-8 px-4">
                                    <MessageSquare className="w-10 h-10 text-zinc-700 mb-3" />
                                    <p className="text-sm text-gray-500 mb-1">Nenhuma conversa registrada ainda</p>
                                    <p className="text-xs text-gray-600 mb-4">
                                        Quando o cliente responder ou você mandar a primeira msg, ela aparece aqui em tempo real.
                                    </p>
                                    {lead.phone && (
                                        <a
                                            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                                            target="_blank" rel="noreferrer"
                                            className="text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                                        >
                                            Iniciar conversa no WhatsApp
                                        </a>
                                    )}
                                </div>
                            ) : (
                                messages.map(m => (
                                    <div
                                        key={m.id}
                                        className={`text-sm p-2 rounded max-w-[90%] md:max-w-[85%] break-words ${
                                            m.direction === 'inbound'
                                                ? 'bg-zinc-800 text-gray-100'
                                                : 'bg-blue-900/40 text-blue-100 ml-auto'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                                                {m.direction === 'inbound' ? '👤 Cliente' : '🟢 Loja/IA'}
                                            </span>
                                        </div>
                                        {m.message_text}
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            {new Date(m.created_at).toLocaleString('pt-BR')}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* RESUMO IA — bloco separado, abaixo da conversa */}
                    <div className="bg-zinc-900 rounded-lg p-3 md:p-4 border-l-4 border-emerald-500 min-w-0">
                        <div className="flex items-center justify-between mb-2 gap-2">
                            <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                                🧠 Resumo Estratégico da IA
                            </h3>
                            <button
                                onClick={handleAnalyze}
                                disabled={analyzing}
                                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-gray-300 px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <Activity className="w-3 h-3" />
                                {analyzing ? 'Analisando…' : (lead.ai_summary ? 'Atualizar análise' : 'Gerar análise')}
                            </button>
                        </div>
                        {lead.ai_summary ? (
                            <p className="text-gray-100 text-sm leading-relaxed whitespace-pre-line break-words">
                                {lead.ai_summary}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-500 italic">
                                Nenhuma análise gerada ainda.
                                {messages.length === 0
                                    ? ' Aguarde mensagens do cliente pra gerar contexto.'
                                    : ' Clique em "Gerar análise" pra IA estudar a conversa.'}
                            </p>
                        )}
                    </div>

                    {/* HISTÓRICO DE FOLLOW-UP IA */}
                    <FollowupHistory leadNativeId={leadId} />
                </section>

                {/* Direita — ações */}
                <aside className="md:col-span-3 space-y-3 min-w-0">
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
                    <button
                        onClick={() => setShowArchive(true)}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-gray-400 hover:text-gray-200 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 mt-2 border border-zinc-700"
                    >
                        <Archive className="w-3.5 h-3.5" /> Arquivar lead
                    </button>
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

            {showArchive && (
                <Modal title="Arquivar lead" onClose={() => setShowArchive(false)}>
                    <p className="text-sm text-gray-400 mb-3">
                        Arquivar tira o lead da fila e <strong>impede mensagens automáticas</strong> da IA.
                        Pode desarquivar depois.
                    </p>
                    <label className="block text-sm text-gray-300 mb-1">Motivo *</label>
                    <select value={archiveReason} onChange={e => setArchiveReason(e.target.value)}
                        className="w-full p-2 rounded bg-zinc-800 text-white mb-4">
                        {ARCHIVE_REASONS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                    </select>
                    <button disabled={submitting} onClick={handleArchive}
                        className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:bg-gray-800 text-white py-3 rounded font-bold flex items-center justify-center gap-2">
                        <Archive className="w-4 h-4" />
                        {submitting ? 'Arquivando…' : 'CONFIRMAR ARQUIVAMENTO'}
                    </button>
                </Modal>
            )}

            {showConfetti && <ConfettiOverlay />}
        </div>
    );
}

function ConfettiOverlay() {
    const pieces = Array.from({ length: 80 }, (_, i) => i);
    const colors = ['#22c55e', '#3b82f6', '#eab308', '#ef4444', '#a855f7', '#f97316', '#06b6d4'];
    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
            {/* Banner central */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-green-600/95 text-white px-8 py-6 rounded-2xl shadow-2xl text-center animate-confetti-banner">
                    <div className="text-5xl mb-2">🎉</div>
                    <div className="text-2xl font-black uppercase tracking-wider">VENDA FECHADA!</div>
                    <div className="text-xs opacity-90 mt-1">Bora pra próxima.</div>
                </div>
            </div>
            {/* Confete */}
            {pieces.map(i => {
                const left = Math.random() * 100;
                const delay = Math.random() * 0.6;
                const dur = 1.6 + Math.random() * 1.2;
                const color = colors[i % colors.length];
                const size = 6 + Math.floor(Math.random() * 8);
                return (
                    <span
                        key={i}
                        className="absolute top-[-20px] block animate-confetti-fall"
                        style={{
                            left: `${left}%`,
                            width: `${size}px`,
                            height: `${size * 0.4}px`,
                            background: color,
                            animationDelay: `${delay}s`,
                            animationDuration: `${dur}s`,
                            transform: `rotate(${Math.random() * 360}deg)`,
                        }}
                    />
                );
            })}
            <style jsx>{`
                @keyframes confetti-fall {
                    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(110vh) rotate(720deg); opacity: 0.7; }
                }
                @keyframes confetti-banner {
                    0% { transform: scale(0.6); opacity: 0; }
                    20% { transform: scale(1.08); opacity: 1; }
                    40% { transform: scale(1); }
                    85% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(0.95); opacity: 0; }
                }
                :global(.animate-confetti-fall) {
                    animation-name: confetti-fall;
                    animation-timing-function: cubic-bezier(0.2, 0.6, 0.6, 1);
                    animation-fill-mode: forwards;
                }
                :global(.animate-confetti-banner) {
                    animation: confetti-banner 2.4s ease-out forwards;
                }
            `}</style>
        </div>
    );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3 md:p-4" onClick={onClose}>
            <div className="bg-zinc-900 rounded-lg p-5 md:p-6 max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
