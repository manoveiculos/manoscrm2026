'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Flame,
    UserX,
    ShieldCheck,
    ArrowLeft,
    RefreshCw,
    LayoutDashboard,
    Target
} from 'lucide-react';
import Link from 'next/link';
import { ConversionTab } from './ConversionTab';

interface ConsultantRow {
    id: string;
    name: string;
    email: string;
    role: string;
    leads_assigned: number;
    sales_count: number;
    loss_count: number;
    hot_loss_count: number;
    consultant_abandoned_count: number;
    avg_response_score: number | null;
    conversion_rate: number;
    hot_loss_rate: number;
    risk_flag: 'red' | 'yellow' | 'green';
}

type Period = 'week' | 'month' | 'quarter' | 'all';

const PERIOD_LABEL: Record<Period, string> = {
    week: 'Últimos 7 dias',
    month: 'Mês atual',
    quarter: 'Últimos 90 dias',
    all: 'Sempre',
};

const FLAG_COLOR: Record<ConsultantRow['risk_flag'], string> = {
    red: 'bg-red-500/15 border-red-500/40 text-red-400',
    yellow: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400',
    green: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
};

const FLAG_LABEL: Record<ConsultantRow['risk_flag'], string> = {
    red: 'CRÍTICO',
    yellow: 'ATENÇÃO',
    green: 'OK',
};

function ScoreBar({ score }: { score: number | null }) {
    if (score === null) return <span className="text-zinc-500 text-xs">sem dados</span>;
    const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-xs font-mono text-zinc-300 w-8 text-right">{score}</span>
        </div>
    );
}

