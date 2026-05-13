'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Clock, AlertTriangle, ChevronRight } from 'lucide-react';

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

// Mapeamento de status → coluna do Kanban
type Column = 'qualificacao' | 'proposta' | 'test_drive' | 'fechamento';

const COLUMN_MAP: Record<string, Column> = {
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

const COLUMNS: Array<{ key: Column; label: string; emoji: string; bgClass: string; borderClass: string; textClass: string }> = [
    { key: 'qualificacao', label: 'Qualificação', emoji: '🔍', bgClass: 'bg-blue-950/30',    borderClass: 'border-blue-700/40',    textClass: 'text-blue-300' },
    { key: 'proposta',     label: 'Proposta',     emoji: '💼', bgClass: 'bg-amber-950/30',   borderClass: 'border-amber-700/40',   textClass: 'text-amber-300' },
    { key: 'test_drive',   label: 'Test Drive',   emoji: '🚗', bgClass: 'bg-purple-950/30',  borderClass: 'border-purple-700/40',  textClass: 'text-purple-300' },
    { key: 'fechamento',   label: 'Fechamento',   emoji: '🏆', bgClass: 'bg-emerald-950/30', borderClass: 'border-emerald-700/40', textClass: 'text-emerald-300' },
];

const STATUS_NEXT: Record<Column, { label: string; newStatus: string }> = {
    qualificacao: { label: 'Mandar proposta →', newStatus: 'proposed' },
    proposta:     { label: 'Agendou test drive →', newStatus: 'scheduled' },
    test_drive:   { label: 'Em fechamento →', newStatus: 'fechamento' },
    fechamento:   { label: '', newStatus: '' },
};

function columnFor(lead: KanbanLead): Column {
    return COLUMN_MAP[String(lead.status || '').toLowerCase()] || 'qualificacao';
}

function ageInfo(iso: string | null | undefined): { text: string; color: string; stale: boolean } {
    if (!iso) return { text: '—', color: 'text-zinc-500', stale: false };
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    const stale = mins >= 60 * 8; // 8h+ = parado, cron já cobrou
    if (mins < 60) return { text: `${mins}min`, color: 'text-emerald-300', stale: false };
    const h = Math.floor(mins / 60);
    if (h < 8) return { text: `${h}h`, color: 'text-yellow-300', stale: false };
    if (h < 24) return { text: `${h}h ⏰`, color: 'text-orange-400', stale: true };
    return { text: `${Math.floor(h/24)}d 🚨`, color: 'text-red-400', stale: true };
}

export default function AtendimentoKanbanPage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [leads, setLeads] = useState<KanbanLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [consultantId, setConsultantId] = useState<string | null>(null);

    const fetchLeads = useCallback(async (cid: string) => {
        const { data, error } = await supabase
            .from('leads_unified_active')
            .select('uid, table_name, native_id, name, phone, vehicle_interest, status, ai_score, atendimento_iniciado_em, ultima_interacao_humana, flagged_reversao')
            .eq('assigned_consultant_id', cid)
            .not('atendimento_iniciado_em', 'is', null)
            .order('atendimento_iniciado_em', { ascending: true })
            .limit(200);

        if (error) console.error('[Atendimento] erro:', error.message);
        setLeads((data as KanbanLead[]) || []);
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        const timeoutId = setTimeout(() => { if (alive) setLoading(false); }, 10000);

        (async () => {
            try {
                const { data: auth } = await supabase.auth.getUser();
                if (!auth?.user) { router.push('/login'); return; }
                const { data: cons } = await supabase
                    .from('consultants_manos_crm')
                    .select('id')
                    .eq('user_id', auth.user.id)
                    .maybeSingle();
                const cid = cons?.id || null;
                if (!alive) return;
                setConsultantId(cid);
                if (cid) await fetchLeads(cid);
            } catch (e) {
                console.error('[Atendimento]', e);
            } finally {
                clearTimeout(timeoutId);
                if (alive) setLoading(false);
            }
        })();

        return () => { alive = false; clearTimeout(timeoutId); };
    }, [supabase, router, fetchLeads]);

    // Realtime: atualiza Kanban quando lead muda
    useEffect(() => {
        if (!consultantId) return;
        const channel = supabase.channel('atendimento-kanban');
        let timer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefetch = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fetchLeads(consultantId), 1500);
        };
        ['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26'].forEach(t => {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleRefetch);
        });
        channel.subscribe();
        return () => {
            if (timer) clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [supabase, consultantId, fetchLeads]);

    const moveStatus = async (lead: KanbanLead, newStatus: string) => {
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
            if (error) {
                alert('Erro: ' + error.message);
                return;
            }
            if (consultantId) await fetchLeads(consultantId);
        } catch (e: any) {
            alert('Erro: ' + (e?.message || 'tente novamente'));
        }
    };

    const grouped = useMemo(() => {
        const map: Record<Column, KanbanLead[]> = { qualificacao: [], proposta: [], test_drive: [], fechamento: [] };
        for (const l of leads) {
            const col = columnFor(l);
            map[col].push(l);
        }
        return map;
    }, [leads]);

    return (
        <div className="p-4 md:p-6">
            <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-2">
                        🎯 Atendimento — Kanban
                    </h1>
                    <p className="text-sm text-zinc-400 mt-1">
                        Leads que você assumiu, agrupados por etapa. Mova pra próxima etapa quando avançar.
                    </p>
                </div>
                <div className="text-xs text-zinc-500">
                    Total: <strong className="text-white">{leads.length}</strong>
                </div>
            </div>

            {loading ? (
                <p className="text-zinc-400">Carregando...</p>
            ) : leads.length === 0 ? (
                <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-8 text-center">
                    <p className="text-lg text-zinc-300">Você não tem leads em atendimento.</p>
                    <p className="text-sm text-zinc-500 mt-2">
                        Vá pro <Link href="/inbox" className="text-blue-400 underline">Inbox</Link> e clique &quot;INICIAR ATENDIMENTO&quot; num lead pra começar.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
                    {COLUMNS.map(col => {
                        const colLeads = grouped[col.key];
                        const next = STATUS_NEXT[col.key];
                        return (
                            <div key={col.key} className={`rounded-xl border-2 ${col.borderClass} ${col.bgClass} flex flex-col min-h-[200px]`}>
                                <div className="px-3 py-2 border-b border-zinc-800/40 flex items-center justify-between sticky top-0 z-10 bg-inherit rounded-t-xl">
                                    <h2 className={`text-sm font-black uppercase tracking-wide flex items-center gap-2 ${col.textClass}`}>
                                        <span>{col.emoji}</span> {col.label}
                                    </h2>
                                    <span className={`text-xs font-bold ${col.textClass}`}>{colLeads.length}</span>
                                </div>
                                <div className="p-2 space-y-2 flex-1">
                                    {colLeads.length === 0 ? (
                                        <p className="text-[11px] text-zinc-600 italic px-2 py-3 text-center">Nada nesta etapa.</p>
                                    ) : (
                                        colLeads.map(l => {
                                            const age = ageInfo(l.ultima_interacao_humana || l.atendimento_iniciado_em);
                                            return (
                                                <div key={l.uid}
                                                    className={`rounded-lg bg-zinc-900/80 border ${age.stale ? 'border-orange-700/60 ring-1 ring-orange-500/20' : 'border-zinc-800'} p-3 hover:bg-zinc-800/60 transition`}>
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <h3 className="text-sm font-bold text-white truncate flex-1 flex items-center gap-1.5">
                                                            {l.flagged_reversao && <span title="Reversão" className="text-pink-400">🔥</span>}
                                                            {l.name || 'Sem nome'}
                                                        </h3>
                                                        {l.ai_score != null && (
                                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${l.ai_score >= 80 ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                                                                {l.ai_score}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-zinc-400 truncate mb-2">{l.vehicle_interest || '—'}</p>

                                                    <div className="flex items-center justify-between text-[10px] mb-2">
                                                        <span className={`flex items-center gap-1 ${age.color}`}>
                                                            <Clock className="w-3 h-3" />
                                                            {age.text}
                                                        </span>
                                                        {age.stale && (
                                                            <span className="flex items-center gap-0.5 text-orange-400 font-bold">
                                                                <AlertTriangle className="w-3 h-3" /> parado
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-1.5">
                                                        <Link
                                                            href={`/lead/${encodeURIComponent(l.uid)}`}
                                                            className="flex-1 text-center text-[11px] py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-semibold"
                                                        >
                                                            Abrir
                                                        </Link>
                                                        {next.newStatus && (
                                                            <button
                                                                onClick={() => moveStatus(l, next.newStatus)}
                                                                className={`text-[11px] py-1.5 px-2 ${col.bgClass} hover:opacity-80 ${col.textClass} border ${col.borderClass} rounded font-bold inline-flex items-center gap-0.5`}
                                                                title={next.label}
                                                            >
                                                                <ChevronRight className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
