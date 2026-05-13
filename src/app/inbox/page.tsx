'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { parseUid } from '@/lib/services/unifiedLead';
import { Flame, Snowflake, Thermometer, Clock, Phone, Wifi, Bell, X, AlertTriangle, MessageCircle } from 'lucide-react';

const PTR = dynamic(() => import('react-pull-to-refresh'), { ssr: false }) as any;

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
    first_contact_channel?: string | null;
    onboarded_at?: string | null;
    assigned_consultant_id?: string | null;
    atendimento_iniciado_em?: string | null;
    atendimento_iniciado_por?: string | null;
    flagged_reversao?: boolean | null;
}

interface LastMessage {
    lead_id: string;
    message_text: string | null;
    direction: string | null;
    created_at: string;
}

type Filter = 'priority' | 'today' | 'all' | 'archived';
type Bucket = 'reversao' | 'urgent' | 'active' | 'cooling' | 'zombie';

const ZOMBIE_DAYS = 15;
const URGENT_MINUTES = 30;     // novos OU com nova interação <30min
const ACTIVE_HOURS = 48;       // em negociação até 48h
const URGENT_SCORE = 80;       // score alto sempre é urgente
const ACTIVE_SCORE = 40;

function ageMinutes(updatedAt: string | null, createdAt: string): number {
    return (Date.now() - new Date(updatedAt || createdAt).getTime()) / 60000;
}

