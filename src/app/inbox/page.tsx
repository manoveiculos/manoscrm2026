'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Flame, Snowflake, Thermometer, Clock, Phone, Wifi, Bell, X, AlertTriangle, MessageCircle } from 'lucide-react';

/**
 * /inbox — A ÚNICA tela do vendedor.
 *
 * 3 seções por urgência:
 *   🔥 Atender agora     — criados <4h ou score ≥80 ou SLA estourando
 *   🌡️ Em conversa       — 4h–48h ou score 40-79
 *   ❄️ Esfriando          — >48h sem resposta (vai pra reatribuição)
 *
 * Auto-esconde leads >14d sem atividade (filtro "Tudo" pra ver).
 * Realtime + toast + tab title flash mantidos.
 */

interface InboxLead {
    uid: string;
    table_name: string;
    native_id: string;
    name: string | null;
    phone: string | null;
    vehicle_interest: string | null;
    source: string | null;
    ai_score: number | null;
    ai_classification: string | null;
    status: string | null;
    updated_at: string | null;
    created_at: string;
    proxima_acao: string | null;
}

interface LastMessage {
    lead_id: string;
    message_text: string | null;
    direction: string | null;
}

type Filter = 'priority' | 'today' | 'all';
type Bucket = 'urgent' | 'active' | 'cooling' | 'zombie';

const ZOMBIE_DAYS = 15;
const URGENT_MINUTES = 30;     // novos OU com nova interação <30min
const ACTIVE_HOURS = 48;       // em negociação até 48h
const URGENT_SCORE = 80;       // score alto sempre é urgente
const ACTIVE_SCORE = 40;

function ageMinutes(updatedAt: string | null, createdAt: string): number {
    return (Date.now() - new Date(updatedAt || createdAt).getTime()) / 60000;
}

function bucketFor(lead: InboxLead): Bucket {
    const min = ageMinutes(lead.updated_at, lead.created_at);
    if (min > ZOMBIE_DAYS * 24 * 60) return 'zombie';
    const score = lead.ai_score ?? 0;
    // Urgente: <30min (novo OU lead que acabou de receber msg = boia) OU score alto
    if (min < URGENT_MINUTES || score >= URGENT_SCORE) return 'urgent';
    // Em negociação: até 48h
    if (min < ACTIVE_HOURS * 60 || score >= ACTIVE_SCORE) return 'active';
    return 'cooling';
}

/** Badge de SLA: tempo restante até estourar (em min) */
function slaInfo(lead: InboxLead): { text: string; color: string } {
    const min = ageMinutes(lead.updated_at, lead.created_at);
    if (lead.status === 'novo' || lead.status === 'received') {
        // SLA inicial: 5min push, 15min modal, 30min reassign
        if (min < 5) return { text: 'novo · responder em 5min', color: 'bg-emerald-700 text-emerald-50' };
        if (min < 15) return { text: `${Math.ceil(15 - min)}min p/ modal`, color: 'bg-amber-700 text-amber-50' };
        if (min < 30) return { text: `${Math.ceil(30 - min)}min p/ perder`, color: 'bg-red-700 text-red-50' };
        return { text: `SLA estourou ${Math.floor(min - 30)}min`, color: 'bg-red-900 text-red-200' };
    }
    if (min < 60) return { text: 'recém-tocado', color: 'bg-emerald-800 text-emerald-100' };
    if (min < 60 * 24) return { text: `${Math.floor(min / 60)}h sem ação`, color: 'bg-zinc-700 text-zinc-200' };
    const days = Math.floor(min / 60 / 24);
    if (days < 7) return { text: `${days}d sem ação`, color: 'bg-amber-800 text-amber-100' };
    return { text: `${days}d esfriando`, color: 'bg-red-800 text-red-100' };
}

function tempIcon(c: string | null) {
    if (c === 'hot') return <Flame className="w-4 h-4 text-red-500" aria-label="quente" />;
    if (c === 'warm') return <Thermometer className="w-4 h-4 text-orange-400" aria-label="morno" />;
    return <Snowflake className="w-4 h-4 text-blue-400" aria-label="frio" />;
}