export default function PerformancePage() {
    const [rows, setRows] = useState<ConsultantRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<Period>('month');
    const [generatedAt, setGeneratedAt] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'operational' | 'conversion'>('operational');

    const load = async (p: Period = period) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/consultant-performance?period=${p}`, { cache: 'no-store' });
            const json = await res.json();
            setRows(json.consultants || []);
            setGeneratedAt(json.generated_at || '');
        } catch (err) {
            console.error('[performance] erro:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(period);
    }, [period]);

    const totals = rows.reduce(
        (acc, r) => ({
            assigned: acc.assigned + r.leads_assigned,
            sales: acc.sales + r.sales_count,
            losses: acc.losses + r.loss_count,
            hotLosses: acc.hotLosses + r.hot_loss_count,
            abandoned: acc.abandoned + r.consultant_abandoned_count,
            redCount: acc.redCount + (r.risk_flag === 'red' ? 1 : 0),
        }),
        { assigned: 0, sales: 0, losses: 0, hotLosses: 0, abandoned: 0, redCount: 0 }
    );

    return (
        <main className="min-h-screen bg-[#0C0C0F] text-zinc-100 p-6 lg:p-10">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
                    <div>
                        <Link href="/admin/sales" className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm mb-3">
                            <ArrowLeft size={14} /> Voltar para Gestão de Vendas
                        </Link>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <ShieldCheck className="text-red-500" size={28} />
                            Performance de Vendas
                        </h1>
                        <p className="text-zinc-400 text-sm mt-1">
                            {activeTab === 'operational' 
                                ? 'Auditoria de quem vende, quem perde e quem abandona leads quentes.' 
                                : 'Visão estratégica de conversão, velocidade de resposta e funil de vendas.'}
                        </p>
                    </div>

                    {/* Tabs Selector */}
                    <div className="flex p-1 bg-white/[0.03] border border-white/10 rounded-xl self-start lg:self-center">
                        <button 
                            onClick={() => setActiveTab('operational')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'operational' ? 'bg-red-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            <LayoutDashboard size={16} />
                            Operacional
                        </button>
                        <button 
                            onClick={() => setActiveTab('conversion')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'conversion' ? 'bg-red-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            <Target size={16} />
                            Inteligência
                        </button>
                    </div>

                    {activeTab === 'operational' && (
                        <div className="flex items-center gap-2">
                            <select
                                value={period}
                                onChange={(e) => setPeriod(e.target.value as Period)}
                                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                            >
                                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                                    <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => load(period)}
                                className="bg-zinc-900 border border-zinc-700 rounded-lg p-2 hover:bg-zinc-800"
                                title="Atualizar"
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    )}
                </div>

                {activeTab === 'operational' ? (
                    <>
                        {/* KPIs gerais */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
                            <KPI label="Atribuídos" value={totals.assigned} />
                            <KPI label="Vendas" value={totals.sales} accent="emerald" />
                            <KPI label="Perdas" value={totals.losses} accent="zinc" />
                            <KPI label="Perdas HOT" value={totals.hotLosses} icon={<Flame size={14} />} accent="orange" />
                            <KPI label="Vendedores em risco" value={totals.redCount} icon={<AlertTriangle size={14} />} accent={totals.redCount > 0 ? 'red' : 'emerald'} />
                        </div>

                        {/* Tabela */}
                        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-zinc-900 border-b border-zinc-800">
                                        <tr className="text-left text-xs uppercase tracking-wider text-zinc-400">
                                            <th className="px-4 py-3">Vendedor</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-right">Atribuídos</th>
                                            <th className="px-4 py-3 text-right">Vendas</th>
                                            <th className="px-4 py-3 text-right">Conv.</th>
                                            <th className="px-4 py-3 text-right">Perdas HOT</th>
                                            <th className="px-4 py-3 text-right">Abandonos IA</th>
                                            <th className="px-4 py-3">Proatividade média</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading && (
                                            <tr><td colSpan={8} className="text-center py-12 text-zinc-500">Carregando…</td></tr>
                                        )}
                                        {!loading && rows.length === 0 && (
                                            <tr><td colSpan={8} className="text-center py-12 text-zinc-500">Sem dados no período.</td></tr>
                                        )}
                                        {!loading && rows.map((r, i) => (
                                            <motion.tr
                                                key={r.id}
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.03 }}
                                                className="border-b border-zinc-800/60 hover:bg-zinc-900/40"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold">{r.name}</div>
                                                    <div className="text-xs text-zinc-500">{r.email}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-bold ${FLAG_COLOR[r.risk_flag]}`}>
                                                        {FLAG_LABEL[r.risk_flag]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">{r.leads_assigned}</td>
                                                <td className="px-4 py-3 text-right font-mono text-emerald-400">{r.sales_count}</td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                    <span className={r.conversion_rate >= 20 ? 'text-emerald-400' : r.conversion_rate >= 10 ? 'text-zinc-300' : 'text-red-400'}>
                                                        {r.conversion_rate}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                    {r.hot_loss_count > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-orange-400">
                                                            <Flame size={12} /> {r.hot_loss_count}
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-600">0</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                    {r.consultant_abandoned_count > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-red-00 font-bold">
                                                            <UserX size={12} /> {r.consultant_abandoned_count}
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-600">0</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3"><ScoreBar score={r.avg_response_score} /></td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Legenda */}
                        <div className="mt-6 text-xs text-zinc-500 space-y-1">
                            <p>
                                <strong className="text-zinc-400">Perdas HOT:</strong> leads com score IA ≥70 no momento da perda — pipeline de alto valor que escapou.
                            </p>
                            <p>
                                <strong className="text-zinc-400">Abandonos IA:</strong> perdas onde a IA leu o histórico do WhatsApp e detectou que o cliente respondeu mas o vendedor não retornou.
                            </p>
                            <p>
                                <strong className="text-zinc-400">Proatividade média:</strong> velocidade de resposta do vendedor (0-100). Penalidades por demora &gt;6h ou msgs ignoradas.
                            </p>
                            <p>
                                <strong className="text-zinc-400">Status:</strong> CRÍTICO ≥3 perdas HOT ou ≥3 abandonos IA. ATENÇÃO ≥1.
                            </p>
                            {generatedAt && (
                                <p className="pt-2 text-zinc-600">Gerado em {new Date(generatedAt).toLocaleString('pt-BR')}</p>
                            )}
                        </div>
                    </>
                ) : (
                    <ConversionTab />
                )}
            </div>
        </main>
    );
}

function KPI({
    label,
    value,
    accent = 'zinc',
    icon,
}: {
    label: string;
    value: number;
    accent?: 'emerald' | 'red' | 'orange' | 'zinc';
    icon?: React.ReactNode;
}) {
    const accentMap: Record<string, string> = {
        emerald: 'text-emerald-400',
        red: 'text-red-400',
        orange: 'text-orange-400',
        zinc: 'text-zinc-200',
    };
    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 uppercase tracking-wider mb-1.5">
                {icon}
                {label}
            </div>
            <div className={`text-2xl font-bold ${accentMap[accent]}`}>{value}</div>
        </div>
    );
}