function bucketFor(lead: InboxLead): Bucket {
    // 🔥 REVERSÃO BEM-SUCEDIDA tem prioridade máxima: cliente perdido respondeu
    // msg da IA. Vendedor precisa abrir AGORA. Some quando vendedor inicia
    // atendimento ou marca como vendido/perdido novamente.
    if (lead.flagged_reversao) return 'reversao';
    const min = ageMinutes(lead.updated_at, lead.created_at);
    if (min > ZOMBIE_DAYS * 24 * 60) return 'zombie';
    const score = lead.ai_score ?? 0;
    if (min < URGENT_MINUTES || score >= URGENT_SCORE) return 'urgent';
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

type LeadState = 'AGUARDANDO_VENDEDOR' | 'AGUARDANDO_CLIENTE' | 'IA_TOCOU' | 'NUNCA_TOCADO';

function getLeadState(lead: InboxLead, lastInbound?: LastMessage, lastOutbound?: LastMessage): LeadState {
    if (!lastInbound && !lastOutbound) return 'NUNCA_TOCADO';
    if (!lastInbound && lastOutbound) {
        return lead.first_contact_channel === 'ai_sdr' ? 'IA_TOCOU' : 'AGUARDANDO_CLIENTE';
    }
    if (lastInbound && !lastOutbound) return 'AGUARDANDO_VENDEDOR';
    
    if (new Date(lastInbound!.created_at) > new Date(lastOutbound!.created_at)) {
        return 'AGUARDANDO_VENDEDOR';
    }
    return 'AGUARDANDO_CLIENTE';
}

function stateLabel(state: LeadState, lastReturn?: string): string {
    switch (state) {
        case 'IA_TOCOU': return '🤖 IA já respondeu — aguardando cliente';
        case 'AGUARDANDO_VENDEDOR': return '🔥 CLIENTE ESPERANDO — responda agora';
        case 'AGUARDANDO_CLIENTE': 
            if (lastReturn) return `📅 Você marcou retorno pra ${lastReturn}`;
            return '⏳ Sem resposta há algum tempo';
        case 'NUNCA_TOCADO': return '🆕 Novo lead — ninguém atendeu ainda';
        default: return '';
    }
}


export default function InboxPage() {
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();
    const [leads, setLeads] = useState<InboxLead[]>([]);
    const [lastMessages, setLastMessages] = useState<Map<string, { inbound?: LastMessage, outbound?: LastMessage }>>(new Map());
    const [soundEnabled, setSoundEnabled] = useState(false);
    const [onboarded, setOnboarded] = useState(true);
    const [expandedUid, setExpandedUid] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('priority');
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    const [consultantsMap, setConsultantsMap] = useState<Map<string, string>>(new Map());
    const [live, setLive] = useState(false);
    const [toasts, setToasts] = useState<Array<{ uid: string; name: string | null; vehicle: string | null }>>([]);
    const knownIdsRef = useRef<Set<string>>(new Set());
    const initialLoadDoneRef = useRef(false);
    // Timestamp da PRIMEIRA carga. Som só dispara pra leads com created_at >
    // este timestamp — evita falsos positivos ao trocar de filtro/aba.
    const firstLoadAtRef = useRef<number>(Date.now());
    const baseTitleRef = useRef<string>('Inbox');
    const unreadRef = useRef(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setSoundEnabled(localStorage.getItem('inbox_sound') === 'true');
            audioRef.current = new Audio('/sounds/ding.mp3');
        }
    }, []);

    const fetchLeads = useCallback(async (cid: string | null, viewMode: 'active' | 'archived' = 'active', adminMode: boolean = false) => {
        const sourceView = viewMode === 'archived' ? 'leads_unified' : 'leads_unified_active';

        // ADMIN: vê todos os leads (visão completa do dia, gestão).
        // VENDEDOR: vê estritamente os seus. Sem cid = vazio.
        if (!cid && !adminMode && viewMode === 'active') {
            setLeads([]);
            setLastMessages(new Map());
            return;
        }

        const query = supabase
            .from(sourceView)
            .select('uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, updated_at, created_at, proxima_acao, first_contact_channel, assigned_consultant_id, atendimento_iniciado_em, atendimento_iniciado_por, flagged_reversao' + (viewMode === 'archived' ? ', archived_at' : ''))
            .limit(adminMode ? 500 : 200);

        // Filtra pelo consultor (Inbox individual). Admin NÃO filtra.
        if (cid && !adminMode) query.eq('assigned_consultant_id', cid);

        if (filter === 'today' && viewMode === 'active') {
            // Hoje = NOVOS leads de hoje, sem atendimento iniciado
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            query.gte('created_at', todayStart.toISOString())
                 .is('atendimento_iniciado_em', null);
            query.order('created_at', { ascending: false });
        } else if (filter === 'priority' && viewMode === 'active') {
            // Foco = leads SEM atendimento iniciado (entrada) + leads de reversão
            // que cliente respondeu (flagged_reversao=true vai pro topo no JS)
            query.order('ai_score', { ascending: false, nullsFirst: false });
        } else if (filter === 'all' && viewMode === 'active') {
            query.order('updated_at', { ascending: false, nullsFirst: false });
        } else {
            query.order('updated_at', { ascending: false, nullsFirst: false });
        }

        if (viewMode === 'archived') query.not('archived_at', 'is', null);

        const { data: rawData, error: leadsErr } = await query;
        if (leadsErr) {
            console.error('[Inbox] fetchLeads erro:', leadsErr.message, leadsErr.details);
        }

        // BLOQUEIO CROSS-VENDOR: leads que OUTRO vendedor já iniciou atendimento
        // somem do meu Inbox imediatamente. Lead em reversão respondida
        // (flagged_reversao=true) tem prioridade — ignora esse filtro.
        // Admin vê TUDO (sem bloqueio).
        const data = adminMode ? (rawData || []) : (rawData || []).filter((l: any) => {
            if (l.flagged_reversao) return true;
            if (!l.atendimento_iniciado_em || !l.atendimento_iniciado_por) return true;
            return l.atendimento_iniciado_por === cid;
        });
        const next = (data as InboxLead[]) || [];

        // PERFORMANCE: renderiza a lista de leads IMEDIATAMENTE.
        // As mensagens (preview do card) carregam em background depois,
        // sem bloquear o Inbox. Vendedor vê os cards em <500ms.
        knownIdsRef.current = new Set(next.map(l => l.uid));
        if (!initialLoadDoneRef.current) {
            firstLoadAtRef.current = Date.now();
        }
        initialLoadDoneRef.current = true;
        setLeads(next);

        // ── Carregar mensagens em background (não bloqueia render) ──────────
        const leadIds = next.map(l => l.native_id).slice(0, 100);
        if (leadIds.length > 0) {
            const cutoff30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
            const numericIds = leadIds.filter(id => /^\d+$/.test(String(id))).map(id => parseInt(String(id), 10));
            const uuidIds = leadIds.filter(id => !/^\d+$/.test(String(id))).map(id => String(id));
            const queries: Promise<any>[] = [];

            if (numericIds.length > 0) {
                queries.push(
                    supabase.from('whatsapp_messages')
                        .select('lead_id, message_text, direction, created_at')
                        .in('lead_id', numericIds)
                        .gte('created_at', cutoff30d)
                        .order('created_at', { ascending: false })
                        .limit(200)
                );
            }
            if (uuidIds.length > 0) {
                queries.push(
                    supabase.from('whatsapp_messages')
                        .select('lead_id, message_text, direction, created_at')
                        .in('lead_id', uuidIds)
                        .gte('created_at', cutoff30d)
                        .order('created_at', { ascending: false })
                        .limit(200)
                );
            }

            // Fire-and-forget: atualiza msgMap depois sem await
            Promise.allSettled(queries).then(results => {
                const allMsgs: any[] = [];
                for (const r of results) {
                    if (r.status === 'fulfilled') {
                        if (r.value.error) console.warn('[Inbox] msg fetch erro:', r.value.error.message);
                        if (r.value.data) allMsgs.push(...r.value.data);
                    }
                }
                const msgMap = new Map<string, { inbound?: LastMessage, outbound?: LastMessage }>();
                for (const m of allMsgs as LastMessage[]) {
                    const leadKey = String(m.lead_id);
                    const current = msgMap.get(leadKey) || {};
                    if (m.direction === 'inbound' && !current.inbound) current.inbound = m;
                    if (m.direction === 'outbound' && !current.outbound) current.outbound = m;
                    msgMap.set(leadKey, current);
                }
                setLastMessages(msgMap);
            });
        }
        // ────────────────────────────────────────────────────────────────────

        // Som + toast pra leads criados APÓS a primeira carga.
        // Trocar de filtro não dispara (timestamp é absoluto).
        const cutoff = firstLoadAtRef.current;
        const truelyNew = next.filter(l => {
            const ts = new Date(l.created_at).getTime();
            return ts > cutoff;
        });
        if (truelyNew.length > 0) {
            if (soundEnabled) audioRef.current?.play().catch(() => {});
            setToasts(prev => [
                ...prev,
                ...truelyNew.slice(0, 5).map(l => ({ uid: l.uid, name: l.name, vehicle: l.vehicle_interest })),
            ]);
            if (typeof document !== 'undefined' && document.hidden) {
                unreadRef.current += truelyNew.length;
            }
        }
    }, [supabase, soundEnabled, filter, isAdmin]);

    const handleArchive = async (uid: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const parsed = parseUid(uid);
        if (!parsed) return;

        const ok = confirm('Arquivar este lead?');
        if (!ok) return;

        try {
            const res = await fetch('/api/lead/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: parsed.nativeId,
                    lead_table: parsed.table,
                    archive: true,
                    reason: 'arquivado pelo inbox',
                    archived_by: consultantId
                }),
            });
            if (res.ok) {
                fetchLeads(consultantId, filter === 'archived' ? 'archived' : 'active', isAdmin);
            } else {
                const err = await res.json();
                alert('Erro ao arquivar: ' + err.error);
            }
        } catch (err) {
            console.error('Erro ao arquivar lead:', err);
        }
    };

    useEffect(() => {
        let alive = true;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        // Safety net: força fim do loading em 10s independentemente do que aconteça.
        // Sem isso, qualquer await travado deixa "Carregando..." pra sempre.
        timeoutId = setTimeout(() => {
            if (alive) {
                console.warn('[Inbox] Timeout de 10s no carregamento. Forçando exibição.');
                setLoading(false);
            }
        }, 10000);

        (async () => {
            try {
                const { data: auth, error: authErr } = await supabase.auth.getUser();
                if (authErr) console.error('[Inbox] auth error:', authErr.message);
                if (!auth?.user) { router.push('/login'); return; }

                const { data: cons, error: consErr } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, onboarded_at, role')
                    .or(`user_id.eq.${auth.user.id},auth_id.eq.${auth.user.id}`)
                    .maybeSingle();
                if (consErr) console.error('[Inbox] consultant lookup error:', consErr.message);

                const cid = cons?.id || null;
                const consRole = (cons as any)?.role || '';
                const adminFlag = consRole === 'admin' || auth.user.email === 'alexandre_gorges@hotmail.com';
                if (!alive) return;
                setConsultantId(cid);
                setIsAdmin(adminFlag);
                setOnboarded(!!cons?.onboarded_at);

                // Carrega mapa de consultores pra mostrar nome de quem está com cada lead
                // (não-crítico — se falhar, sem nome aparece e segue).
                try {
                    const { data: allCons } = await supabase
                        .from('consultants_manos_crm')
                        .select('id, name')
                        .eq('is_active', true);
                    if (alive && allCons) {
                        const m = new Map<string, string>();
                        for (const c of allCons) m.set(c.id, (c.name || '').split(' ')[0]);
                        setConsultantsMap(m);
                    }
                } catch (e) {
                    console.warn('[Inbox] Falha ao carregar consultores:', e);
                }

                await fetchLeads(cid, filter === 'archived' ? 'archived' : 'active', adminFlag);
            } catch (e: any) {
                console.error('[Inbox] Erro fatal no useEffect:', e?.message || e);
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [supabase, router, fetchLeads, filter]);

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

    // Realtime — com debounce de 1.5s pra evitar refetch em rajada.
    // Um único evento real pode disparar callback em 2-3 das 3 tabelas; sem
    // debounce o inbox refazia fetchLeads 3x em <100ms (cada um ~300ms).
    useEffect(() => {
        const tables = ['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26'];
        const channel = supabase.channel('inbox-live');
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefetch = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchLeads(consultantId, filter === 'archived' ? 'archived' : 'active', isAdmin);
            }, 3500);
        };
        for (const t of tables) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleRefetch);
        }
        channel.subscribe((status: string) => { setLive(status === 'SUBSCRIBED'); });
        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [supabase, consultantId, fetchLeads, filter]);

    // Buckets + filtros
    const grouped = useMemo(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const buckets: Record<Bucket, InboxLead[]> = { reversao: [], urgent: [], active: [], cooling: [], zombie: [] };
        for (const lead of leads) {
            const b = bucketFor(lead);
            buckets[b].push(lead);
        }

        if (filter === 'today') {
            const all = leads.filter(l => bucketFor(l) !== 'zombie');
            return {
                reversao: all.filter(l => bucketFor(l) === 'reversao'),
                urgent: all.filter(l => bucketFor(l) === 'urgent'),
                active: all.filter(l => bucketFor(l) === 'active'),
                cooling: all.filter(l => bucketFor(l) === 'cooling'),
                zombie: [],
            };
        }
        if (filter === 'all') {
            return buckets;
        }
        return { ...buckets, zombie: [] };
    }, [leads, filter]);

    const counts = {
        reversao: grouped.reversao.length,
        urgent: grouped.urgent.length,
        active: grouped.active.length,
        cooling: grouped.cooling.length,
        zombie: grouped.zombie.length,
    };

    function dismissToast(uid: string) {
        setToasts(prev => prev.filter(t => t.uid !== uid));
    }

    async function handleOnboarded() {
        if (!consultantId) return;
        await supabase
            .from('consultants_manos_crm')
            .update({ onboarded_at: new Date().toISOString() })
            .eq('id', consultantId);
        setOnboarded(true);
    }

    const toggleSound = () => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        localStorage.setItem('inbox_sound', String(next));
    };

    return (
        <div className="p-2 md:p-4 max-w-5xl mx-auto pb-32">
            {/* ONBOARDING OVERLAY */}
            {!onboarded && consultantId && (
                <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in duration-300">
                        <div className="text-4xl mb-4">👋</div>
                        <h2 className="text-xl font-bold text-white mb-4">Bem-vindo ao Novo Inbox!</h2>
                        <ul className="space-y-4 text-sm text-gray-300 mb-8">
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                                <p>Aqui ficam todos os seus leads. A fila é automática.</p>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                                <p><strong className="text-red-400">Vermelho pulsante</strong> = cliente esperando. Atenda primeiro.</p>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-zinc-700 text-white rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
                                <p>Clique em qualquer lead para ver o histórico e usar <strong>mensagens prontas</strong>.</p>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">4</span>
                                <p>Use os botões coloridos para marcar vendas ou perdas.</p>
                            </li>
                        </ul>
                        <button onClick={handleOnboarded} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20">
                            Entendi! Bora vender
                        </button>
                    </div>
                </div>
            )}

            {/* HEADER */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3 sticky top-0 bg-black/80 backdrop-blur-xl py-4 px-2 z-20 -mx-2 border-b border-zinc-800/50">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black tracking-tight text-white">Inbox</h1>
                    <button onClick={toggleSound} className={`w-10 h-10 flex items-center justify-center rounded-full border transition-all active:scale-90 ${soundEnabled ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-gray-500'}`} title="Notificações sonoras">
                        <Bell className={`w-5 h-5 ${soundEnabled ? 'animate-bounce' : ''}`} />
                    </button>
                    <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-600'}`} />
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {([
                        ['priority', 'Foco'],
                        ['today', 'Hoje'],
                        ['all', 'Tudo'],
                        ['archived', '🗄️'],
                    ] as Array<[Filter, string]>).map(([f, label]) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl border font-bold transition-all active:scale-95 whitespace-nowrap ${filter === f ? 'bg-white text-black border-white shadow-xl' : 'bg-zinc-900 border-zinc-800 text-gray-400'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* CONTADORES */}
            {filter !== 'archived' && (
                <div className="flex items-center gap-3 mb-5 text-xs text-gray-400">
                    <span>🔥 <strong className="text-red-400">{counts.urgent}</strong> urgentes</span>
                    <span>🌡️ <strong className="text-orange-300">{counts.active}</strong> em conversa</span>
                    <span>❄️ <strong className="text-blue-300">{counts.cooling}</strong> esfriando</span>
                    {filter === 'all' && counts.zombie > 0 && (
                        <span>🪦 <strong className="text-zinc-500">{counts.zombie}</strong> zumbis (mais de {ZOMBIE_DAYS}d)</span>
                    )}
                </div>
            )}
            {filter === 'archived' && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 mb-4 text-sm text-gray-300">
                    🗄️ <strong>{leads.length}</strong> leads arquivados.
                    Eles <strong>não recebem mais mensagens automáticas da IA</strong> e não aparecem na fila normal.
                    Clique em qualquer um pra ver/desarquivar.
                </div>
            )}

            {loading ? (
                <p className="text-gray-400">Carregando…</p>
            ) : filter === 'archived' ? (
                leads.length === 0 ? (
                    <div className="text-gray-400 text-center py-12">
                        <p className="text-lg">Nenhum lead arquivado.</p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {leads.map(lead => (
                            <li key={lead.uid}>
                                <Link href={`/lead/${encodeURIComponent(lead.uid)}`}
                                    className="block bg-zinc-900 hover:bg-zinc-800 rounded-lg p-3 transition opacity-70 hover:opacity-100">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-gray-200 truncate">{lead.name || 'Sem nome'}</div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {lead.vehicle_interest || lead.source || '—'}
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-gray-500">arquivado</span>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )
            ) : counts.urgent + counts.active + counts.cooling + counts.zombie === 0 ? (
                <div className="text-gray-400 text-center py-12">
                    <p className="text-lg">Nada na fila.</p>
                    <p className="text-sm mt-1">Boa hora pra prospectar.</p>
                </div>
            ) : (
                <PTR onRefresh={() => fetchLeads(consultantId, 'active', isAdmin)}>
                    <div className="space-y-10 pb-20">
                        {/* Card guia: PRÓXIMO LEAD A TOCAR. Vendedor leigo abre o
                            CRM e já sabe o que fazer agora, sem precisar interpretar
                            seções/buckets. Aparece só quando há urgentes. */}
                        <NextActionCard
                            lead={grouped.reversao[0] || grouped.urgent[0] || grouped.active[0] || null}
                            lastMessages={lastMessages}
                            consultantId={consultantId}
                        />
                        {grouped.reversao.length > 0 && (
                            <Section
                                title="🔥 REVERSÃO BEM-SUCEDIDA"
                                subtitle="Cliente perdido respondeu — feche AGORA"
                                icon={<Flame className="w-5 h-5 text-pink-400 animate-pulse" />}
                                accent="border-pink-500 ring-2 ring-pink-500/30 shadow-lg shadow-pink-500/20"
                                leads={grouped.reversao}
                                lastMessages={lastMessages}
                                emptyText=""
                                expandedUid={expandedUid}
                                onToggle={setExpandedUid}
                                onArchive={handleArchive}
                                consultantsMap={consultantsMap}
                            />
                        )}
                        <Section title="Urgente" subtitle="Responda agora" icon={<Flame className="w-5 h-5 text-red-500" />} accent="border-red-600"
                            leads={grouped.urgent} lastMessages={lastMessages} emptyText="Nenhum lead urgente. Bom trabalho." expandedUid={expandedUid} onToggle={setExpandedUid} onArchive={handleArchive} consultantsMap={consultantsMap} />
                        <Section title="Em negociação" subtitle="Aguardando cliente" icon={<Thermometer className="w-5 h-5 text-orange-400" />} accent="border-zinc-700"
                            leads={grouped.active} lastMessages={lastMessages} emptyText="Nenhum em negociação no momento." expandedUid={expandedUid} onToggle={setExpandedUid} onArchive={handleArchive} consultantsMap={consultantsMap} />
                        <Section title="Aguardando" subtitle="Sem resposta há 48h+" icon={<Clock className="w-5 h-5 text-blue-400" />} accent="border-blue-900"
                            leads={grouped.cooling} lastMessages={lastMessages} emptyText="Nenhum lead aguardando." expandedUid={expandedUid} onToggle={setExpandedUid} onArchive={handleArchive} consultantsMap={consultantsMap} />
                        {filter === 'all' && grouped.zombie.length > 0 && (
                            <Section title="Zumbis" subtitle={`Mais de ${ZOMBIE_DAYS}d`} icon={<AlertTriangle className="w-5 h-5 text-zinc-500" />} accent="border-zinc-800 opacity-60"
                                leads={grouped.zombie} lastMessages={lastMessages} emptyText="" expandedUid={expandedUid} onToggle={setExpandedUid} onArchive={handleArchive} consultantsMap={consultantsMap} />
                        )}
                    </div>
                </PTR>
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
    lastMessages: Map<string, { inbound?: LastMessage, outbound?: LastMessage }>;
    emptyText: string;
    expandedUid: string | null;
    onToggle: (uid: string | null) => void;
    onArchive: (uid: string, e: React.MouseEvent) => void;
    consultantsMap?: Map<string, string>;
}

/**
 * Card de orientação no topo do Inbox.
 * Mostra UM lead — o mais urgente — com nome grande, contexto curto e
 * 1 botão claro: "ABRIR CONVERSA". Pra vendedor leigo que abre o CRM e
 * não sabe o que fazer primeiro.
 */
function NextActionCard({ lead, lastMessages, consultantId }: {
    lead: InboxLead | null;
    lastMessages: Map<string, { inbound?: LastMessage; outbound?: LastMessage }>;
    consultantId: string | null;
}) {
    if (!lead) {
        return (
            <div className="rounded-2xl bg-gradient-to-br from-emerald-900/30 to-zinc-900/40 border border-emerald-700/40 p-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="text-3xl">✅</div>
                    <h2 className="text-xl font-bold text-emerald-300">Tudo em dia</h2>
                </div>
                <p className="text-sm text-emerald-100/70">
                    Você não tem nenhum lead urgente agora. Hora de prospectar — peça pra IA cobrar quem ainda não respondeu, ou aguarde o próximo lead chegar.
                </p>
            </div>
        );
    }

    const msgs = lastMessages.get(lead.uid);
    const lastIn = msgs?.inbound;
    const lastOut = msgs?.outbound;
    const lastMsg = lastIn?.created_at && lastOut?.created_at
        ? (new Date(lastIn.created_at) > new Date(lastOut.created_at) ? lastIn : lastOut)
        : (lastIn || lastOut);
    const lastMsgFrom = lastMsg === lastIn ? '👤 Cliente' : (lastMsg === lastOut ? '🤖 Você/IA' : null);
    const lastMsgAge = lastMsg?.created_at ? Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / 60000) : null;

    let timeLabel = 'Acabou de chegar';
    let timeColor = 'text-red-300';
    if (lastMsgAge !== null) {
        if (lastMsgAge < 60) { timeLabel = `${lastMsgAge}min sem resposta`; timeColor = 'text-yellow-300'; }
        else if (lastMsgAge < 1440) { timeLabel = `${Math.floor(lastMsgAge / 60)}h sem resposta`; timeColor = 'text-orange-300'; }
        else { timeLabel = `${Math.floor(lastMsgAge / 1440)}d sem resposta`; timeColor = 'text-red-300'; }
    }

    return (
        <div className="rounded-2xl bg-gradient-to-br from-red-950/40 via-zinc-900 to-zinc-900 border-2 border-red-600/50 p-5 shadow-xl">
            <div className="flex items-start gap-4">
                <div className="text-3xl">🔥</div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-wider text-red-400 font-bold mb-1">Próximo lead a tocar agora</div>
                    <div className="text-2xl font-bold text-white truncate">{lead.name || 'Sem nome'}</div>
                    <div className="text-sm text-zinc-300 truncate">
                        {lead.vehicle_interest || lead.source || 'Lead novo — qualifique o interesse'}
                    </div>
                    <div className={`text-sm mt-2 ${timeColor}`}>
                        ⏱ {timeLabel}
                    </div>
                    {lastMsg?.message_text && (
                        <div className="mt-3 p-2 rounded-md bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-200">
                            <div className="text-xs text-zinc-400 mb-1">{lastMsgFrom} disse:</div>
                            <div className="line-clamp-2">{lastMsg.message_text}</div>
                        </div>
                    )}
                </div>
                <Link
                    href={`/lead/${encodeURIComponent(lead.uid)}`}
                    className="shrink-0 bg-red-600 hover:bg-red-500 transition text-white font-bold px-6 py-3 rounded-xl text-sm flex items-center gap-2 shadow-lg"
                >
                    Abrir conversa →
                </Link>
            </div>
        </div>
    );
}

function Section({ title, subtitle, icon, accent, leads, lastMessages, emptyText, expandedUid, onToggle, onArchive, consultantsMap }: SectionProps) {
    return (
        <section>
            <div className={`flex items-center gap-3 mb-4 pl-3 border-l-4 ${accent}`}>
                {icon}
                <div>
                    <h2 className="text-base font-black text-white uppercase tracking-tight">{title} · {leads.length}</h2>
                    <p className="text-[11px] text-gray-500 font-medium">{subtitle}</p>
                </div>
            </div>
            {leads.length === 0 ? (
                emptyText && <p className="text-xs text-gray-600 italic pl-3 mb-2">{emptyText}</p>
            ) : (
                <ul className="space-y-4">
                    {leads.map(lead => (
                        <LeadCard
                            key={lead.uid}
                            lead={lead}
                            messages={lastMessages.get(lead.native_id)}
                            isExpanded={expandedUid === lead.uid}
                            onToggle={() => onToggle(expandedUid === lead.uid ? null : lead.uid)}
                            onArchive={(e) => onArchive(lead.uid, e)}
                            consultantName={lead.assigned_consultant_id ? consultantsMap?.get(lead.assigned_consultant_id) : undefined}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function LeadCard({ lead, messages, isExpanded, onToggle, onArchive, consultantName }: { lead: InboxLead; messages?: { inbound?: LastMessage, outbound?: LastMessage }; isExpanded: boolean; onToggle: () => void; onArchive: (e: React.MouseEvent) => void; consultantName?: string }) {
    const sla = slaInfo(lead);
    const state = getLeadState(lead, messages?.inbound, messages?.outbound);
    
    const stateColors: Record<LeadState, string> = {
        AGUARDANDO_VENDEDOR: 'border-red-600 bg-red-950/5 ring-1 ring-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]',
        AGUARDANDO_CLIENTE: 'border-zinc-800 bg-zinc-900/30 opacity-90',
        IA_TOCOU: 'border-emerald-600/30 bg-emerald-950/5',
        NUNCA_TOCADO: 'border-orange-500 bg-orange-950/5 ring-1 ring-orange-500/20',
    };

    // Lead de reversão (cliente respondeu IA) entra pulsante — ignora cor de estado
    const reversaoClass = lead.flagged_reversao
        ? 'border-pink-500 ring-2 ring-pink-500/40 shadow-[0_0_20px_rgba(236,72,153,0.35)] animate-pulse-soft'
        : '';

    const lastMsgText = messages?.inbound?.message_text;

    return (
        <li className="list-none">
            <div
                onClick={onToggle}
                className={`block border rounded-2xl p-5 transition-all duration-300 relative overflow-hidden active:scale-[0.98] cursor-pointer ${reversaoClass || stateColors[state]} ${isExpanded ? 'ring-2 ring-blue-500/50 bg-zinc-900' : ''}`}>
                {lead.flagged_reversao && (
                    <div className="absolute -top-1 -right-1 px-2 py-0.5 bg-pink-500 text-white text-[10px] font-black rounded-bl-lg uppercase tracking-wider animate-pulse">
                        🔥 IA pescou
                    </div>
                )}
                
                {/* Linha 1: NOME GRANDE */}
                <div className="flex justify-between items-start gap-4 mb-2">
                    <h3 className="font-black text-white text-xl md:text-2xl truncate leading-tight flex-1">{lead.name || 'Sem nome'}</h3>
                    {lead.ai_score != null && (
                        <div className={`px-2 py-1 rounded-lg font-black text-xs ${lead.ai_score >= 80 ? 'bg-red-600 text-white' : 'bg-zinc-800 text-gray-400'}`}>
                            {lead.ai_score}
                        </div>
                    )}
                </div>

                {/* Linha 2: SLA + Tempo + Vendedor responsável */}
                <div className="flex items-center gap-2 flex-wrap mb-4">
                    <span className={`text-[11px] px-2.5 py-1 rounded-md font-black uppercase tracking-tight shadow-sm ${sla.color}`}>
                        {sla.text}
                    </span>
                    <span className="text-[11px] text-gray-500 font-bold flex items-center gap-1.5 bg-zinc-800/50 px-2 py-1 rounded-md">
                        <Clock className="w-3.5 h-3.5" /> {new Date(lead.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {lead.assigned_consultant_id ? (
                        <span className="text-[11px] font-bold flex items-center gap-1 bg-blue-900/40 border border-blue-700/40 text-blue-200 px-2 py-1 rounded-md">
                            👤 {consultantName || '...'}
                        </span>
                    ) : (
                        <span className="text-[11px] font-bold flex items-center gap-1 bg-amber-900/40 border border-amber-600/40 text-amber-200 px-2 py-1 rounded-md animate-pulse">
                            ⚠️ SEM VENDEDOR
                        </span>
                    )}
                </div>

                {/* Linha 3: ÚLTIMA MENSAGEM DO CLIENTE */}
                <div className="mb-3">
                    {lastMsgText ? (
                        <p className="text-sm md:text-base text-gray-200 italic line-clamp-2 leading-relaxed bg-black/20 p-3 rounded-xl border border-white/5">
                            <MessageCircle className="inline w-4 h-4 mr-2 text-blue-400" />
                            "{lastMsgText}"
                        </p>
                    ) : (
                        <p className="text-xs text-gray-500 italic px-1">{lead.vehicle_interest || lead.source || 'Sem mensagens'}</p>
                    )}
                </div>

                {/* Linha 4: INDICADOR DE ESTADO */}
                <div className="mb-4">
                    <div className={`text-[12px] font-bold flex items-center gap-2 ${state === 'AGUARDANDO_VENDEDOR' ? 'text-red-400' : 'text-gray-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${state === 'AGUARDANDO_VENDEDOR' ? 'bg-red-500 animate-pulse' : 'bg-zinc-700'}`} />
                        {stateLabel(state)}
                    </div>
                </div>

                {/* Linha 5: CHIPS DE MENSAGENS PRONTAS */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    <div className="flex gap-2">
                        {['welcome', 'financing', 'visit_schedule'].map(k => (
                            <span key={k} className="text-[11px] bg-zinc-800 text-gray-200 px-3 py-1.5 rounded-xl border border-zinc-700 font-bold whitespace-nowrap">
                                {k === 'welcome' ? '👋 Boas-vindas' : k === 'financing' ? '💳 Simulação' : '📅 Visita'}
                            </span>
                        ))}
                    </div>
                    <div className="ml-auto pl-4">
                        <div className="w-8 h-8 rounded-full bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                            <span className="text-blue-400 text-xs font-black">+</span>
                        </div>
                    </div>
                </div>

                {/* DETALHES EXPANSÍVEIS (A.5) */}
                {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-zinc-800 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-3">
                            <Link href={`/lead/${encodeURIComponent(lead.uid)}`} className="col-span-2 md:col-span-1 min-h-[56px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-lg transition-all active:scale-95 shadow-xl shadow-blue-900/20">
                                ABRIR CONVERSA
                            </Link>
                            <button 
                                onClick={onArchive}
                                className="md:col-span-1 min-h-[56px] flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-2xl font-bold transition-all active:scale-95">
                                ARQUIVAR
                            </button>
                        </div>
                    </div>
                )}

                {/* Efeito de pulsação customizado */}
                {(state === 'AGUARDANDO_VENDEDOR' || state === 'NUNCA_TOCADO') && !isExpanded && (
                    <div className={`absolute top-0 left-0 w-full h-1 ${state === 'AGUARDANDO_VENDEDOR' ? 'bg-red-500 animate-pulse' : 'bg-orange-500 animate-pulse'}`} />
                )}
            </div>

            <style jsx>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </li>
    );
}
