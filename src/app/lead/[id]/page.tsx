'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trophy, X, CalendarPlus, ArrowLeft, MessageSquare, Activity, Archive, PlayCircle } from 'lucide-react';
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

// Motivos estruturados do módulo de Reversão.
// Os 3 financeiros (credito_negado, cpf_ruim, score_baixo) marcam o lead
// como descarte_financeiro=true — IA NÃO tenta reverter (sem crédito).
const LOSS_REASONS = [
    { v: 'preco',          l: 'Preço alto',           hint: 'Cliente achou caro' },
    { v: 'parcela',        l: 'Parcela cara',         hint: 'Parcela não cabe no bolso' },
    { v: 'credito_negado', l: '❌ Crédito negado',     hint: 'Descarta IA (sem reversão)' },
    { v: 'cpf_ruim',       l: '❌ CPF ruim',           hint: 'Descarta IA' },
    { v: 'score_baixo',    l: '❌ Score baixo',        hint: 'Descarta IA' },
    { v: 'modelo',         l: 'Queria outro modelo',  hint: 'IA tenta novidade do estoque' },
    { v: 'concorrente',    l: 'Foi pro concorrente',  hint: 'IA reforça diferencial Manos' },
    { v: 'sumiu',          l: 'Sumiu / não responde', hint: 'IA tenta reabertura leve' },
    { v: 'outro',          l: 'Outro',                hint: 'Use o campo abaixo pra detalhar' },
];

const PAYMENT_METHODS = ['à vista', 'financiado', 'consórcio', 'CDC', 'troca + diferença'];

interface Lead {
    id: string;
    table_name: string;
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
    created_at: string | null;
    atendimento_iniciado_em: string | null;
}

function formatLeadEntryDate(iso: string | null): { date: string; time: string; ago: string } | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    let ago: string;
    if (diffMin < 1) ago = 'agora há pouco';
    else if (diffMin < 60) ago = `há ${diffMin} min`;
    else if (diffMin < 60 * 24) ago = `há ${Math.floor(diffMin / 60)}h`;
    else if (diffMin < 60 * 24 * 30) ago = `há ${Math.floor(diffMin / 60 / 24)}d`;
    else ago = `há ${Math.floor(diffMin / 60 / 24 / 30)} meses`;
    return { date, time, ago };
}

interface Message {
    id: number;
    direction: string;
    message_text: string;
    created_at: string;
    message_id?: string | null;
}

/**
 * Classifica a origem da mensagem.
 * - 'cliente'      → inbound, cliente respondendo
 * - 'ia_sdr'       → outbound da IA SDR (primeiro contato)
 * - 'ia_followup'  → outbound da IA Follow-up (reengajamento)
 * - 'vendedor'     → outbound manual do vendedor (extensão WhatsApp Web)
 */
type MessageOrigin = 'cliente' | 'ia_sdr' | 'ia_followup' | 'vendedor';

function getMessageOrigin(m: Message): MessageOrigin {
    if (m.direction === 'inbound') return 'cliente';
    const mid = m.message_id || '';
    if (mid.startsWith('ai_sdr_')) return 'ia_sdr';
    if (mid.startsWith('ai_followup_')) return 'ia_followup';
    return 'vendedor';
}

