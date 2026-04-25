'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertOctagon, MessageSquare, UserX, Inbox, RefreshCw, Timer } from 'lucide-react';

/**
 * /admin/health
 *
 * Onde a operação falha em silêncio. Olhe aqui antes de tudo.
 */

interface CronRow {
    cron_name: string;
    started_at: string;
    success: boolean;
    seconds_since_run: number;
    duration_ms: number | null;
    error_message: string | null;
    stale: boolean;
}

interface Health {
    notificationFailures: { total: number; byChannel: Record<string, number>; samples: any[] };
    whatsappSends: { total: number; byKind: Record<string, number>; byProvider: Record<string, number> };
    consultantConfig: { total: number; missing: Array<{ id: string; name: string; missing: string[] }> };
    pendingAlerts: { total: number; samples: any[] };
    intake: { receivedLast24h: number; firstContacted24h: number; contactRate: number; orphanLeads: number };
    crons: CronRow[];
}

function fmtAge(secs: number): string {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}min`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
}

export default function HealthPage() {
    const [data, setData] = useState<Health | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [generated, setGenerated] = useState<string | null>(null);

    async function load() {
        setLoading(true); setErr(null);
        try {
            const res = await fetch('/api/metrics/health');
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setData(json.summary);
            setGenerated(json.generated_at);
        } catch (e: any) {
            setErr(e?.message || 'erro');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        const t = setInterval(load, 60_000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="p-4 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-white">Saúde Operacional</h1>
                <button onClick={load} className="text-sm text-gray-300 hover:text-white flex items-center gap-1">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
            </div>
            {generated && <p className="text-xs text-gray-500 mb-4">Atualizado: {new Date(generated).toLocaleString('pt-BR')}</p>}
            {err && <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">{err}</div>}

            {!data ? (
                <div className="text-gray-400">Carregando…</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                        <Stat
                            icon={<Inbox className="w-5 h-5 text-blue-400" />}
                            label="Leads recebidos 24h"
                            value={data.intake.receivedLast24h}
                            sub={`${data.intake.firstContacted24h} contatados (${(data.intake.contactRate * 100).toFixed(0)}%)`}
                            warn={data.intake.contactRate < 0.7}
                        />
                        <Stat
                            icon={<UserX className="w-5 h-5 text-amber-400" />}
                            label="Leads órfãos (sem vendedor)"
                            value={data.intake.orphanLeads}
                            sub="Webhook funcionando? autoAssign?"
                            warn={data.intake.orphanLeads > 0}
                        />
                        <Stat
                            icon={<AlertOctagon className="w-5 h-5 text-red-400" />}
                            label="Alertas SLA pendentes >1h"
                            value={data.pendingAlerts.total}
                            sub="Vendedor ignorando modal?"
                            warn={data.pendingAlerts.total > 0}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <Card title="Falhas de notificação 24h" icon={<AlertOctagon className="w-4 h-4" />}>
                            {data.notificationFailures.total === 0 ? (
                                <p className="text-green-400 text-sm">Zero falhas. 🎯</p>
                            ) : (
                                <>
                                    <div className="text-3xl font-bold text-red-400 mb-2">{data.notificationFailures.total}</div>
                                    <div className="space-y-1 text-xs text-gray-400">
                                        {Object.entries(data.notificationFailures.byChannel).map(([k, v]) => (
                                            <div key={k} className="flex justify-between">
                                                <span className="font-mono">{k}</span>
                                                <span>{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </Card>

                        <Card title="Envios WhatsApp 24h" icon={<MessageSquare className="w-4 h-4" />}>
                            <div className="text-3xl font-bold text-white mb-2">{data.whatsappSends.total}</div>
                            <div className="space-y-1 text-xs text-gray-400">
                                {Object.entries(data.whatsappSends.byKind).map(([k, v]) => (
                                    <div key={k} className="flex justify-between">
                                        <span className="font-mono">{k}</span>
                                        <span>{v}</span>
                                    </div>
                                ))}
                            </div>
                            {data.whatsappSends.total === 0 && (
                                <p className="text-amber-400 text-xs mt-2">Nenhum envio nas últimas 24h. Sender configurado?</p>
                            )}
                        </Card>
                    </div>

                    <Card title="Crons" icon={<Timer className="w-4 h-4" />}>
                        {data.crons.length === 0 ? (
                            <p className="text-amber-300 text-sm">Nenhum heartbeat registrado ainda. Os crons rodaram desde o último deploy?</p>
                        ) : (
                            <table className="w-full text-xs">
                                <thead className="text-gray-500">
                                    <tr>
                                        <th className="text-left pb-2">Cron</th>
                                        <th className="text-right pb-2">Última run</th>
                                        <th className="text-right pb-2">Duração</th>
                                        <th className="text-right pb-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.crons.map(c => (
                                        <tr key={c.cron_name} className="border-t border-zinc-800 text-gray-300">
                                            <td className="py-2 font-mono">{c.cron_name}</td>
                                            <td className={`py-2 text-right ${c.stale ? 'text-red-400 font-bold' : ''}`}>
                                                {fmtAge(c.seconds_since_run)} atrás{c.stale ? ' ⚠️' : ''}
                                            </td>
                                            <td className="py-2 text-right">{c.duration_ms != null ? `${c.duration_ms}ms` : '—'}</td>
                                            <td className={`py-2 text-right ${c.success ? 'text-green-400' : 'text-red-400'}`}>
                                                {c.success ? 'ok' : `falha: ${(c.error_message || '').slice(0, 60)}`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Card>

                    <div className="h-4" />

                    <Card title="Consultores com configuração incompleta" icon={<UserX className="w-4 h-4" />}>
                        {data.consultantConfig.missing.length === 0 ? (
                            <p className="text-green-400 text-sm">Todos os {data.consultantConfig.total} consultores ativos estão configurados.</p>
                        ) : (
                            <>
                                <p className="text-amber-300 text-sm mb-3">
                                    {data.consultantConfig.missing.length} de {data.consultantConfig.total} ativos sem campo crítico —
                                    push e modal não funcionam pra eles. Corrige em <a href="/admin/users" className="underline">/admin/users</a>.
                                </p>
                                <ul className="space-y-1 text-sm">
                                    {data.consultantConfig.missing.map(m => (
                                        <li key={m.id} className="flex justify-between text-gray-200">
                                            <span>{m.name}</span>
                                            <span className="text-xs text-red-400 font-mono">faltando: {m.missing.join(', ')}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Card>

                    {data.notificationFailures.samples.length > 0 && (
                        <div className="bg-zinc-900 rounded-lg overflow-hidden mt-6">
                            <div className="px-4 py-2 border-b border-zinc-800 text-sm font-semibold text-gray-300">
                                Últimas 10 falhas
                            </div>
                            <table className="w-full text-xs">
                                <thead className="text-gray-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Quando</th>
                                        <th className="px-3 py-2 text-left">Canal</th>
                                        <th className="px-3 py-2 text-left">Erro</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.notificationFailures.samples.map((s: any, i: number) => (
                                        <tr key={i} className="border-t border-zinc-800 text-gray-300">
                                            <td className="px-3 py-2 whitespace-nowrap">{new Date(s.created_at).toLocaleTimeString('pt-BR')}</td>
                                            <td className="px-3 py-2 font-mono">{s.channel}</td>
                                            <td className="px-3 py-2 text-red-400 truncate max-w-md">{s.error}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function Stat({ icon, label, value, sub, warn }: { icon: React.ReactNode; label: string; value: number; sub?: string; warn?: boolean }) {
    return (
        <div className={`bg-zinc-900 rounded-lg p-4 ${warn ? 'border border-amber-700/50' : ''}`}>
            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">{label}</div>
                {icon}
            </div>
            <div className={`text-3xl font-bold mt-1 ${warn ? 'text-amber-400' : 'text-white'}`}>{value}</div>
            {sub && <div className="text-[11px] text-gray-500 mt-1">{sub}</div>}
        </div>
    );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-zinc-900 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                {icon} {title}
            </h2>
            {children}
        </div>
    );
}