function formatPhone(p: string | null): string {
    if (!p) return '';
    const d = p.replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) {
        return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    }
    if (d.length === 11) {
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    return p;
}

export default function InboxPage() {
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();
    const [leads, setLeads] = useState<InboxLead[]>([]);
    const [lastMsgByLead, setLastMsgByLead] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('priority');
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [live, setLive] = useState(false);
    const [toasts, setToasts] = useState<Array<{ uid: string; name: string | null; vehicle: string | null }>>([]);
    const knownIdsRef = useRef<Set<string>>(new Set());
    const initialLoadDoneRef = useRef(false);
    const baseTitleRef = useRef<string>('Inbox');
    const unreadRef = useRef(0);

    const fetchLeads = useCallback(async (cid: string | null) => {
        const query = supabase
            .from('leads_unified_active')
            .select('uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, updated_at, created_at, proxima_acao')
            .order('ai_score', { ascending: false, nullsFirst: false })
            .limit(200);
        if (cid) query.eq('assigned_consultant_id', cid);
        const { data } = await query;
        const next = (data as InboxLead[]) || [];

        // Detecta novos
        if (initialLoadDoneRef.current) {
            const novel = next.filter(l => !knownIdsRef.current.has(l.uid));
            if (novel.length > 0) {
                setToasts(prev => [
                    ...prev,
                    ...novel.slice(0, 5).map(l => ({ uid: l.uid, name: l.name, vehicle: l.vehicle_interest })),
                ]);
                if (typeof document !== 'undefined' && document.hidden) {
                    unreadRef.current += novel.length;
                }
            }
        }
        knownIdsRef.current = new Set(next.map(l => l.uid));
        initialLoadDoneRef.current = true;
        setLeads(next);

        // Busca última mensagem dos leads SEM vehicle_interest pra preencher o card
        const idsSemVeiculo = next.filter(l => !l.vehicle_interest).map(l => l.native_id).slice(0, 60);
        if (idsSemVeiculo.length > 0) {
            const { data: msgs } = await supabase
                .from('whatsapp_messages')
                .select('lead_id, message_text, direction, created_at')
                .in('lead_id', idsSemVeiculo)
                .order('created_at', { ascending: false })
                .limit(200);
            const map = new Map<string, string>();
            for (const m of (msgs as LastMessage[]) || []) {
                if (!map.has(m.lead_id) && m.message_text) {
                    map.set(m.lead_id, m.message_text);
                }
            }
            setLastMsgByLead(map);
        } else {
            setLastMsgByLead(new Map());
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        (async () => {
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
            await fetchLeads(cid);
            if (alive) setLoading(false);
        })();
        return () => { alive = false; };
    }, [supabase, router, fetchLeads]);

    // Tab title flasher
    useEffect(() => {
        if (typeof document === 'undefined') return;
        baseTitleRef.current = document.title || 'Inbox';
        let toggle = false;
        const interval = setInterval(() => {
            if (document.hidden && unreadRef.current > 0) {
                toggle = !toggle;
                document.title = toggle ? `🔥 (${unreadRef.current}) Lead novo!` : baseTitleRef.current;
            } else {
                document.title = baseTitleRef.current;
            }
        }, 1000);
        const onVisible = () => {
            if (!document.hidden) {
                unreadRef.current = 0;
                document.title = baseTitleRef.current;
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            document.title = baseTitleRef.current;
        };
    }, []);

    // Realtime
    useEffect(() => {
        const tables = ['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26'];
        const channel = supabase.channel('inbox-live');
        for (const t of tables) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: t },
                () => { fetchLeads(consultantId); });
        }
        channel.subscribe(status => { setLive(status === 'SUBSCRIBED'); });
        return () => { supabase.removeChannel(channel); };
    }, [supabase, consultantId, fetchLeads]);

    // Buckets + filtros
    const grouped = useMemo(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const buckets: Record<Bucket, InboxLead[]> = { urgent: [], active: [], cooling: [], zombie: [] };
        for (const lead of leads) {
            const b = bucketFor(lead);
            buckets[b].push(lead);
        }

        if (filter === 'today') {
            const all = leads.filter(l => new Date(l.created_at).getTime() >= todayStart.getTime() && bucketFor(l) !== 'zombie');
            return { urgent: all.filter(l => bucketFor(l) === 'urgent'), active: all.filter(l => bucketFor(l) === 'active'), cooling: all.filter(l => bucketFor(l) === 'cooling'), zombie: [] };
        }
        if (filter === 'all') {
            return buckets;
        }
        // priority: oculta zombies por padrão
        return { ...buckets, zombie: [] };
    }, [leads, filter]);

    const counts = {
        urgent: grouped.urgent.length,
        active: grouped.active.length,
        cooling: grouped.cooling.length,
        zombie: grouped.zombie.length,
    };

    function dismissToast(uid: string) {
        setToasts(prev => prev.filter(t => t.uid !== uid));
    }

    return (
        <div className="p-4 max-w-5xl mx-auto pb-32">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">Inbox</h1>
                    <span className={`text-xs flex items-center gap-1 ${live ? 'text-green-400' : 'text-gray-500'}`}>
                        <Wifi className="w-3 h-3" /> {live ? 'ao vivo' : 'offline'}
                    </span>
                </div>
                <div className="flex gap-2 text-sm">
                    {([
                        ['priority', 'Prioridade'],
                        ['today', 'Hoje'],
                        ['all', 'Tudo'],
                    ] as Array<[Filter, string]>).map(([f, label]) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1 rounded-full border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'border-zinc-700 text-gray-300 hover:bg-zinc-800'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* CONTADORES */}
            <div className="flex items-center gap-3 mb-5 text-xs text-gray-400">
                <span>🔥 <strong className="text-red-400">{counts.urgent}</strong> urgentes</span>
                <span>🌡️ <strong className="text-orange-300">{counts.active}</strong> em conversa</span>
                <span>❄️ <strong className="text-blue-300">{counts.cooling}</strong> esfriando</span>
                {filter === 'all' && counts.zombie > 0 && (
                    <span>🪦 <strong className="text-zinc-500">{counts.zombie}</strong> zumbis (mais de {ZOMBIE_DAYS}d)</span>
                )}
            </div>

            {loading ? (
                <p className="text-gray-400">Carregando…</p>
            ) : counts.urgent + counts.active + counts.cooling + counts.zombie === 0 ? (
                <div className="text-gray-400 text-center py-12">
                    <p className="text-lg">Nada na fila.</p>
                    <p className="text-sm mt-1">Boa hora pra prospectar.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <Section title="Urgente" subtitle="Novos ou com nova mensagem · responda agora" icon={<Flame className="w-4 h-4 text-red-500" />} accent="border-red-700"
                        leads={grouped.urgent} lastMsgByLead={lastMsgByLead} emptyText="Nenhum lead urgente. Bom trabalho." />
                    <Section title="Em negociação" subtitle="Conversa ativa · mantenha o ritmo" icon={<Thermometer className="w-4 h-4 text-orange-400" />} accent="border-orange-700"
                        leads={grouped.active} lastMsgByLead={lastMsgByLead} emptyText="Nenhum em negociação no momento." />
                    <Section title="Aguardando" subtitle="Sem resposta há 48h+ · reaqueça antes de perder" icon={<Snowflake className="w-4 h-4 text-blue-400" />} accent="border-blue-900"
                        leads={grouped.cooling} lastMsgByLead={lastMsgByLead} emptyText="Nenhum lead aguardando." />
                    {filter === 'all' && grouped.zombie.length > 0 && (
                        <Section title="Zumbis" subtitle={`Mais de ${ZOMBIE_DAYS}d sem atividade · serão fechados pelo SLA`} icon={<AlertTriangle className="w-4 h-4 text-zinc-500" />} accent="border-zinc-800 opacity-60"
                            leads={grouped.zombie} lastMsgByLead={lastMsgByLead} emptyText="" />
                    )}
                </div>
            )}

            {/* TOASTS */}
            {toasts.length > 0 && (
                <div className="fixed bottom-4 right-4 z-[9000] space-y-2 max-w-sm w-full pointer-events-none">
                    {toasts.map(t => (
                        <div key={t.uid} className="pointer-events-auto bg-emerald-700 border border-emerald-500 rounded-lg shadow-2xl p-3 flex items-start gap-2 animate-in slide-in-from-right">
                            <Bell className="w-5 h-5 text-emerald-100 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-white truncate">Lead novo: {t.name || 'Sem nome'}</div>
                                {t.vehicle && <div className="text-xs text-emerald-100 truncate">{t.vehicle}</div>}
                                <Link href={`/lead/${encodeURIComponent(t.uid)}`} onClick={() => dismissToast(t.uid)}
                                    className="text-xs underline text-emerald-50 mt-1 inline-block">Abrir agora →</Link>
                            </div>
                            <button onClick={() => dismissToast(t.uid)} className="text-emerald-100 hover:text-white" aria-label="Fechar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface SectionProps {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accent: string;
    leads: InboxLead[];
    lastMsgByLead: Map<string, string>;
    emptyText: string;
}

function Section({ title, subtitle, icon, accent, leads, lastMsgByLead, emptyText }: SectionProps) {
    return (
        <section>
            <div className={`flex items-center gap-2 mb-2 pl-2 border-l-4 ${accent}`}>
                {icon}
                <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wide">{title} · {leads.length}</h2>
                    <p className="text-[11px] text-gray-500">{subtitle}</p>
                </div>
            </div>
            {leads.length === 0 ? (
                emptyText && <p className="text-xs text-gray-600 italic pl-3 mb-2">{emptyText}</p>
            ) : (
                <ul className="space-y-2">
                    {leads.map(lead => <LeadCard key={lead.uid} lead={lead} lastMsg={lastMsgByLead.get(lead.native_id)} />)}
                </ul>
            )}
        </section>
    );
}

function LeadCard({ lead, lastMsg }: { lead: InboxLead; lastMsg?: string }) {
    const sla = slaInfo(lead);
    const subline = lead.vehicle_interest
        || (lastMsg ? `"${lastMsg.slice(0, 80)}${lastMsg.length > 80 ? '…' : ''}"` : '')
        || lead.source
        || 'Sem detalhes';
    const isQuoted = !lead.vehicle_interest && !!lastMsg;

    return (
        <li>
            <Link href={`/lead/${encodeURIComponent(lead.uid)}`}
                className="block bg-zinc-900 hover:bg-zinc-800 rounded-lg p-3 transition group">
                <div className="flex items-start justify-between gap-3">
                    {/* esquerda: nome + dados */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                            {tempIcon(lead.ai_classification)}
                            <h3 className="font-bold text-white truncate text-base">{lead.name || 'Sem nome'}</h3>
                            {lead.ai_score != null && lead.ai_score > 0 && (
                                <span className="text-[10px] text-gray-500">{lead.ai_score}</span>
                            )}
                        </div>
                        <div className={`text-xs truncate ${isQuoted ? 'text-gray-400 italic' : 'text-gray-300'}`}>
                            {isQuoted && <MessageCircle className="inline w-3 h-3 mr-1" />}
                            {subline}
                        </div>
                        {lead.proxima_acao && (
                            <div className="mt-1.5 text-[11px] text-blue-300/80 truncate">
                                💡 {lead.proxima_acao}
                            </div>
                        )}
                    </div>
                    {/* direita: SLA + telefone */}
                    <div className="flex flex-col items-end gap-1 shrink-0 text-[11px]">
                        <span className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${sla.color}`}>
                            {sla.text}
                        </span>
                        {lead.phone && (
                            <span className="text-gray-500 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {formatPhone(lead.phone)}
                            </span>
                        )}
                    </div>
                </div>
            </Link>
        </li>
    );
}
