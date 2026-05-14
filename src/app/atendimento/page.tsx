'use client';

import { useEffect, useMemo, useState, useCallback, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Clock, AlertTriangle, MessageCircle, Trophy, X as XIcon, GripVertical } from 'lucide-react';

interface KanbanLead {
    uid: string;
    table_name: string;
    native_id: string;
    name: string | null;
    phone: string | null;
    vehicle_interest: string | null;
    status: string | null;
    ai_score: number | null;
    atendimento_iniciado_em: string | null;
    ultima_interacao_humana: string | null;
    flagged_reversao: boolean | null;
}

interface LastMsg { text: string; direction: string; created_at: string; }

type Column = 'qualificacao' | 'proposta' | 'test_drive' | 'fechamento';

const COLUMN_OF_STATUS: Record<string, Column> = {
    received: 'qualificacao',
    novo: 'qualificacao',
    triagem: 'qualificacao',
    attempt: 'qualificacao',
    contacted: 'qualificacao',
    proposed: 'proposta',
    negotiation: 'proposta',
    scheduled: 'test_drive',
    visited: 'test_drive',
    closing: 'fechamento',
    fechamento: 'fechamento',
};

const STATUS_OF_COLUMN: Record<Column, string> = {
    qualificacao: 'attempt',
    proposta: 'proposed',
    test_drive: 'scheduled',
    fechamento: 'fechamento',
};

const COLUMNS: Array<{
    key: Column;
    label: string;
    emoji: string;
    desc: string;
    gradient: string;
    border: string;
    text: string;
    badge: string;
}> = [
    { key: 'qualificacao', label: 'Qualificação', emoji: '🔍', desc: 'Entendendo necessidade',
      gradient: 'from-blue-950/60 to-zinc-900',
      border: 'border-blue-700/40',
      text: 'text-blue-300',
      badge: 'bg-blue-900/60 text-blue-200' },
    { key: 'proposta',     label: 'Proposta',     emoji: '💼', desc: 'Negociando valor',
      gradient: 'from-amber-950/60 to-zinc-900',
      border: 'border-amber-700/40',
      text: 'text-amber-300',
      badge: 'bg-amber-900/60 text-amber-200' },
    { key: 'test_drive',   label: 'Test Drive',   emoji: '🚗', desc: 'Visita agendada / feita',
      gradient: 'from-purple-950/60 to-zinc-900',
      border: 'border-purple-700/40',
      text: 'text-purple-300',
      badge: 'bg-purple-900/60 text-purple-200' },
    { key: 'fechamento',   label: 'Fechamento',   emoji: '🏆', desc: 'Última milha',
      gradient: 'from-emerald-950/60 to-zinc-900',
      border: 'border-emerald-700/40',
      text: 'text-emerald-300',
      badge: 'bg-emerald-900/60 text-emerald-200' },
];

function columnFor(lead: KanbanLead): Column {
    return COLUMN_OF_STATUS[String(lead.status || '').toLowerCase()] || 'qualificacao';
}

function ageInfo(iso: string | null | undefined): { text: string; color: string; stale: boolean; alert: boolean } {
    if (!iso) return { text: '—', color: 'text-zinc-500', stale: false, alert: false };
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return { text: `${mins}min`, color: 'text-emerald-300', stale: false, alert: false };
    const h = Math.floor(mins / 60);
    if (h < 8) return { text: `${h}h`, color: 'text-yellow-300', stale: false, alert: false };
    if (h < 24) return { text: `${h}h`, color: 'text-orange-400', stale: true, alert: false };
    return { text: `${Math.floor(h / 24)}d`, color: 'text-red-400', stale: true, alert: true };
}

