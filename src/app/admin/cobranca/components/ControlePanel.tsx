'use client';

import { useMemo, useState } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
    PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import { Printer, FileText, AlertTriangle, TrendingUp, Users, Scale } from 'lucide-react';
import { BillingRecord } from '@/types';

interface ControlePanelProps {
    records: BillingRecord[];
    todayStr: string; // YYYY-MM-DD
}

const PALETTE = {
    emerald: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    violet: '#8b5cf6',
    sky: '#0ea5e9',
    zinc: '#71717a',
};

function brl(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function diasAtraso(vencimento: string, todayStr: string): number {
    if (!vencimento) return 0;
    const v = new Date(vencimento + 'T00:00:00');
    const t = new Date(todayStr + 'T00:00:00');
    return Math.max(0, Math.floor((t.getTime() - v.getTime()) / (24 * 3600 * 1000)));
}

function faixa(d: number): '1_30' | '31_60' | '61_90' | 'PLUS_90' | 'EM_DIA' {
    if (d <= 0) return 'EM_DIA';
    if (d <= 30) return '1_30';
    if (d <= 60) return '31_60';
    if (d <= 90) return '61_90';
    return 'PLUS_90';
}

export default function ControlePanel({ records, todayStr }: ControlePanelProps) {
    const [printMode, setPrintMode] = useState(false);

    const stats = useMemo(() => {
        let pago = 0, aberto = 0, atrasado = 0;
        const porMes: Record<string, { mes: string; receber: number; recebido: number; atrasado: number }> = {};
        const aging: Record<string, { faixa: string; valor: number; qtd: number }> = {
            '1_30': { faixa: '1-30 dias', valor: 0, qtd: 0 },
            '31_60': { faixa: '31-60 dias', valor: 0, qtd: 0 },
            '61_90': { faixa: '61-90 dias', valor: 0, qtd: 0 },
            'PLUS_90': { faixa: '90+ dias', valor: 0, qtd: 0 },
        };
        const devedores: Record<string, { nome: string; valor: number; qtd: number }> = {};

        for (const r of records) {
            const v = Number(r.valor) || 0;
            const mesKey = (r.vencimento || '').slice(0, 7);
            if (!porMes[mesKey]) porMes[mesKey] = { mes: mesKey, receber: 0, recebido: 0, atrasado: 0 };

            if (r.status === 'PAGO') {
                pago += v;
                porMes[mesKey].recebido += v;
            } else {
                const d = diasAtraso(r.vencimento, todayStr);
                if (d > 0) {
                    atrasado += v;
                    porMes[mesKey].atrasado += v;
                    const f = faixa(d) as keyof typeof aging;
                    if (aging[f]) {
                        aging[f].valor += v;
                        aging[f].qtd += 1;
                    }
                    const nome = r.clienteFornecedor || 'Sem nome';
                    if (!devedores[nome]) devedores[nome] = { nome, valor: 0, qtd: 0 };
                    devedores[nome].valor += v;
                    devedores[nome].qtd += 1;
                } else {
                    aberto += v;
                    porMes[mesKey].receber += v;
                }
            }
        }

        const total = pago + aberto + atrasado;
        const taxaInad = total > 0 ? (atrasado / total) * 100 : 0;
        const taxaRecuperacao = total > 0 ? (pago / total) * 100 : 0;

        const topDevedores = Object.values(devedores)
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 10);

        const candidatosJuridico = Object.values(devedores).filter((_, idx) => {
            // candidato = dívidas com 90+ dias OU acumulado > R$ 5.000
            return false; // recalculado abaixo com base no record
        });

        const juridicoList = records
            .filter(r => r.status !== 'PAGO' && diasAtraso(r.vencimento, todayStr) > 90)
            .sort((a, b) => Number(b.valor) - Number(a.valor));

        return {
            pago, aberto, atrasado, total, taxaInad, taxaRecuperacao,
            porMes: Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)),
            aging: Object.values(aging),
            topDevedores,
            juridicoList,
            distribStatus: [
                { name: 'Recebido', value: pago, color: PALETTE.emerald },
                { name: 'Em aberto', value: aberto, color: PALETTE.sky },
                { name: 'Atrasado', value: atrasado, color: PALETTE.red },
            ],
        };
    }, [records, todayStr]);

    const handlePrint = () => {
        setPrintMode(true);
        setTimeout(() => {
            window.print();
            setTimeout(() => setPrintMode(false), 500);
        }, 100);
    };

    return (
        <div className={`space-y-6 ${printMode ? 'print-mode' : ''}`}>
            {/* Print styles */}
            <style jsx global>{`
                @media print {
                    body { background: white !important; color: black !important; }
                    .no-print { display: none !important; }
                    .print-mode .recharts-text { fill: black !important; }
                    .print-mode { color: black !important; }
                    .print-mode * { color: black !important; border-color: #ccc !important; }
                    .print-mode .bg-zinc-900\\/40,
                    .print-mode .bg-zinc-950\\/40 { background: white !important; }
                    @page { size: A4; margin: 1.5cm; }
                }
            `}</style>

            {/* Print-only header */}
            <div className="hidden print:block mb-6 pb-3 border-b-2 border-black">
                <h1 className="text-2xl font-black">Manos Veículos — Relatório de Cobrança</h1>
                <p className="text-sm">Gerado em {new Date().toLocaleString('pt-BR')}</p>
            </div>

            {/* Action bar (no print) */}
            <div className="flex items-center justify-between no-print">
                <div>
                    <h3 className="text-sm font-black text-white">Controle Geral & Relatórios</h3>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                        Análise consolidada de inadimplência, acordos e indicadores para prestação de contas.
                    </p>
                </div>
                <button
                    onClick={handlePrint}
                    className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-violet-900/20 transition-all"
                >
                    <Printer className="w-4 h-4" />
                    Gerar Relatório (Imprimir / PDF)
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                    label="Taxa de Recuperação"
                    value={`${stats.taxaRecuperacao.toFixed(1)}%`}
                    sub={brl(stats.pago)}
                    color="emerald"
                    icon={<TrendingUp className="w-4 h-4" />}
                />
                <KpiCard
                    label="Taxa de Inadimplência"
                    value={`${stats.taxaInad.toFixed(1)}%`}
                    sub={brl(stats.atrasado)}
                    color="red"
                    icon={<AlertTriangle className="w-4 h-4" />}
                />
                <KpiCard
                    label="Devedores Únicos"
                    value={String(stats.topDevedores.length > 0 ? new Set(stats.topDevedores.map(d => d.nome)).size : 0)}
                    sub="com débito ativo"
                    color="amber"
                    icon={<Users className="w-4 h-4" />}
                />
                <KpiCard
                    label="Candidatos Jurídico"
                    value={String(stats.juridicoList.length)}
                    sub="atraso > 90 dias"
                    color="violet"
                    icon={<Scale className="w-4 h-4" />}
                />
            </div>

            {/* Charts grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Distribuição Status */}
                <ChartCard title="Distribuição por Status">
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <Pie
                                data={stats.distribStatus}
                                cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                                paddingAngle={2} dataKey="value"
                                label={(e: any) => `${e.name}: ${((e.percent || 0) * 100).toFixed(0)}%`}
                            >
                                {stats.distribStatus.map((entry, i) => (
                                    <Cell key={i} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a' }} />
                            <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Aging (idade da dívida) */}
                <ChartCard title="Idade da Dívida (Aging)">
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={stats.aging}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="faixa" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip
                                formatter={(v: any) => brl(Number(v))}
                                contentStyle={{ background: '#18181b', border: '1px solid #27272a' }}
                            />
                            <Bar dataKey="valor" fill={PALETTE.red} radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Evolução mensal */}
                <ChartCard title="Recebimento vs Inadimplência por Mês" full>
                    <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={stats.porMes}>
                            <defs>
                                <linearGradient id="gRecebido" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={PALETTE.emerald} stopOpacity={0.5} />
                                    <stop offset="100%" stopColor={PALETTE.emerald} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gAtrasado" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={PALETTE.red} stopOpacity={0.5} />
                                    <stop offset="100%" stopColor={PALETTE.red} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="mes" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a' }} />
                            <Legend wrapperStyle={{ fontSize: '11px' }} />
                            <Area type="monotone" dataKey="recebido" stroke={PALETTE.emerald} fillOpacity={1} fill="url(#gRecebido)" name="Recebido" />
                            <Area type="monotone" dataKey="atrasado" stroke={PALETTE.red} fillOpacity={1} fill="url(#gAtrasado)" name="Atrasado" />
                            <Line type="monotone" dataKey="receber" stroke={PALETTE.sky} strokeWidth={2} dot={false} name="A receber" />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Top 10 devedores */}
            <ReportSection title="TOP 10 Devedores">
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.topDevedores} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <YAxis dataKey="nome" type="category" tick={{ fill: '#a1a1aa', fontSize: 10 }} width={150} />
                        <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a' }} />
                        <Bar dataKey="valor" fill={PALETTE.amber} radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </ReportSection>

            {/* Tabela: candidatos a jurídico */}
            <ReportSection title={`Cobrança Jurídica — Candidatos (${stats.juridicoList.length})`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-zinc-800 text-zinc-500 font-bold">
                                <th className="p-2">Cliente</th>
                                <th className="p-2">CPF/CNPJ</th>
                                <th className="p-2">Vencimento</th>
                                <th className="p-2">Dias Atraso</th>
                                <th className="p-2 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.juridicoList.slice(0, 50).map(r => {
                                const d = diasAtraso(r.vencimento, todayStr);
                                return (
                                    <tr key={r.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                                        <td className="p-2 font-bold text-white uppercase">{r.clienteFornecedor}</td>
                                        <td className="p-2 font-mono text-zinc-400">{r.cpfCnpj}</td>
                                        <td className="p-2 font-mono text-zinc-400">{r.vencimento}</td>
                                        <td className="p-2 font-mono font-black text-red-400">{d}</td>
                                        <td className="p-2 font-mono font-black text-sky-400 text-right">{brl(Number(r.valor))}</td>
                                    </tr>
                                );
                            })}
                            {stats.juridicoList.length === 0 && (
                                <tr><td colSpan={5} className="p-6 text-center text-zinc-500">Nenhum candidato a jurídico no momento.</td></tr>
                            )}
                        </tbody>
                        {stats.juridicoList.length > 0 && (
                            <tfoot>
                                <tr className="border-t-2 border-zinc-700 font-black">
                                    <td colSpan={4} className="p-2 text-white">TOTAL</td>
                                    <td className="p-2 text-right text-red-400 font-mono">
                                        {brl(stats.juridicoList.reduce((s, r) => s + Number(r.valor), 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </ReportSection>

            {/* Posição financeira consolidada (print friendly) */}
            <ReportSection title="Posição Financeira Consolidada">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <PosLine label="Total Geral" value={stats.total} />
                    <PosLine label="Já Recebido" value={stats.pago} color="emerald" />
                    <PosLine label="Em Aberto (no prazo)" value={stats.aberto} color="sky" />
                    <PosLine label="Inadimplente" value={stats.atrasado} color="red" />
                    <PosLine label="1-30 dias" value={stats.aging[0]?.valor || 0} />
                    <PosLine label="31-60 dias" value={stats.aging[1]?.valor || 0} />
                    <PosLine label="61-90 dias" value={stats.aging[2]?.valor || 0} />
                    <PosLine label="90+ dias" value={stats.aging[3]?.valor || 0} color="red" />
                </div>
            </ReportSection>
        </div>
    );
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: React.ReactNode }) {
    const colorMap: Record<string, string> = {
        emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
        red: 'text-red-400 border-red-500/20 bg-red-500/5',
        amber: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
        violet: 'text-violet-400 border-violet-500/20 bg-violet-500/5',
    };
    return (
        <div className={`p-4 rounded-2xl border ${colorMap[color]}`}>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider opacity-80">
                {icon} {label}
            </div>
            <div className={`text-2xl font-black mt-2 ${colorMap[color].split(' ')[0]}`}>{value}</div>
            <div className="text-[10px] text-zinc-400 mt-1">{sub}</div>
        </div>
    );
}

function ChartCard({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={`p-4 bg-zinc-900/40 border border-zinc-800 rounded-2xl ${full ? 'lg:col-span-2' : ''}`}>
            <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-violet-400" />
                {title}
            </h4>
            {children}
        </div>
    );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="p-5 bg-zinc-900/40 border border-zinc-800 rounded-2xl break-inside-avoid print:break-inside-avoid">
            <h4 className="text-xs font-black text-white uppercase tracking-wider mb-3 pb-2 border-b border-zinc-800">{title}</h4>
            {children}
        </div>
    );
}

function PosLine({ label, value, color }: { label: string; value: number; color?: string }) {
    const colorMap: Record<string, string> = {
        emerald: 'text-emerald-400',
        red: 'text-red-400',
        sky: 'text-sky-400',
    };
    return (
        <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-xl">
            <div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{label}</div>
            <div className={`text-sm font-black font-mono mt-1 ${color ? colorMap[color] : 'text-white'}`}>{brl(value)}</div>
        </div>
    );
}
