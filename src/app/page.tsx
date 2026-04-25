'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Inbox, Loader2, Trophy, X } from 'lucide-react';

/**
 * Dashboard enxuto. Sem gamificação, sem daily missions, sem 1229 linhas.
 *
 * Mostra apenas:
 *   - 4 KPIs: leads hoje, em andamento, vendidos no mês, perdidos no mês
 *   - 1 tabela: por vendedor (leads, vendidos, perdidos, conversão)
 */

interface VendorRow {
    id: string;
    name: string;
    active: number;
    sold: number;
    lost: number;
    conv: number;
}

interface Kpi {
    leadsToday: number;
    active: number;
    soldMonth: number;
    lostMonth: number;
}

const FINAL = ['vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity'];

export default function Dashboard() {
    const supabase = useMemo(() => createClient(), []);
    const [kpi, setKpi] = useState<Kpi>({ leadsToday: 0, active: 0, soldMonth: 0, lostMonth: 0 });
    const [rows, setRows] = useState<VendorRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;

        async function load() {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const [{ count: leadsToday }, { data: allLeads }, { data: consultants }] = await Promise.all([
                supabase.from('leads_unified').select('uid', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
                supabase.from('leads_unified').select('uid, status, assigned_consultant_id, created_at').gte('created_at', monthStart.toISOString()),
                supabase.from('consultants_manos_crm').select('id, name').eq('is_active', true).neq('role', 'admin'),
            ]);

            if (!alive) return;

            const leads = (allLeads || []) as any[];
            const isFinal = (s: string | null) => FINAL.includes((s || '').toLowerCase());
            const isLost = (s: string | null) => ['perdido', 'lost', 'lost_by_inactivity'].includes((s || '').toLowerCase());
            const isSold = (s: string | null) => (s || '').toLowerCase() === 'vendido';

            const active = leads.filter(l => !isFinal(l.status)).length;
            const soldMonth = leads.filter(l => isSold(l.status)).length;
            const lostMonth = leads.filter(l => isLost(l.status)).length;

            setKpi({ leadsToday: leadsToday || 0, active, soldMonth, lostMonth });

            const byVendor: VendorRow[] = (consultants || []).map((c: any) => {
                const ls = leads.filter(l => l.assigned_consultant_id === c.id);
                const sold = ls.filter(l => isSold(l.status)).length;
                const lost = ls.filter(l => isLost(l.status)).length;
                const activeCount = ls.filter(l => !isFinal(l.status)).length;
                return {
                    id: c.id,
                    name: c.name,
                    active: activeCount,
                    sold,
                    lost,
                    conv: ls.length > 0 ? sold / ls.length : 0,
                };
            }).sort((a, b) => b.sold - a.sold);

            setRows(byVendor);
            setLoading(false);
        }

        load();
        return () => { alive = false; };
    }, [supabase]);

    return (
        <div className="p-4 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-4">Dashboard</h1>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiCard title="Leads Hoje" value={kpi.leadsToday} icon={<Inbox className="w-5 h-5 text-blue-400" />} />
                <KpiCard title="Em Andamento" value={kpi.active} icon={<Loader2 className="w-5 h-5 text-yellow-400" />} />
                <KpiCard title="Vendidos (mês)" value={kpi.soldMonth} icon={<Trophy className="w-5 h-5 text-green-400" />} />
                <KpiCard title="Perdidos (mês)" value={kpi.lostMonth} icon={<X className="w-5 h-5 text-red-400" />} />
            </div>

            <div className="bg-zinc-900 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-sm font-semibold text-gray-300">Por vendedor (mês)</h2>
                </div>
                {loading ? (
                    <div className="p-6 text-gray-500 text-sm">Carregando…</div>
                ) : rows.length === 0 ? (
                    <div className="p-6 text-gray-500 text-sm">Sem vendedores ativos.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="text-gray-400 text-left">
                            <tr>
                                <th className="px-4 py-2">Vendedor</th>
                                <th className="px-4 py-2 text-right">Em Andamento</th>
                                <th className="px-4 py-2 text-right">Vendidos</th>
                                <th className="px-4 py-2 text-right">Perdidos</th>
                                <th className="px-4 py-2 text-right">Conversão</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-zinc-800 text-gray-200">
                                    <td className="px-4 py-2">{r.name}</td>
                                    <td className="px-4 py-2 text-right">{r.active}</td>
                                    <td className="px-4 py-2 text-right text-green-400">{r.sold}</td>
                                    <td className="px-4 py-2 text-right text-red-400">{r.lost}</td>
                                    <td className="px-4 py-2 text-right">{(r.conv * 100).toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function KpiCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
    return (
        <div className="bg-zinc-900 rounded-lg p-4 flex items-center justify-between">
            <div>
                <div className="text-xs text-gray-400">{title}</div>
                <div className="text-2xl font-bold text-white">{value}</div>
            </div>
            {icon}
        </div>
    );
}
