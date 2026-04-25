'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Flame, Snowflake, Thermometer, Clock, Phone, Wifi, Bell, X } from 'lucide-react';

/**
 * /inbox — A ÚNICA tela do vendedor.
 *
 * Lista os leads atribuídos a ele, ordenados por prioridade IA.
 * Cor do SLA: verde <5min, amarelo <30min, vermelho >30min.
 * Click → /lead/:id (ação de venda).
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

type Filter = 'all' | 'today' | 'urgent';

function tempIcon(c: string | null) {
    if (c === 'hot') return <Flame className="w-4 h-4 text-red-500" />;
    if (c === 'warm') return <Thermometer className="w-4 h-4 text-orange-400" />;
    return <Snowflake className="w-4 h-4 text-blue-400" />;
}

function slaColor(updatedAt: string | null, createdAt: string) {
    const ref = new Date(updatedAt || createdAt).getTime();
    const minutes = (Date.now() - ref) / 60000;
    if (minutes < 5) return 'border-green-500';
    if (minutes < 30) return 'border-yellow-500';
    return 'border-red-500';
}

function timeAgo(iso: string | null): string {
    if (!iso) return '—';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

export default function InboxPage() {
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();
    const [leads, setLeads] = useState<InboxLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('all');
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

        // Detecta leads novos (não existiam no carregamento anterior).
        // Pula a 1ª execução pra não disparar toast pra fila pré-existente.
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
    }, [supabase]);

    useEffect(() => {
        let alive = true;

        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth?.user) {
                router.push('/login');
                return;
            }
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

    // Tab title flasher: pisca enquanto a aba estiver oculta e houver leads novos.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        baseTitleRef.current = document.title || 'Inbox';
        let toggle = false;
        const interval = setInterval(() => {
            if (document.hidden && unreadRef.current > 0) {
                toggle = !toggle;
                document.title = toggle
                    ? `🔥 (${unreadRef.current}) Lead novo!`
                    : baseTitleRef.current;
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

    // Realtime: novo lead em qualquer das 3 tabelas → recarrega.
    // Pode ser otimizado depois pra inserir incrementalmente, mas reload
    // mantém a ordenação por ai_score consistente sem reimplementar lógica.
    useEffect(() => {
        const tables = ['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26'];
        const channel = supabase.channel('inbox-live');

        for (const t of tables) {
            channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table: t },
                () => { fetchLeads(consultantId); }
            );
        }

        channel.subscribe(status => {
            setLive(status === 'SUBSCRIBED');
        });

        return () => { supabase.removeChannel(channel); };
    }, [supabase, consultantId, fetchLeads]);

    const visible = useMemo(() => {
        if (filter === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            return leads.filter(l => new Date(l.created_at).getTime() >= todayStart.getTime());
        }
        if (filter === 'urgent') {
            return leads.filter(l => {
                const ref = new Date(l.updated_at || l.created_at).getTime();
                const m = (Date.now() - ref) / 60000;
                return m > 15 || (l.ai_score || 0) >= 70;
            });
        }
        return leads;
    }, [leads, filter]);

    function dismissToast(uid: string) {
        setToasts(prev => prev.filter(t => t.uid !== uid));
    }

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">Inbox de Vendas</h1>
                    <span className={`text-xs flex items-center gap-1 ${live ? 'text-green-400' : 'text-gray-500'}`}>
                        <Wifi className="w-3 h-3" /> {live ? 'ao vivo' : 'offline'}
                    </span>
                </div>
                <div className="flex gap-2 text-sm">
                    {(['all', 'today', 'urgent'] as Filter[]).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1 rounded-full border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-600 text-gray-300'}`}
                        >
                            {f === 'all' ? 'Todos' : f === 'today' ? 'Hoje' : 'Urgentes'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <p className="text-gray-400">Carregando…</p>
            ) : visible.length === 0 ? (
                <div className="text-gray-400 text-center py-12">
                    Nada na fila. Boa hora pra prospectar.
                </div>
            ) : (
                <ul className="space-y-2">
                    {visible.map(lead => (
                        <li key={lead.uid}>
                            <Link
                                href={`/lead/${encodeURIComponent(lead.uid)}`}
                                className={`block bg-zinc-900 hover:bg-zinc-800 rounded-lg p-3 border-l-4 ${slaColor(lead.updated_at, lead.created_at)} transition`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {tempIcon(lead.ai_classification)}
                                        <div className="min-w-0">
                                            <div className="font-semibold truncate text-white">
                                                {lead.name || 'Sem nome'}
                                                <span className="ml-2 text-xs text-gray-400">score {lead.ai_score ?? 0}</span>
                                            </div>
                                            <div className="text-xs text-gray-400 truncate">
                                                {lead.vehicle_interest || '—'} {lead.source ? `· ${lead.source}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
                                        {lead.phone && (
                                            <span className="flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {lead.phone}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {timeAgo(lead.updated_at || lead.created_at)}
                                        </span>
                                    </div>
                                </div>
                                {lead.proxima_acao && (
                                    <div className="mt-2 text-xs text-gray-300 italic line-clamp-1">
                                        💡 {lead.proxima_acao}
                                    </div>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {toasts.length > 0 && (
                <div className="fixed bottom-4 right-4 z-[9000] space-y-2 max-w-sm w-full pointer-events-none">
                    {toasts.map(t => (
                        <div
                            key={t.uid}
                            className="pointer-events-auto bg-emerald-700 border border-emerald-500 rounded-lg shadow-2xl p-3 flex items-start gap-2 animate-in slide-in-from-right"
                        >
                            <Bell className="w-5 h-5 text-emerald-100 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-white truncate">
                                    Lead novo: {t.name || 'Sem nome'}
                                </div>
                                {t.vehicle && (
                                    <div className="text-xs text-emerald-100 truncate">{t.vehicle}</div>
                                )}
                                <Link
                                    href={`/lead/${encodeURIComponent(t.uid)}`}
                                    onClick={() => dismissToast(t.uid)}
                                    className="text-xs underline text-emerald-50 mt-1 inline-block"
                                >
                                    Abrir agora →
                                </Link>
                            </div>
                            <button
                                onClick={() => dismissToast(t.uid)}
                                className="text-emerald-100 hover:text-white"
                                aria-label="Fechar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
