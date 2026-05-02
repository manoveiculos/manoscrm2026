'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
    Bot, MessageCircle, AlertTriangle, RefreshCw, Flame,
    Wifi, ArrowUpRight, Activity, Users, TrendingUp, Clock,
} from 'lucide-react';

/**
 * /admin/live — War Room
 *
 * 5 painéis em tempo real:
 *   1. 🤖 IA enviou (msgs robô → cliente)
 *   2. 📥 Clientes responderam
 *   3. 📱 Cobranças do vendedor
 *   4. 🔄 Leads reativados / reatribuídos
 *   5. 🔥 Leads quentes precisando atenção
 *
 * Layout fullscreen, fundo escuro, atualização instantânea.
 */

interface AiSentItem { id: string; type: string; ts: string; leadName: string; leadUid: string | null; phone: string; provider: string; }
interface ReplyItem { id: string; ts: string; leadName: string; leadUid: string | null; preview: string; }
interface VendorAlert { id: string; ts: string; consultantName: string; phone: string | null; kind: string; title: string; message: string; acknowledged: string | null; leadUid?: string | null; }
interface ReassignItem { id: string; ts: string; level: number; levelLabel: string; leadName: string; leadUid: string | null; consultantName: string | null; notes: string; }
interface HotLead { uid: string; name: string; phone: string | null; vehicle: string | null; score: number; classification: string | null; consultantName: string | null; firstContactAt: string | null; updatedAt: string | null; minSinceUpdate: number | null; status: 'urgent' | 'waiting_vendor' | 'ai_only' | 'ok'; }
interface FeedData {
    aiSent: AiSentItem[];
    clientReplies: ReplyItem[];
    vendorAlerts: VendorAlert[];
    reassigned: ReassignItem[];
    hotLeads: HotLead[];
    kpis: { aiSentLast24h: number; repliesLast24h: number; vendorAlertsLast24h: number; reassignedLast24h: number; hotLeadsActive: number };
    generated_at: string;
}

