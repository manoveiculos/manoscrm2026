'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { Bot, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Users } from 'lucide-react';

const CAT_LABELS: Record<string, string> = {
    score_alto_demais: 'Score alto demais',
    score_baixo_demais: 'Score baixo demais',
    lead_morto: 'Lead morto / SPAM',
    lead_quente_ignorado: 'Quente ignorado',
    status_errado: 'Etapa errada',
};

const CAT_COLORS: Record<string, string> = {
    score_alto_demais: '#f87171',
    score_baixo_demais: '#fb923c',
    lead_morto: '#a78bfa',
    lead_quente_ignorado: '#34d399',
    status_errado: '#60a5fa',
};

interface FeedbackRow {
    id: string;
    category: string;
    reported_score: number;
    correct_label: string;
    reported_label: string;
    reported_by: string;
    created_at: string;
    reason: string;
    lead_status: string;
}

interface WeekBucket {
    week: string;
    total: number;
    [cat: string]: number | string;
}

export default function AICalibrationPage() {
    const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<30 | 60 | 90>(30);

    useEffect(() => {
        loadData();
    }, [range]);

    async function loadData() {
        setLoading(true);
        const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
            .from('ai_feedback')
            .select('id, category, reported_score, correct_label, reported_label, reported_by, created_at, reason, lead_status')
            .gte('created_at', since)
            .order('created_at', { ascending: true });
        setFeedbacks(data || []);
        setLoading(false);
    }

    // Contagem por categoria
    const catCounts = feedbacks.reduce<Record<string, number>>((acc, f) => {
        acc[f.category] = (acc[f.category] || 0) + 1;
        return acc;
    }, {});

    const catData = Object.entries(catCounts)
        .map(([cat, count]) => ({ cat, label: CAT_LABELS[cat] || cat, count }))
        .sort((a, b) => b.count - a.count);

    const totalFeedbacks = feedbacks.length;
    const topError = catData[0];

    // Score médio reportado vs expectativa
    const avgReported = feedbacks.length
        ? Math.round(feedbacks.reduce((s, f) => s + (f.reported_score || 0), 0) / feedbacks.length)
        : 0;

    // Consultores que mais reportam
    const consultorCounts = feedbacks.reduce<Record<string, number>>((acc, f) => {
        if (f.reported_by) acc[f.reported_by] = (acc[f.reported_by] || 0) + 1;
        return acc;
    }, {});
    const topConsultors = Object.entries(consultorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    // Série temporal por semana
    const weekMap: Record<string, WeekBucket> = {};
    for (const f of feedbacks) {
        const d = new Date(f.created_at);
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const key = monday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (!weekMap[key]) weekMap[key] = { week: key, total: 0 };
        weekMap[key].total++;
        weekMap[key][f.category] = ((weekMap[key][f.category] as number) || 0) + 1;
    }
    const weekData = Object.values(weekMap);

    // Últimos 10 feedbacks
    const recent = [...feedbacks].reverse().slice(0, 10);

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                        <Bot size={18} className="text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">Calibração da IA</h1>
                        <p className="text-[12px] text-white/40">Acurácia e padrões de erro detectados pelos consultores</p>
                    </div>
                </div>

                {/* Range selector */}
                <div className="flex gap-1 bg-white/[0.04] border border-white/[0.07] rounded-lg p-1">
                    {([30, 60, 90] as const).map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${range === r ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white/70'}`}
                        >
                            {r}d
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64 text-white/30 text-sm">Carregando dados…</div>
            ) : totalFeedbacks === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                    <CheckCircle size={32} className="text-green-400/50" />
                    <p className="text-white/40 text-sm">Nenhum feedback de calibração nos últimos {range} dias.</p>
                    <p className="text-white/25 text-xs">Os consultores podem corrigir scores na tela de lead.</p>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KpiCard
                            label="Total de correções"
                            value={totalFeedbacks}
                            icon={<AlertTriangle size={15} className="text-amber-400" />}
                            color="amber"
                        />
                        <KpiCard
                            label="Score médio corrigido"
                            value={`${avgReported}%`}
                            icon={<TrendingDown size={15} className="text-red-400" />}
                            color="red"
                            sub="score que a IA atribuiu"
                        />
                        <KpiCard
                            label="Erro mais frequente"
                            value={topError ? CAT_LABELS[topError.cat] || topError.cat : '—'}
                            icon={<Bot size={15} className="text-violet-400" />}
                            color="violet"
                            sub={topError ? `${topError.count} ocorrências` : ''}
                            small
                        />
                        <KpiCard
                            label="Consultores ativos"
                            value={Object.keys(consultorCounts).length}
                            icon={<Users size={15} className="text-blue-400" />}
                            color="blue"
                            sub="reportaram erros"
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Erros por categoria */}
                        <div className="bg-[#111114] border border-white/[0.07] rounded-xl p-4">
                            <p className="text-[12px] font-semibold text-white/50 uppercase tracking-widest mb-4">Erros por categoria</p>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={catData} layout="vertical" margin={{ left: 0, right: 16 }}>
                                    <XAxis type="number" tick={{ fontSize: 11, fill: '#ffffff40' }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#ffffff60' }} axisLine={false} tickLine={false} width={130} />
                                    <Tooltip
                                        contentStyle={{ background: '#18181b', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }}
                                        labelStyle={{ color: '#ffffff80' }}
                                        itemStyle={{ color: '#ffffffcc' }}
                                    />
                                    <Bar dataKey="count" radius={4} maxBarSize={20}>
                                        {catData.map((entry) => (
                                            <Cell key={entry.cat} fill={CAT_COLORS[entry.cat] || '#6366f1'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Tendência semanal */}
                        <div className="bg-[#111114] border border-white/[0.07] rounded-xl p-4">
                            <p className="text-[12px] font-semibold text-white/50 uppercase tracking-widest mb-4">Correções por semana</p>
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={weekData} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#ffffff40' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#ffffff40' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: '#18181b', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }}
                                        itemStyle={{ color: '#ffffffcc' }}
                                    />
                                    <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }} name="Total" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Top consultores que mais corrigem */}
                        <div className="bg-[#111114] border border-white/[0.07] rounded-xl p-4">
                            <p className="text-[12px] font-semibold text-white/50 uppercase tracking-widest mb-4">Consultores que mais corrigiram a IA</p>
                            <div className="space-y-2">
                                {topConsultors.map(([name, count], i) => (
                                    <div key={name} className="flex items-center gap-3">
                                        <span className="text-[11px] text-white/25 w-4">{i + 1}</span>
                                        <div className="flex-1 h-2 bg-white/[0.05] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-violet-500/60 rounded-full"
                                                style={{ width: `${Math.round((count / (topConsultors[0]?.[1] || 1)) * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-[12px] text-white/70 w-28 truncate">{name}</span>
                                        <span className="text-[12px] text-white/40">{count}x</span>
                                    </div>
                                ))}
                                {topConsultors.length === 0 && (
                                    <p className="text-[12px] text-white/25">Nenhum dado disponível.</p>
                                )}
                            </div>
                        </div>

                        {/* Últimas 10 correções */}
                        <div className="bg-[#111114] border border-white/[0.07] rounded-xl p-4">
                            <p className="text-[12px] font-semibold text-white/50 uppercase tracking-widest mb-4">Últimas correções</p>
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {recent.map(f => (
                                    <div key={f.id} className="flex gap-3 items-start">
                                        <span
                                            className="mt-0.5 h-2 w-2 rounded-full shrink-0"
                                            style={{ background: CAT_COLORS[f.category] || '#6366f1' }}
                                        />
                                        <div className="min-w-0">
                                            <p className="text-[11px] text-white/70 leading-snug truncate">
                                                <span className="text-white/40">{f.reported_by || 'Consultor'}</span>
                                                {' — '}{CAT_LABELS[f.category] || f.category}
                                            </p>
                                            {f.reason && (
                                                <p className="text-[10px] text-white/30 truncate mt-0.5">"{f.reason}"</p>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-white/20 shrink-0 mt-0.5">
                                            {new Date(f.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Insight automático */}
                    {topError && topError.count >= 3 && (
                        <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-4 flex gap-3">
                            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[13px] font-semibold text-amber-300">Padrão de erro detectado</p>
                                <p className="text-[12px] text-white/50 mt-1">
                                    O erro <strong className="text-white/70">"{CAT_LABELS[topError.cat]}"</strong> ocorreu{' '}
                                    <strong className="text-amber-300">{topError.count} vezes</strong> nos últimos {range} dias.
                                    Este padrão já está sendo injetado automaticamente nos prompts de scoring via{' '}
                                    <code className="text-white/40 text-[11px]">aiFeedbackService</code>.
                                </p>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function KpiCard({ label, value, icon, color, sub, small = false }: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    sub?: string;
    small?: boolean;
}) {
    const bg: Record<string, string> = {
        amber: 'bg-amber-500/10 border-amber-500/15',
        red: 'bg-red-500/10 border-red-500/15',
        violet: 'bg-violet-500/10 border-violet-500/15',
        blue: 'bg-blue-500/10 border-blue-500/15',
    };
    return (
        <div className={`rounded-xl border p-4 ${bg[color] || 'bg-white/[0.04] border-white/[0.07]'}`}>
            <div className="flex items-center gap-2 mb-2">{icon}<span className="text-[11px] text-white/40">{label}</span></div>
            <p className={`font-bold text-white leading-tight ${small ? 'text-[13px]' : 'text-2xl'}`}>{value}</p>
            {sub && <p className="text-[10px] text-white/30 mt-1">{sub}</p>}
        </div>
    );
}