const ORIGIN_META: Record<MessageOrigin, { label: string; emoji: string; bgClass: string; borderClass: string; textClass: string }> = {
    cliente:     { label: 'Cliente',          emoji: '👤', bgClass: 'bg-zinc-800/60',  borderClass: 'border-zinc-700',  textClass: 'text-zinc-200' },
    vendedor:    { label: 'Você (vendedor)',  emoji: '🧑‍💼', bgClass: 'bg-emerald-900/40', borderClass: 'border-emerald-700/50', textClass: 'text-emerald-100' },
    ia_sdr:      { label: 'IA SDR',           emoji: '🤖', bgClass: 'bg-blue-900/40',  borderClass: 'border-blue-700/50', textClass: 'text-blue-100' },
    ia_followup: { label: 'IA Follow-up',     emoji: '🔁', bgClass: 'bg-purple-900/40', borderClass: 'border-purple-700/50', textClass: 'text-purple-100' },
};

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
    const [msgFilter, setMsgFilter] = useState<'todas' | MessageOrigin>('todas');
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
            const COLS_FULL = 'uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, proxima_acao, assigned_consultant_id, ai_summary, created_at, atendimento_iniciado_em';
            const COLS_FALLBACK = 'uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, proxima_acao, assigned_consultant_id, created_at';

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
                table_name: l.table_name,
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
                created_at: l.created_at ?? null,
                atendimento_iniciado_em: l.atendimento_iniciado_em ?? null,
            } : null;
            setLead(lead);
            setSoldVehicle(lead?.vehicle_interest || '');

            // Unificação V3: Busca na view unificada que contempla Arthur, Karol e Vendedor.
            // O filtro por lead_uid suporta tanto IDs numéricos quanto UUIDs.
            const cutoff90d = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
            const { data: msgs, error: msgError } = await supabase
                .from('unified_whatsapp_messages')
                .select('id, direction, message_text, created_at, message_id')
                .eq('lead_uid', String(leadId))
                .gte('created_at', cutoff90d)
                .order('created_at', { ascending: false })
                .limit(100); // Aumentado limite para contexto completo
            
            if (msgError) {
                console.warn('[LeadDetail] Erro ao buscar mensagens:', msgError.message);
            }
            // Dedup no client: rejeita msgs com mesmo texto + direção +
            // janela de 30s. Cobre histórico já duplicado no banco enquanto
            // sync-messages não é refeito.
            const rawMsgs = (msgs || []).reverse();
            const seen = new Map<string, number>();
            const deduped = rawMsgs.filter((m: any) => {
                const text = (m.message_text || '').trim();
                if (!text) return false;
                const key = `${m.direction}|${text}`;
                const ts = new Date(m.created_at).getTime();
                const lastTs = seen.get(key);
                if (lastTs && Math.abs(ts - lastTs) < 30_000) return false;
                seen.set(key, ts);
                return true;
            });
            if (alive) setMessages(deduped);

            // Resolve consultor logado + verifica permissão de acesso ao lead.
            // Vendedor não-admin só pode abrir lead atribuído a ele.
            try {
                const { data: sess } = await supabase.auth.getSession();
                const auth = { user: sess?.session?.user || null };
                if (auth?.user) {
                    const { data: cons } = await supabase
                        .from('consultants_manos_crm')
                        .select('id, name, role')
                        .or(`user_id.eq.${auth.user.id},auth_id.eq.${auth.user.id}`)
                        .maybeSingle();
                    if (alive && cons?.name) setConsultantName(cons.name);
                    // Guard: vendedor não-admin tentando acessar lead de outro
                    const isAdminUser = (cons as any)?.role === 'admin'
                        || auth.user.email === 'alexandre_gorges@hotmail.com';
                    if (!isAdminUser && lead && lead.assigned_consultant_id
                        && cons?.id && lead.assigned_consultant_id !== cons.id) {
                        if (alive) {
                            setLoadError('Você não tem permissão pra acessar este lead. Ele está atribuído a outro vendedor.');
                            setLead(null);
                            setLoading(false);
                        }
                        return;
                    }

                    // Auto-INICIAR atendimento: se vendedor abriu lead que ainda
                    // não foi tocado, marca como "em atendimento" automaticamente.
                    // Lead sai do Inbox e vai pro Kanban — sem cliques extras.
                    if (lead && !isAdminUser && cons?.id && !lead.atendimento_iniciado_em) {
                        fetch('/api/lead/start-atendimento', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lead_id: lead.id, lead_table: lead.table_name }),
                        }).then(r => r.json()).then(data => {
                            if (data?.success && data?.started_at && alive) {
                                setLead(prev => prev ? { ...prev, atendimento_iniciado_em: data.started_at } : prev);
                            }
                        }).catch(e => console.warn('[LeadDetail] auto-start atendimento falhou:', e?.message));
                    }
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
                    table: 'whatsapp_messages', // Monitora a tabela base
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
                    // legado (mantém pra compat e classifyLossReasonAsync)
                    loss_reason: lossNote ? `${lossReason}: ${lossNote}` : lossReason,
                    // Módulo de Reversão: estruturado + diagnóstico
                    motivo_perda_estruturado: lossReason,
                    diagnostico_atendimento: lossNote || null,
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
                        {(() => {
                            const entry = formatLeadEntryDate(lead.created_at);
                            return entry ? (
                                <div className="pt-2 mt-2 border-t border-zinc-800">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-0.5">
                                        🕐 Lead recebido em
                                    </div>
                                    <div className="text-gray-200 text-sm font-medium">
                                        {entry.date} <span className="text-gray-500">·</span> {entry.time}
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-0.5">{entry.ago}</div>
                                </div>
                            ) : null;
                        })()}
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
                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
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

                        {/* Tabs de filtro por origem — vendedor leigo entende
                            de onde veio cada mensagem. Conta msgs por tipo. */}
                        {messages.length > 0 && (() => {
                            const counts: Record<'todas' | MessageOrigin, number> = {
                                todas: messages.length,
                                cliente: 0, vendedor: 0, ia_sdr: 0, ia_followup: 0,
                            };
                            for (const m of messages) counts[getMessageOrigin(m)]++;
                            const tabs: Array<{ key: 'todas' | MessageOrigin; label: string; emoji: string }> = [
                                { key: 'todas',       label: 'Todas',     emoji: '💬' },
                                { key: 'cliente',     label: 'Cliente',   emoji: '👤' },
                                { key: 'vendedor',    label: 'Vendedor',  emoji: '🧑‍💼' },
                                { key: 'ia_sdr',      label: 'IA SDR',    emoji: '🤖' },
                                { key: 'ia_followup', label: 'IA Follow', emoji: '🔁' },
                            ];
                            return (
                                <div className="flex items-center gap-1 mb-2 flex-wrap">
                                    {tabs.map(t => {
                                        const active = msgFilter === t.key;
                                        const n = counts[t.key];
                                        return (
                                            <button
                                                key={t.key}
                                                onClick={() => setMsgFilter(t.key)}
                                                disabled={n === 0 && t.key !== 'todas'}
                                                className={`text-[11px] px-2 py-1 rounded-md font-bold transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                                    active ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                }`}
                                            >
                                                {t.emoji} {t.label} <span className="opacity-60">·{n}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })()}

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
                                messages
                                    .filter(m => msgFilter === 'todas' || getMessageOrigin(m) === msgFilter)
                                    .map(m => {
                                        const origin = getMessageOrigin(m);
                                        const meta = ORIGIN_META[origin];
                                        const alignRight = origin !== 'cliente';
                                        return (
                                            <div
                                                key={m.id}
                                                className={`text-sm p-2 rounded-lg max-w-[90%] md:max-w-[85%] break-words border ${meta.bgClass} ${meta.borderClass} ${meta.textClass} ${alignRight ? 'ml-auto' : ''}`}
                                            >
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                                                        {meta.emoji} {meta.label}
                                                    </span>
                                                </div>
                                                {m.message_text}
                                                <div className="text-[10px] text-gray-500 mt-1">
                                                    {new Date(m.created_at).toLocaleString('pt-BR')}
                                                </div>
                                            </div>
                                        );
                                    })
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

                {/* Direita — ações grandes e claras pro vendedor leigo.
                    Cada botão tem subtítulo explicando QUANDO usar (vendedor
                    não precisa adivinhar). */}
                <aside className="md:col-span-3 space-y-3 min-w-0">
                    {/* Botão "INICIAR ATENDIMENTO" — mostra se ainda não iniciou.
                        Quando vendedor clica, marca timestamp; SLA Watcher cobra
                        depois (2h, 4h, 24h). Some depois que iniciou. */}
                    {!lead.atendimento_iniciado_em ? (
                        <button
                            onClick={async () => {
                                try {
                                    const res = await fetch('/api/lead/start-atendimento', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ lead_id: lead.id, lead_table: lead.table_name }),
                                    });
                                    const data = await res.json();
                                    if (res.status === 409 && data.locked) {
                                        alert(`🔒 ${data.error}\n\nVocê não pode atender — outro vendedor já está cuidando deste lead.`);
                                        return;
                                    }
                                    if (!res.ok || !data.success) throw new Error(data.error || 'falha');
                                    setLead(prev => prev ? { ...prev, atendimento_iniciado_em: data.started_at || new Date().toISOString() } : prev);
                                } catch (e: any) {
                                    alert('Erro: ' + (e?.message || 'tente de novo'));
                                }
                            }}
                            title="Marca que você assumiu este lead. Você é responsável por fechar ou justificar perda."
                            className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition text-white py-5 rounded-xl font-bold text-xl flex flex-col items-center justify-center gap-1 shadow-lg animate-pulse"
                        >
                            <div className="flex items-center gap-2">
                                <PlayCircle className="w-6 h-6" /> INICIAR ATENDIMENTO
                            </div>
                            <span className="text-xs font-normal opacity-80">Estou cuidando deste lead agora</span>
                        </button>
                    ) : (
                        <div className="w-full bg-blue-900/30 border border-blue-700/50 text-blue-200 py-3 rounded-xl text-center">
                            <div className="text-xs uppercase tracking-wider text-blue-400 font-bold">Atendendo desde</div>
                            <div className="text-sm font-semibold mt-0.5">
                                {new Date(lead.atendimento_iniciado_em).toLocaleString('pt-BR', {
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                })}
                            </div>
                        </div>
                    )}

                    <div className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-1 pt-2">O que aconteceu com esse lead?</div>

                    <button
                        onClick={() => setShowSold(true)}
                        title="Cliente fechou compra. Vou registrar valor e forma de pagamento."
                        className="w-full bg-green-600 hover:bg-green-500 active:scale-[0.98] transition text-white py-5 rounded-xl font-bold text-xl flex flex-col items-center justify-center gap-1 shadow-lg"
                    >
                        <div className="flex items-center gap-2">
                            <Trophy className="w-6 h-6" /> VENDIDO
                        </div>
                        <span className="text-xs font-normal opacity-80">Fechei a venda 🎉</span>
                    </button>

                    <button
                        onClick={() => setShowLost(true)}
                        title="Cliente não vai comprar. Vou registrar o motivo (preço, concorrente, sem interesse, etc)."
                        className="w-full bg-red-700 hover:bg-red-600 active:scale-[0.98] transition text-white py-5 rounded-xl font-bold text-xl flex flex-col items-center justify-center gap-1 shadow-lg"
                    >
                        <div className="flex items-center gap-2">
                            <X className="w-6 h-6" /> PERDIDO
                        </div>
                        <span className="text-xs font-normal opacity-80">Não vai comprar (preciso dizer o motivo)</span>
                    </button>

                    <button
                        onClick={() => setShowSchedule(true)}
                        title="Não vai fechar hoje, mas continua interessado. Vou agendar um retorno."
                        className="w-full bg-amber-600 hover:bg-amber-500 active:scale-[0.98] transition text-white py-5 rounded-xl font-bold text-xl flex flex-col items-center justify-center gap-1 shadow-lg"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarPlus className="w-6 h-6" /> AGENDAR
                        </div>
                        <span className="text-xs font-normal opacity-80">Não fecha hoje — vou voltar depois</span>
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

            {showLost && (() => {
                const selectedReason = LOSS_REASONS.find(r => r.v === lossReason);
                const isFinanceiro = ['credito_negado', 'cpf_ruim', 'score_baixo'].includes(lossReason);
                return (
                    <Modal title="Marcar PERDA" onClose={() => setShowLost(false)}>
                        <label className="block text-sm text-gray-300 mb-1">Por que esse lead não fechou? *</label>
                        <select
                            value={lossReason}
                            onChange={e => setLossReason(e.target.value)}
                            className="w-full p-2 rounded bg-zinc-800 text-white mb-1"
                        >
                            {LOSS_REASONS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                        </select>
                        {selectedReason?.hint && (
                            <p className="text-[11px] text-zinc-400 mb-3 px-1">{selectedReason.hint}</p>
                        )}

                        {isFinanceiro && (
                            <div className="mb-3 p-2 rounded bg-red-950/50 border border-red-700/50 text-xs text-red-200">
                                ⚠️ Motivo financeiro detectado. IA <strong>não vai tentar reverter</strong> esse lead — sem crédito, sem reengajamento.
                            </div>
                        )}

                        <label className="block text-sm text-gray-300 mb-1">
                            Diagnóstico do atendimento <span className="text-zinc-500">(opcional, ajuda a IA)</span>
                        </label>
                        <textarea
                            value={lossNote}
                            onChange={e => setLossNote(e.target.value)}
                            rows={3}
                            placeholder="Ex: cliente queria Onix 2020 mas tinha só R$ 50k; achou parcela alta de 36x; gostou da loja"
                            className="w-full p-2 rounded bg-zinc-800 text-white mb-4 text-sm"
                        />
                        <button
                            disabled={submitting}
                            onClick={handleLost}
                            className="w-full bg-red-700 disabled:bg-gray-700 text-white py-3 rounded font-bold"
                        >
                            {submitting ? 'Salvando…' : 'CONFIRMAR PERDA'}
                        </button>
                    </Modal>
                );
            })()}

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