function timeAgo(iso: string): string {
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function formatPhone(p: string | null): string {
    if (!p) return '';
    const d = p.replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return p;
}

export default function LivePage() {
    const supabase = useMemo(() => createClient(), []);
    const [data, setData] = useState<FeedData | null>(null);
    const [live, setLive] = useState(false);
    const [tickFlag, setTickFlag] = useState(0); // força re-render dos timeAgo
    const lastFetchRef = useRef<number>(0);

    const fetchFeed = useCallback(async () => {
        // Throttle: no máximo 1 fetch a cada 2s
        const now = Date.now();
        if (now - lastFetchRef.current < 2000) return;
        lastFetchRef.current = now;
        try {
            const res = await fetch('/api/admin/live-feed', { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            setData(json);
        } catch (e) {
            // noop
        }
    }, []);

    // Carga inicial + refresh a cada 30s como rede de segurança
    useEffect(() => {
        fetchFeed();
        const t = setInterval(fetchFeed, 30000);
        return () => clearInterval(t);
    }, [fetchFeed]);

    // Tick a cada 10s pra atualizar timeAgo
    useEffect(() => {
        const t = setInterval(() => setTickFlag(x => x + 1), 10000);
        return () => clearInterval(t);
    }, []);

    // Realtime: qualquer evento das 5 fontes recarrega o feed
    useEffect(() => {
        const channel = supabase.channel('admin-live-feed');
        const tables = ['whatsapp_send_log', 'whatsapp_messages', 'cowork_alerts', 'sla_escalations', 'leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26'];
        for (const t of tables) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
                fetchFeed();
            });
        }
        channel.subscribe((status: string) => { setLive(status === 'SUBSCRIBED'); });
        return () => { supabase.removeChannel(channel); };
    }, [supabase, fetchFeed]);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="max-w-[1600px] mx-auto p-3 md:p-5">
                {/* HEADER */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                            <Activity className="w-7 h-7 text-emerald-400" />
                            War Room — Tempo Real
                        </h1>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            Tudo o que está acontecendo no CRM neste instante.
                            {data && <span className="ml-2">Sync: {timeAgo(data.generated_at)} atrás</span>}
                            <span suppressHydrationWarning>{tickFlag === 0 ? '' : ''}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs flex items-center gap-1 ${live ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            <Wifi className="w-3.5 h-3.5" /> {live ? 'AO VIVO' : 'offline'}
                        </span>
                        <button onClick={fetchFeed} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Atualizar
                        </button>
                    </div>
                </div>

                {/* KPIs TOPO */}
                {data && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
                        <KpiTile icon={<Bot className="w-4 h-4" />} label="IA enviou (24h)" value={data.kpis.aiSentLast24h} accent="text-blue-400" />
                        <KpiTile icon={<MessageCircle className="w-4 h-4" />} label="Clientes responderam" value={data.kpis.repliesLast24h} accent="text-emerald-400" />
                        <KpiTile icon={<AlertTriangle className="w-4 h-4" />} label="Cobranças vendedor" value={data.kpis.vendorAlertsLast24h} accent="text-amber-400" />
                        <KpiTile icon={<RefreshCw className="w-4 h-4" />} label="Reativações/reatribuições" value={data.kpis.reassignedLast24h} accent="text-purple-400" />
                        <KpiTile icon={<Flame className="w-4 h-4" />} label="🔥 Leads quentes ativos" value={data.kpis.hotLeadsActive} accent="text-red-400" pulse />
                    </div>
                )}

                {/* GRID PRINCIPAL */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* PAINEL 1 - IA enviou */}
                    <Panel
                        title="🤖 IA enviou pro cliente"
                        subtitle="Mensagens automáticas (SDR + Follow-up)"
                        accent="border-blue-700"
                        empty="Nenhuma mensagem da IA nas últimas 24h"
                        items={data?.aiSent || []}
                        renderItem={(it: AiSentItem) => (
                            <FeedRow
                                ts={it.ts}
                                leftLabel={it.type === 'ai_first_contact' ? '🆕 1º contato' : '🔁 Follow-up'}
                                leftColor={it.type === 'ai_first_contact' ? 'text-blue-300' : 'text-purple-300'}
                                title={it.leadName}
                                meta={`${formatPhone(it.phone)} · via ${it.provider}`}
                                href={it.leadUid ? `/lead/${encodeURIComponent(it.leadUid)}` : null}
                            />
                        )}
                    />

                    {/* PAINEL 2 - Clientes responderam */}
                    <Panel
                        title="📥 Clientes responderam"
                        subtitle="Novas mensagens recebidas dos leads"
                        accent="border-emerald-700"
                        empty="Nenhuma resposta de cliente nas últimas 24h"
                        items={data?.clientReplies || []}
                        renderItem={(it: ReplyItem) => (
                            <FeedRow
                                ts={it.ts}
                                leftLabel="🔥 Resposta"
                                leftColor="text-emerald-300"
                                title={it.leadName}
                                meta={`"${it.preview}${it.preview.length >= 120 ? '…' : ''}"`}
                                metaItalic
                                href={it.leadUid ? `/lead/${encodeURIComponent(it.leadUid)}` : null}
                                pulse
                            />
                        )}
                    />

                    {/* PAINEL 3 - Cobranças do vendedor */}
                    <Panel
                        title="📱 Cobranças do vendedor"
                        subtitle="Push WhatsApp + modal bloqueante"
                        accent="border-amber-700"
                        empty="Sem cobranças ativas — equipe respondendo no tempo"
                        items={data?.vendorAlerts || []}
                        renderItem={(it: VendorAlert) => (
                            <FeedRow
                                ts={it.ts}
                                leftLabel={it.kind === 'modal_blocking' ? '🚨 Modal' : '📱 Push'}
                                leftColor={it.kind === 'modal_blocking' ? 'text-red-300' : 'text-amber-300'}
                                title={it.consultantName}
                                meta={it.message ? it.message : (it.phone ? formatPhone(it.phone) : '—')}
                                badge={it.acknowledged ? `✅ ${it.acknowledged}` : (it.kind === 'modal_blocking' ? '⏳ pendente' : null)}
                                badgeColor={it.acknowledged ? 'text-emerald-400' : 'text-red-400'}
                                href={it.leadUid ? `/lead/${encodeURIComponent(it.leadUid)}` : null}
                            />
                        )}
                    />

                    {/* PAINEL 4 - Reativações / Reatribuições */}
                    <Panel
                        title="🔄 Leads reativados"
                        subtitle="Reatribuições + auto-finalizações pelo SLA"
                        accent="border-purple-700"
                        empty="Nenhuma movimentação automática nas últimas 24h"
                        items={data?.reassigned || []}
                        renderItem={(it: ReassignItem) => (
                            <FeedRow
                                ts={it.ts}
                                leftLabel={it.levelLabel}
                                leftColor={it.level === 3 ? 'text-purple-300' : it.level === 4 ? 'text-zinc-400' : 'text-amber-300'}
                                title={it.leadName}
                                meta={it.consultantName ? `→ ${it.consultantName}` : it.notes}
                                href={it.leadUid ? `/lead/${encodeURIComponent(it.leadUid)}` : null}
                            />
                        )}
                    />
                </div>

                {/* PAINEL 5 - Leads quentes (largura total) */}
                <div className="mt-5">
                    <div className={`bg-zinc-900 rounded-lg border-l-4 border-red-700 overflow-hidden`}>
                        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Flame className="w-4 h-4 text-red-500" />
                                    🔥 LEADS SUPER QUENTES (precisam atenção AGORA)
                                </h2>
                                <p className="text-[11px] text-zinc-500">Score IA ≥ 80 · Ativos · Ordenados por urgência</p>
                            </div>
                            <span className="text-2xl font-black text-red-400">{data?.hotLeads.length || 0}</span>
                        </div>
                        {!data?.hotLeads.length ? (
                            <div className="p-6 text-center text-zinc-500 text-sm">
                                Nenhum lead super quente no momento. Bom trabalho!
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-zinc-500 text-left bg-zinc-950/50">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Status</th>
                                            <th className="px-4 py-2 font-medium">Lead</th>
                                            <th className="px-4 py-2 font-medium">Veículo</th>
                                            <th className="px-4 py-2 font-medium">Score</th>
                                            <th className="px-4 py-2 font-medium">Vendedor</th>
                                            <th className="px-4 py-2 font-medium">Última ação</th>
                                            <th className="px-4 py-2 font-medium"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.hotLeads.map(l => (
                                            <tr key={l.uid} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                                                <td className="px-4 py-2"><HotStatusBadge status={l.status} /></td>
                                                <td className="px-4 py-2 font-semibold text-white truncate max-w-[200px]">{l.name}</td>
                                                <td className="px-4 py-2 text-zinc-400 truncate max-w-[200px]">{l.vehicle || '—'}</td>
                                                <td className="px-4 py-2"><span className="font-mono text-red-400 font-bold">{l.score}</span></td>
                                                <td className="px-4 py-2 text-zinc-400">{l.consultantName || <span className="text-amber-400">SEM VENDEDOR</span>}</td>
                                                <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap">
                                                    <Clock className="inline w-3 h-3 mr-1" />
                                                    {l.minSinceUpdate !== null ? `${l.minSinceUpdate < 60 ? l.minSinceUpdate + 'min' : Math.floor(l.minSinceUpdate / 60) + 'h'} atrás` : '—'}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <Link href={`/lead/${encodeURIComponent(l.uid)}`}
                                                        className="text-xs px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded font-bold inline-flex items-center gap-1">
                                                        Atender <ArrowUpRight className="w-3 h-3" />
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── COMPONENTES ───────────────────────────────────── */

function KpiTile({ icon, label, value, accent, pulse }: { icon: React.ReactNode; label: string; value: number; accent: string; pulse?: boolean }) {
    return (
        <div className={`bg-zinc-900 rounded-lg p-3 border border-zinc-800 ${pulse && value > 0 ? 'animate-pulse' : ''}`}>
            <div className="flex items-center justify-between mb-1">
                <span className={`${accent}`}>{icon}</span>
            </div>
            <div className={`text-2xl font-black ${accent}`}>{value}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{label}</div>
        </div>
    );
}

function Panel<T extends { id: string }>({ title, subtitle, accent, items, empty, renderItem }: {
    title: string; subtitle: string; accent: string; items: T[]; empty: string; renderItem: (it: T) => React.ReactNode;
}) {
    return (
        <div className={`bg-zinc-900 rounded-lg border-l-4 ${accent} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-white">{title}</h3>
                    <p className="text-[11px] text-zinc-500">{subtitle}</p>
                </div>
                <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded">{items.length}</span>
            </div>
            <div className="divide-y divide-zinc-800/50 max-h-[420px] overflow-y-auto">
                {items.length === 0
                    ? <p className="px-4 py-6 text-center text-zinc-500 text-xs">{empty}</p>
                    : items.map(it => <div key={it.id}>{renderItem(it)}</div>)
                }
            </div>
        </div>
    );
}

function FeedRow({ ts, leftLabel, leftColor, title, meta, metaItalic, badge, badgeColor, href, pulse }: {
    ts: string; leftLabel: string; leftColor: string; title: string; meta: string;
    metaItalic?: boolean; badge?: string | null; badgeColor?: string; href?: string | null; pulse?: boolean;
}) {
    const inner = (
        <div className={`px-4 py-2.5 hover:bg-zinc-800/40 transition ${pulse ? 'animate-pulse-slow' : ''}`}>
            <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className={`text-[11px] font-bold uppercase tracking-wide ${leftColor}`}>{leftLabel}</span>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">{timeAgo(ts)}</span>
            </div>
            <div className="text-sm font-semibold text-white truncate">{title}</div>
            <div className={`text-xs text-zinc-400 truncate ${metaItalic ? 'italic' : ''}`}>{meta}</div>
            {badge && <span className={`text-[10px] mt-1 inline-block ${badgeColor || 'text-zinc-400'}`}>{badge}</span>}
        </div>
    );
    return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function HotStatusBadge({ status }: { status: HotLead['status'] }) {
    const map = {
        urgent: { label: '🚨 NUNCA TOCADO', color: 'bg-red-900/60 text-red-200' },
        waiting_vendor: { label: '⚠️ ESPERANDO', color: 'bg-amber-900/60 text-amber-200' },
        ai_only: { label: '🤖 só IA', color: 'bg-blue-900/60 text-blue-200' },
        ok: { label: '✅ ok', color: 'bg-emerald-900/60 text-emerald-200' },
    };
    const v = map[status];
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${v.color}`}>{v.label}</span>;
}
