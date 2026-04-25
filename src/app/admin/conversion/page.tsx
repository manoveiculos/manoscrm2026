'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, Clock, Target, Zap } from 'lucide-react';

/**
 * /admin/conversion
 *
 * Mede o que importa: lead → venda. Janela ajustável.
 * Sem este painel, todo o trabalho das Sprints 1-4 é cego.
 */

interface ConversionData {
    kpis: {
        days: number;
        totalReceived: number;
        totalSold: number;
        totalLost: number;
        conversion: number;
        avgResponseMin: number;
        respondedRate: number;
        respondedFastRate: number;
    };
    funnel: { total: number; contacted: number; sold: number; lost: number; open: number };
    speedToLead: Record<string, number>;
    daily: Array<{ date: string; received: number; sold: number; lost: number; firstContacted: number }>;
    byVendor: Array<{
        consultant_id: string;
        name: string;
        received: number;
        sold: number;
        lost: number;
        conversion: number;
        responseRateFast: number;
        avgResponseMin: number;
    }>;
}

export default function ConversionPage() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState<ConversionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const res = await fetch(`/api/metrics/conversion?days=${days}`);
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                if (alive) setData(json);
            } catch (e: any) {
                if (alive) setErr(e?.message || 'erro');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [days]);

    const speedRows = data ? [
        { bucket: '<1min', count: data.speedToLead['<1min'] || 0 },
        { bucket: '1-5min', count: data.speedToLead['1-5min'] || 0 },
        { bucket: '5-30min', count: data.speedToLead['5-30min'] || 0 },
        { bucket: '30min-2h', count: data.speedToLead['30min-2h'] || 0 },
        { bucket: '>2h', count: data.speedToLead['>2h'] || 0 },
        { bucket: 'sem resp.', count: data.speedToLead.sem_resposta || 0 },
    ] : [];

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-white">Conversão</h1>
                <div className="flex gap-2 text-sm">
                    {[7, 30, 60, 90].map(d => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={`px-3 py-1 rounded-full border ${days === d ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-600 text-gray-300'}`}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {err && <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">Erro: {err}</div>}

            {loading || !data ? (
                <div className="text-gray-400">Carregando…</div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <Kpi
                            icon={<Target className="w-5 h-5 text-green-400" />}
                            label="Conversão"
                            value={`${(data.kpis.conversion * 100).toFixed(2)}%`}
                            sub={`${data.kpis.totalSold} vendas / ${data.kpis.totalReceived} leads`}
                        />
                        <Kpi
                            icon={<Clock className="w-5 h-5 text-blue-400" />}
                            label="Tempo até 1ª resposta"
                            value={`${data.kpis.avgResponseMin.toFixed(1)} min`}
                            sub={`Média (apenas leads contatados)`}
                        />
                        <Kpi
                            icon={<Zap className="w-5 h-5 text-yellow-400" />}
                            label="Respondidos em <5min"
                            value={`${(data.kpis.respondedFastRate * 100).toFixed(1)}%`}
                            sub={`Meta: 80%+`}
                        />
                        <Kpi
                            icon={<TrendingUp className="w-5 h-5 text-purple-400" />}
                            label="Taxa de contato"
                            value={`${(data.kpis.respondedRate * 100).toFixed(1)}%`}
                            sub={`Recebem 1ª msg`}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                        <div className="bg-zinc-900 rounded-lg p-4 lg:col-span-2">
                            <h2 className="text-sm font-semibold text-gray-300 mb-2">Série diária</h2>
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={data.daily}>
                                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                                    <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickFormatter={(v: string) => v.slice(5)} />
                                    <YAxis stroke="#71717a" fontSize={11} />
                                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />
                                    <Legend />
                                    <Line type="monotone" dataKey="received" name="Recebidos" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="firstContacted" name="Contatados" stroke="#a855f7" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="sold" name="Vendidos" stroke="#22c55e" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="lost" name="Perdidos" stroke="#ef4444" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="bg-zinc-900 rounded-lg p-4">
                            <h2 className="text-sm font-semibold text-gray-300 mb-2">Speed-to-lead</h2>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={speedRows}>
                                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                                    <XAxis dataKey="bucket" stroke="#71717a" fontSize={11} />
                                    <YAxis stroke="#71717a" fontSize={11} />
                                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />
                                    <Bar dataKey="count" fill="#3b82f6" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-zinc-900 rounded-lg overflow-hidden mb-6">
                        <div className="px-4 py-3 border-b border-zinc-800">
                            <h2 className="text-sm font-semibold text-gray-300">Funil ({data.kpis.days}d)</h2>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 text-sm divide-x divide-zinc-800">
                            <FunnelStep label="Recebidos" value={data.funnel.total} />
                            <FunnelStep label="Contatados" value={data.funnel.contacted} prev={data.funnel.total} />
                            <FunnelStep label="Em andamento" value={data.funnel.open} prev={data.funnel.total} />
                            <FunnelStep label="Vendidos" value={data.funnel.sold} prev={data.funnel.total} good />
                            <FunnelStep label="Perdidos" value={data.funnel.lost} prev={data.funnel.total} bad />
                        </div>
                    </div>

                    <div className="bg-zinc-900 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-800">
                            <h2 className="text-sm font-semibold text-gray-300">Por vendedor</h2>
                        </div>
                        {data.byVendor.length === 0 ? (
                            <div className="p-4 text-gray-500 text-sm">Nenhum vendedor com leads no período.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="text-gray-400 text-left">
                                    <tr>
                                        <th className="px-4 py-2">Vendedor</th>
                                        <th className="px-4 py-2 text-right">Recebidos</th>
                                        <th className="px-4 py-2 text-right">Vendidos</th>
                                        <th className="px-4 py-2 text-right">Perdidos</th>
                                        <th className="px-4 py-2 text-right">Conv.</th>
                                        <th className="px-4 py-2 text-right">% &lt;5min</th>
                                        <th className="px-4 py-2 text-right">Tempo médio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.byVendor.map(v => (
                                        <tr key={v.consultant_id} className="border-t border-zinc-800 text-gray-200">
                                            <td className="px-4 py-2">{v.name}</td>
                                            <td className="px-4 py-2 text-right">{v.received}</td>
                                            <td className="px-4 py-2 text-right text-green-400">{v.sold}</td>
                                            <td className="px-4 py-2 text-right text-red-400">{v.lost}</td>
                                            <td className="px-4 py-2 text-right">{(v.conversion * 100).toFixed(1)}%</td>
                                            <td className={`px-4 py-2 text-right ${v.responseRateFast >= 0.8 ? 'text-green-400' : v.responseRateFast >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {(v.responseRateFast * 100).toFixed(0)}%
                                            </td>
                                            <td className="px-4 py-2 text-right">{v.avgResponseMin.toFixed(1)}min</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
    return (
        <div className="bg-zinc-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">{label}</div>
                {icon}
            </div>
            <div className="text-2xl font-bold text-white mt-1">{value}</div>
            {sub && <div className="text-[11px] text-gray-500 mt-1">{sub}</div>}
        </div>
    );
}

function FunnelStep({ label, value, prev, good, bad }: { label: string; value: number; prev?: number; good?: boolean; bad?: boolean }) {
    const pct = prev && prev > 0 ? (value / prev) * 100 : null;
    const valueColor = good ? 'text-green-400' : bad ? 'text-red-400' : 'text-white';
    return (
        <div className="p-4">
            <div className="text-xs text-gray-400">{label}</div>
            <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
            {pct !== null && <div className="text-[11px] text-gray-500">{pct.toFixed(1)}% do total</div>}
        </div>
    );
}