export default function AtendimentoKanbanPage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [leads, setLeads] = useState<KanbanLead[]>([]);
    const [lastMsgs, setLastMsgs] = useState<Map<string, LastMsg>>(new Map());
    const [loading, setLoading] = useState(true);
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [draggingUid, setDraggingUid] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<Column | null>(null);
    const [busyMoves, setBusyMoves] = useState<Set<string>>(new Set());

    const fetchLeads = useCallback(async (cid: string) => {
        const { data, error } = await supabase
            .from('leads_unified_active')
            .select('uid, table_name, native_id, name, phone, vehicle_interest, status, ai_score, atendimento_iniciado_em, ultima_interacao_humana, flagged_reversao')
            .eq('assigned_consultant_id', cid)
            .not('atendimento_iniciado_em', 'is', null)
            .order('atendimento_iniciado_em', { ascending: false })
            .limit(200);
        if (error) console.error('[Kanban] leads erro:', error.message);
        const list = (data as KanbanLead[]) || [];
        setLeads(list);
        return list;
    }, [supabase]);

    const fetchLastMessages = useCallback(async (list: KanbanLead[]) => {
        const ids = list.map(l => l.native_id).slice(0, 100);
        if (ids.length === 0) return;
        const numericIds = ids.filter(i => /^\d+$/.test(String(i))).map(i => parseInt(String(i), 10));
        const uuidIds = ids.filter(i => !/^\d+$/.test(String(i))).map(i => String(i));
        const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const qs: Promise<any>[] = [];
        if (numericIds.length > 0) {
            qs.push(supabase.from('whatsapp_messages')
                .select('lead_id, message_text, direction, created_at')
                .in('lead_id', numericIds)
                .gte('created_at', cutoff)
                .order('created_at', { ascending: false })
                .limit(200));
        }
        if (uuidIds.length > 0) {
            qs.push(supabase.from('whatsapp_messages')
                .select('lead_id, message_text, direction, created_at')
                .in('lead_id', uuidIds)
                .gte('created_at', cutoff)
                .order('created_at', { ascending: false })
                .limit(200));
        }
        const results = await Promise.allSettled(qs);
        const all: any[] = [];
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value.data) all.push(...r.value.data);
        }
        // Última msg por lead
        const map = new Map<string, LastMsg>();
        for (const m of all) {
            const key = String(m.lead_id);
            if (!map.has(key)) {
                map.set(key, { text: m.message_text || '', direction: m.direction || '', created_at: m.created_at });
            }
        }
        setLastMsgs(map);
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        const timeoutId = setTimeout(() => { if (alive) setLoading(false); }, 10000);
        (async () => {
            try {
                const { data: sess } = await supabase.auth.getSession();
                const auth = { user: sess?.session?.user || null };
                if (!auth?.user) { router.push('/login'); return; }
                const { data: cons } = await supabase
                    .from('consultants_manos_crm')
                    .select('id')
                    .or(`user_id.eq.${auth.user.id},auth_id.eq.${auth.user.id}`)
                    .maybeSingle();
                const cid = cons?.id || null;
                if (!alive) return;
                setConsultantId(cid);
                if (cid) {
                    const list = await fetchLeads(cid);
                    if (alive) setLoading(false);
                    // Mensagens em background
                    fetchLastMessages(list);
                } else if (alive) {
                    setLoading(false);
                }
            } catch (e) {
                console.error('[Kanban]', e);
            } finally {
                clearTimeout(timeoutId);
            }
        })();
        return () => { alive = false; clearTimeout(timeoutId); };
    }, [supabase, router, fetchLeads, fetchLastMessages]);

    // Realtime: atualiza quando alguém mexer (debounce 1.5s)
    useEffect(() => {
        if (!consultantId) return;
        const channel = supabase.channel('kanban-live');
        let t: ReturnType<typeof setTimeout> | null = null;
        const schedule = () => {
            if (t) clearTimeout(t);
            t = setTimeout(async () => {
                const list = await fetchLeads(consultantId);
                fetchLastMessages(list);
            }, 1500);
        };
        ['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26', 'whatsapp_messages'].forEach(tab => {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: tab }, schedule);
        });
        channel.subscribe();
        return () => { if (t) clearTimeout(t); supabase.removeChannel(channel); };
    }, [supabase, consultantId, fetchLeads, fetchLastMessages]);

    const moveLead = useCallback(async (lead: KanbanLead, targetCol: Column) => {
        if (columnFor(lead) === targetCol) return;
        const newStatus = STATUS_OF_COLUMN[targetCol];
        if (!newStatus) return;
        // Optimistic update
        setLeads(prev => prev.map(l => l.uid === lead.uid ? { ...l, status: newStatus, ultima_interacao_humana: new Date().toISOString() } : l));
        setBusyMoves(prev => { const s = new Set(prev); s.add(lead.uid); return s; });
        try {
            const realId: any = lead.table_name === 'leads_distribuicao_crm_26'
                ? parseInt(lead.native_id, 10)
                : lead.native_id;
            const updates: Record<string, any> = {
                status: newStatus,
                ultima_interacao_humana: new Date().toISOString(),
            };
            if (lead.table_name === 'leads_distribuicao_crm_26') {
                updates.atualizado_em = new Date().toISOString();
            } else {
                updates.updated_at = new Date().toISOString();
            }
            const { error } = await supabase.from(lead.table_name).update(updates).eq('id', realId);
            if (error) throw error;
        } catch (e: any) {
            alert('Erro ao mover: ' + (e?.message || 'tente novamente'));
            // Reverte
            if (consultantId) await fetchLeads(consultantId);
        } finally {
            setBusyMoves(prev => { const s = new Set(prev); s.delete(lead.uid); return s; });
        }
    }, [supabase, consultantId, fetchLeads]);

    const grouped = useMemo(() => {
        const map: Record<Column, KanbanLead[]> = { qualificacao: [], proposta: [], test_drive: [], fechamento: [] };
        for (const l of leads) map[columnFor(l)].push(l);
        return map;
    }, [leads]);

    // ── Drag handlers ──────────────────────────────────────────────────────
    const onDragStart = (e: DragEvent, lead: KanbanLead) => {
        e.dataTransfer.setData('text/plain', lead.uid);
        e.dataTransfer.effectAllowed = 'move';
        setDraggingUid(lead.uid);
    };
    const onDragEnd = () => { setDraggingUid(null); setDragOverCol(null); };
    const onDragOver = (e: DragEvent, col: Column) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCol !== col) setDragOverCol(col);
    };
    const onDragLeave = (col: Column) => {
        if (dragOverCol === col) setDragOverCol(null);
    };
    const onDrop = (e: DragEvent, col: Column) => {
        e.preventDefault();
        const uid = e.dataTransfer.getData('text/plain');
        const lead = leads.find(l => l.uid === uid);
        setDragOverCol(null);
        setDraggingUid(null);
        if (lead) moveLead(lead, col);
    };

    return (
        <div className="p-4 md:p-6 min-h-screen">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-2">
                        🎯 Atendimento — Kanban
                    </h1>
                    <p className="text-sm text-zinc-400 mt-1">
                        Arraste o card pra próxima etapa quando o lead avançar. Tempo, score e última msg em cada cartão.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-2xl font-black text-white">{leads.length}</div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">em atendimento</div>
                    </div>
                </div>
            </div>

            {loading ? (
                <p className="text-zinc-400">Carregando...</p>
            ) : leads.length === 0 ? (
                <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-10 text-center">
                    <p className="text-lg text-zinc-300">Você não tem leads em atendimento.</p>
                    <p className="text-sm text-zinc-500 mt-2">
                        Vá pro <Link href="/inbox" className="text-blue-400 underline font-semibold">Inbox</Link> e clique &quot;INICIAR ATENDIMENTO&quot; num lead pra começar.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {COLUMNS.map(col => {
                        const colLeads = grouped[col.key];
                        const isDragTarget = dragOverCol === col.key;
                        return (
                            <div
                                key={col.key}
                                onDragOver={e => onDragOver(e, col.key)}
                                onDragLeave={() => onDragLeave(col.key)}
                                onDrop={e => onDrop(e, col.key)}
                                className={`rounded-2xl border-2 bg-gradient-to-b ${col.gradient} ${col.border} flex flex-col min-h-[400px] transition ${
                                    isDragTarget ? 'ring-4 ring-white/30 scale-[1.01]' : ''
                                }`}
                            >
                                {/* Header coluna */}
                                <div className={`px-3 py-3 border-b ${col.border} flex items-center justify-between sticky top-0 z-10 bg-zinc-950/70 backdrop-blur rounded-t-2xl`}>
                                    <div>
                                        <h2 className={`text-sm font-black uppercase tracking-wide flex items-center gap-2 ${col.text}`}>
                                            <span className="text-lg">{col.emoji}</span> {col.label}
                                        </h2>
                                        <p className="text-[10px] text-zinc-500 mt-0.5">{col.desc}</p>
                                    </div>
                                    <span className={`text-xs font-black px-2 py-0.5 rounded-md ${col.badge}`}>{colLeads.length}</span>
                                </div>

                                {/* Cards */}
                                <div className="p-2 space-y-2 flex-1">
                                    {colLeads.length === 0 ? (
                                        <div className="text-[11px] text-zinc-600 italic px-3 py-8 text-center border border-dashed border-zinc-800 rounded-lg">
                                            Arraste leads pra cá quando avançarem.
                                        </div>
                                    ) : (
                                        colLeads.map(l => {
                                            const age = ageInfo(l.ultima_interacao_humana || l.atendimento_iniciado_em);
                                            const lastMsg = lastMsgs.get(l.native_id);
                                            const isDragging = draggingUid === l.uid;
                                            const isBusy = busyMoves.has(l.uid);
                                            return (
                                                <article
                                                    key={l.uid}
                                                    draggable={!isBusy}
                                                    onDragStart={e => onDragStart(e, l)}
                                                    onDragEnd={onDragEnd}
                                                    className={`group relative rounded-xl bg-zinc-900/90 border ${
                                                        age.alert ? 'border-red-700/60 ring-1 ring-red-500/20' :
                                                        age.stale ? 'border-orange-700/60' : 'border-zinc-800'
                                                    } p-3 cursor-grab active:cursor-grabbing transition-all hover:bg-zinc-800/90 hover:border-zinc-700 ${
                                                        isDragging ? 'opacity-40 rotate-2 scale-95' : ''
                                                    } ${isBusy ? 'pointer-events-none opacity-60' : ''} ${
                                                        l.flagged_reversao ? 'ring-1 ring-pink-500/40 border-pink-700/40' : ''
                                                    }`}
                                                >
                                                    {/* Handle drag */}
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition">
                                                        <GripVertical className="w-4 h-4 text-zinc-500" />
                                                    </div>

                                                    {/* Linha 1: nome + score */}
                                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                                        <h3 className="text-sm font-bold text-white truncate flex-1 flex items-center gap-1.5">
                                                            {l.flagged_reversao && <span title="Reversão" className="text-pink-400 text-base">🔥</span>}
                                                            {l.name || 'Sem nome'}
                                                        </h3>
                                                        {l.ai_score != null && (
                                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                                                                l.ai_score >= 80 ? 'bg-red-600 text-white' :
                                                                l.ai_score >= 50 ? 'bg-amber-700 text-amber-100' :
                                                                'bg-zinc-800 text-zinc-400'
                                                            }`}>
                                                                {l.ai_score}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Veículo */}
                                                    <p className="text-[11px] text-zinc-400 truncate mb-2">
                                                        🚗 {l.vehicle_interest || '—'}
                                                    </p>

                                                    {/* Última mensagem */}
                                                    {lastMsg && lastMsg.text && (
                                                        <div className="mb-2 p-2 rounded-md bg-zinc-950/60 border border-zinc-800/60">
                                                            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
                                                                <MessageCircle className="w-2.5 h-2.5" />
                                                                {lastMsg.direction === 'inbound' ? 'Cliente' : 'Você/IA'}
                                                            </div>
                                                            <p className="text-[11px] text-zinc-300 line-clamp-2 italic">
                                                                &quot;{lastMsg.text.slice(0, 100)}{lastMsg.text.length > 100 ? '…' : ''}&quot;
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Footer: idade + ações */}
                                                    <div className="flex items-center justify-between gap-2 mt-2">
                                                        <span className={`text-[10px] font-bold flex items-center gap-1 ${age.color}`}>
                                                            <Clock className="w-3 h-3" />
                                                            {age.text}
                                                            {age.alert && <AlertTriangle className="w-3 h-3" />}
                                                        </span>
                                                        <Link
                                                            href={`/lead/${encodeURIComponent(l.uid)}`}
                                                            onClick={e => e.stopPropagation()}
                                                            className="text-[10px] py-1 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded font-semibold transition"
                                                        >
                                                            Abrir →
                                                        </Link>
                                                    </div>
                                                </article>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Footer coluna — atalhos finalizar */}
                                {col.key === 'fechamento' && colLeads.length > 0 && (
                                    <div className="px-2 pb-3 pt-1 border-t border-emerald-900/30 flex gap-1">
                                        <button
                                            onClick={() => alert('Abra o lead pra registrar venda com valor + forma de pagamento')}
                                            className="flex-1 text-[10px] py-1.5 bg-emerald-700/50 hover:bg-emerald-600/60 text-emerald-100 rounded font-bold inline-flex items-center justify-center gap-1"
                                        >
                                            <Trophy className="w-3 h-3" /> Vendi
                                        </button>
                                        <button
                                            onClick={() => alert('Abra o lead pra registrar motivo da perda')}
                                            className="flex-1 text-[10px] py-1.5 bg-red-900/50 hover:bg-red-800/60 text-red-100 rounded font-bold inline-flex items-center justify-center gap-1"
                                        >
                                            <XIcon className="w-3 h-3" /> Perdi
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Helper de mobile */}
            <p className="text-[11px] text-zinc-500 italic mt-4 text-center md:hidden">
                💡 No celular, arraste o cartão segurando-o até a próxima coluna.
            </p>
        </div>
    );
}
