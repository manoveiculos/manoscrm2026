'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
    ComposedChart, Line, Area, AreaChart, Legend,
} from 'recharts';
import {
    Wallet, Car, Target, TrendingUp, Clock, CheckCircle2,
    Search, Pencil, Trash2, ShoppingCart, Flame, Package,
    ThumbsUp, Copy, Printer, TrendingDown,
} from 'lucide-react';
import { brl, brlK, pct, dateBR, Kpi, StatusBadge, Card, SEV, CHART, Dados, Veiculo } from './shared';

const VEREDITO_UI: Record<string, { label: string; cls: string }> = {
    no_ritmo: { label: 'No ritmo de dobrar', cls: 'text-green-400 border-green-500/30 bg-green-500/5' },
    atencao: { label: 'Atenção — abaixo do alvo', cls: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5' },
    critico: { label: 'Crítico — não cobre a parcela', cls: 'text-red-400 border-red-500/30 bg-red-500/5' },
    sem_dados: { label: 'Sem vendas ainda', cls: 'text-gray-400 border-zinc-700 bg-zinc-800/40' },
};

const tip = { contentStyle: { background: CHART.tipBg, border: `1px solid ${CHART.tipBorder}`, borderRadius: 8 } };

// ═══════════════════════════════════════════════════════════════════════
// VISÃO GERAL
// ═══════════════════════════════════════════════════════════════════════
export function OverviewTab({ data, onTogglePagaParcela }: { data: Dados; onTogglePagaParcela: (p: any) => void }) {
    const c = data.capital, e = data.emprestimo, g = data.giro, v = data.veredito, cfg = data.config;
    const vu = VEREDITO_UI[v?.status] || VEREDITO_UI.sem_dados;
    const prog = Math.min(1, Math.max(0, v?.progresso_meta || 0));
    const progEst = Math.min(1, Math.max(0, v?.progresso_com_estoque || 0));

    // Lucro acumulado por mês vs meta
    const acumulado = useMemo(() => {
        let acc = 0;
        return (data.mensal || []).map((m) => { acc += m.lucro; return { label: m.label, acumulado: acc }; });
    }, [data.mensal]);

    return (
        <>
            {/* Veredito */}
            <div className={`rounded-xl border p-5 mb-6 ${vu.cls}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-widest opacity-70">Veredito</div>
                        <div className="text-xl font-black">{vu.label}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] uppercase tracking-widest opacity-70">Líquido se liquidar hoje</div>
                        <div className={`text-xl font-black ${(v.liquido_no_bolso || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{brl(v.liquido_no_bolso)}</div>
                    </div>
                </div>
                <div className="mb-2 flex justify-between text-[11px] text-gray-300">
                    <span>Lucro realizado: <b className="text-white">{brl(c.lucro_realizado)}</b></span>
                    <span>Meta de lucro: <b className="text-white">{brl(cfg.meta_trading)}</b></span>
                </div>
                <div className="relative h-4 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-white/15" style={{ width: `${progEst * 100}%` }} title="Com estoque a mercado" />
                    <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-green-500" style={{ width: `${prog * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[12px] text-gray-300">
                    <span>Realizado: <b className="text-white">{pct(prog)}</b></span>
                    <span>+ Estoque a mercado: <b className="text-white">{pct(progEst)}</b></span>
                    <span>Lucro médio/mês: <b className="text-white">{brl(v.lucro_mensal_medio)}</b></span>
                    <span>Cobertura da parcela: <b className={v.cobertura_parcela >= 1 ? 'text-green-400' : 'text-yellow-400'}>{pct(v.cobertura_parcela)}</b></span>
                    {v.meses_para_meta != null && <span>No ritmo, meta em <b className="text-white">{v.meses_para_meta.toFixed(0)} meses</b></span>}
                </div>
            </div>

            {/* KPIs de capital */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Kpi icon={<Wallet className="w-5 h-5 text-emerald-400" />} label="Caixa livre" value={brl(c.caixa_livre)} sub="não aplicado em carros" />
                <Kpi icon={<Car className="w-5 h-5 text-blue-400" />} label="Imobilizado em carros" value={brl(c.custo_imobilizado)} sub={`${c.carros_estoque} no estoque (a custo)`} />
                <Kpi icon={<TrendingUp className="w-5 h-5 text-green-400" />} label="Lucro realizado" value={brl(c.lucro_realizado)} sub={`${c.carros_vendidos} vendidos`} accent="text-green-400" />
                <Kpi icon={<Target className="w-5 h-5 text-purple-400" />} label="Patrimônio do fundo" value={brl(c.patrimonio_mercado)} sub={`a mercado · custo ${brl(c.patrimonio_custo)}`} />
            </div>

            {/* Pontos de atenção */}
            <Card title={`Pontos de atenção (${data.atencao?.length || 0})`} className="mb-6">
                {(!data.atencao || data.atencao.length === 0) ? (
                    <div className="p-6 text-center text-[13px] text-green-400 flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Nenhum alerta. Fundo saudável.
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800">
                        {data.atencao.map((a, i) => {
                            const s = SEV[a.severidade];
                            return (
                                <div key={i} className={`px-4 py-2.5 flex items-start gap-3 border-l-2 ${s.cls}`}>
                                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                                    <div>
                                        <div className="text-[13px] font-medium text-white">{a.titulo}</div>
                                        <div className="text-[12px] text-gray-400">{a.detalhe}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* Empréstimo + Giro */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card title="Empréstimo" className="p-0">
                    <div className="p-4">
                        <div className="grid grid-cols-3 gap-3 text-center mb-3">
                            <div><div className="text-[11px] text-gray-500">Saldo devedor</div><div className="text-lg font-bold text-white">{brl(e.saldo_devedor)}</div></div>
                            <div><div className="text-[11px] text-gray-500">Pagas</div><div className="text-lg font-bold text-white">{e.parcelas_pagas}/{e.parcelas_total}</div></div>
                            <div><div className="text-[11px] text-gray-500">Total a pagar</div><div className="text-lg font-bold text-white">{brl(e.total_pagar)}</div></div>
                        </div>
                        {e.em_carencia ? (
                            <div className="text-[12px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded p-2 flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Carência: faltam <b>{e.dias_carencia} dias</b> para a 1ª parcela ({dateBR(cfg.primeira_parcela)}). Gire o capital nesse colchão.
                            </div>
                        ) : e.proxima_parcela ? (
                            <div className="text-[12px] text-yellow-300 bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
                                Próxima: parcela {e.proxima_parcela.numero} de {brl(e.proxima_parcela.valor)} em {dateBR(e.proxima_parcela.vencimento)}
                            </div>
                        ) : <div className="text-[12px] text-green-400">Empréstimo quitado 🎉</div>}
                    </div>
                </Card>

                <Card title="Giro do capital" className="p-0">
                    <div className="p-4">
                        <div className="grid grid-cols-3 gap-3 text-center mb-3">
                            <div><div className="text-[11px] text-gray-500">Giro médio</div><div className="text-lg font-bold text-white">{g.giro_medio_dias != null ? `${g.giro_medio_dias.toFixed(0)}d` : '—'}</div></div>
                            <div><div className="text-[11px] text-gray-500">Margem média</div><div className="text-lg font-bold text-white">{pct(g.margem_media)}</div></div>
                            <div><div className="text-[11px] text-gray-500">Sangria/dia</div><div className="text-lg font-bold text-red-400">{brl(g.sangria_diaria)}</div></div>
                        </div>
                        {g.encalhados.length > 0 ? (
                            <div className="text-[12px] text-red-300 bg-red-500/5 border border-red-500/20 rounded p-2">
                                <b>{g.encalhados.length} carro(s) encalhado(s)</b> (+{g.encalhe_dias}d parados): {g.encalhados.map((x: any) => `${x.marca} ${x.modelo}`).join(', ')}
                            </div>
                        ) : <div className="text-[12px] text-gray-500">Nenhum carro encalhado (limite {g.encalhe_dias} dias). Capital girando bem.</div>}
                    </div>
                </Card>
            </div>

            {/* Lucro acumulado vs meta */}
            {acumulado.length > 0 && (
                <Card title="Lucro acumulado (rumo à meta de trading)" className="mb-6 p-0">
                    <div className="p-4">
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={acumulado} margin={{ left: 6, right: 6 }}>
                                <defs>
                                    <linearGradient id="gAcc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={CHART.green} stopOpacity={0.5} />
                                        <stop offset="100%" stopColor={CHART.green} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                                <XAxis dataKey="label" stroke={CHART.axis} fontSize={11} />
                                <YAxis stroke={CHART.axis} fontSize={11} tickFormatter={(n) => brlK(n)} />
                                <Tooltip {...tip} formatter={(n: any) => brl(n)} />
                                <Area type="monotone" dataKey="acumulado" name="Lucro acum." stroke={CHART.green} strokeWidth={2} fill="url(#gAcc)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            {/* Parcelas */}
            <Card title="Parcelas do empréstimo" className="p-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 p-3">
                    {data.parcelas.map((p: any) => (
                        <button key={p.id} onClick={() => onTogglePagaParcela(p)}
                            className={`text-left rounded-lg border p-2 transition-colors ${p.paga ? 'border-green-500/30 bg-green-500/5' : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-600'}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-gray-500">#{p.numero}</span>
                                {p.paga ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Clock className="w-3.5 h-3.5 text-gray-600" />}
                            </div>
                            <div className="text-[12px] font-semibold text-white">{brl(p.valor)}</div>
                            <div className="text-[10px] text-gray-500">{dateBR(p.vencimento)}</div>
                        </button>
                    ))}
                </div>
            </Card>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// ESTOQUE
// ═══════════════════════════════════════════════════════════════════════
type SortKey = 'dias' | 'custo' | 'potencial' | 'recente';
export function EstoqueTab({ data, onEdit, onRemove }: { data: Dados; onEdit: (v: Veiculo) => void; onRemove: (v: Veiculo) => void }) {
    const [q, setQ] = useState('');
    const [status, setStatus] = useState<'ativos' | 'estoque' | 'reservado' | 'devolvido'>('ativos');
    const [sort, setSort] = useState<SortKey>('dias');

    const naoVendidos = data.veiculos.filter((v) => v.status !== 'vendido');
    const custoAtivo = naoVendidos.filter((v) => v.status === 'estoque' || v.status === 'reservado').reduce((s, v) => s + v.custo_total, 0);
    const potencialAtivo = naoVendidos.filter((v) => v.status === 'estoque' || v.status === 'reservado').reduce((s, v) => s + (v.lucro_potencial || 0), 0);

    const filtrados = useMemo(() => {
        const nq = q.trim().toLowerCase();
        let list = naoVendidos.filter((v) => {
            if (status === 'ativos') { if (v.status !== 'estoque' && v.status !== 'reservado') return false; }
            else if (v.status !== status) return false;
            if (!nq) return true;
            return `${v.marca} ${v.modelo} ${v.versao || ''} ${v.placa || ''} ${v.ano || ''}`.toLowerCase().includes(nq);
        });
        list = [...list].sort((a, b) => {
            if (sort === 'dias') return b.dias_estoque - a.dias_estoque;
            if (sort === 'custo') return b.custo_total - a.custo_total;
            if (sort === 'potencial') return (b.lucro_potencial || 0) - (a.lucro_potencial || 0);
            return new Date(b.data_compra || 0).getTime() - new Date(a.data_compra || 0).getTime();
        });
        return list;
    }, [naoVendidos, q, status, sort]);

    const diasChart = useMemo(() =>
        [...filtrados].sort((a, b) => b.dias_estoque - a.dias_estoque).slice(0, 12)
            .map((v) => ({ nome: `${v.marca} ${v.modelo}`.slice(0, 16), dias: v.dias_estoque })), [filtrados]);

    const StatusChip = ({ k, label }: { k: typeof status; label: string }) => (
        <button onClick={() => setStatus(k)} className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${status === k ? 'bg-red-600 border-red-500 text-white' : 'border-zinc-700 text-gray-400 hover:border-zinc-500'}`}>{label}</button>
    );

    return (
        <>
            <div className="grid grid-cols-3 gap-3 mb-4">
                <Kpi icon={<Package className="w-5 h-5 text-blue-400" />} label="Em estoque" value={String(naoVendidos.filter(v => v.status === 'estoque' || v.status === 'reservado').length)} sub="carros ativos" />
                <Kpi icon={<Wallet className="w-5 h-5 text-amber-400" />} label="Capital imobilizado" value={brl(custoAtivo)} sub="a custo" />
                <Kpi icon={<TrendingUp className="w-5 h-5 text-green-400" />} label="Lucro potencial" value={brl(potencialAtivo)} sub="se vender a mercado" accent="text-green-400" />
            </div>

            {diasChart.length > 0 && (
                <Card title="Dias em estoque (mais parados no topo)" className="mb-4 p-0">
                    <div className="p-4">
                        <ResponsiveContainer width="100%" height={Math.max(140, diasChart.length * 26)}>
                            <BarChart data={diasChart} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                                <XAxis type="number" stroke={CHART.axis} fontSize={11} />
                                <YAxis type="category" dataKey="nome" stroke={CHART.axis} fontSize={10} width={110} />
                                <Tooltip {...tip} formatter={(n: any) => `${n} dias`} />
                                <Bar dataKey="dias" radius={[0, 4, 4, 0]}>
                                    {diasChart.map((x, i) => <Cell key={i} fill={x.dias >= 60 ? CHART.red : x.dias >= 45 ? CHART.amber : CHART.blue} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            <Card className="p-0">
                <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca, modelo, placa…"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-2 py-1.5 text-sm text-white focus:border-red-500 outline-none" />
                    </div>
                    <div className="flex items-center gap-1"><StatusChip k="ativos" label="Ativos" /><StatusChip k="estoque" label="Estoque" /><StatusChip k="reservado" label="Reservado" /><StatusChip k="devolvido" label="Devolvido" /></div>
                    <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-white outline-none">
                        <option value="dias">Mais parados</option>
                        <option value="custo">Maior custo</option>
                        <option value="potencial">Maior potencial</option>
                        <option value="recente">Mais recentes</option>
                    </select>
                </div>
                {filtrados.length === 0 ? (
                    <div className="p-6 text-gray-500 text-sm text-center">Nenhum carro encontrado.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-gray-400 text-left">
                                <tr className="text-[11px] uppercase">
                                    <th className="px-3 py-2">Carro</th>
                                    <th className="px-3 py-2 text-right">Custo</th>
                                    <th className="px-3 py-2 text-right">FIPE</th>
                                    <th className="px-3 py-2 text-right">Anúncio</th>
                                    <th className="px-3 py-2 text-right">Potencial</th>
                                    <th className="px-3 py-2 text-right">Dias</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrados.map((vc) => (
                                    <tr key={vc.id} className="border-t border-zinc-800 text-gray-200">
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-white">{vc.marca} {vc.modelo}</div>
                                            <div className="text-[11px] text-gray-500">{[vc.versao, vc.ano, vc.placa, vc.km ? `${Number(vc.km).toLocaleString('pt-BR')}km` : null].filter(Boolean).join(' · ')}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right">{brl(vc.custo_total)}</td>
                                        <td className="px-3 py-2 text-right text-gray-400">{vc.valor_fipe ? brl(vc.valor_fipe) : '—'}</td>
                                        <td className="px-3 py-2 text-right text-gray-400">{vc.valor_anuncio ? brl(vc.valor_anuncio) : '—'}</td>
                                        <td className={`px-3 py-2 text-right font-semibold ${vc.lucro_potencial == null ? 'text-gray-500' : vc.lucro_potencial >= 0 ? 'text-green-400' : 'text-red-400'}`}>{vc.lucro_potencial == null ? '—' : brl(vc.lucro_potencial)}</td>
                                        <td className={`px-3 py-2 text-right ${vc.dias_estoque >= 60 ? 'text-red-400 font-semibold' : vc.dias_estoque >= 45 ? 'text-amber-400' : ''}`}>{vc.dias_estoque}d</td>
                                        <td className="px-3 py-2"><StatusBadge status={vc.status} /></td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            <button onClick={() => onEdit(vc)} className="p-1.5 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => onRemove(vc)} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// VENDIDOS
// ═══════════════════════════════════════════════════════════════════════
export function VendidosTab({ data, onEdit }: { data: Dados; onEdit: (v: Veiculo) => void }) {
    const [q, setQ] = useState('');
    const vendidos = useMemo(() => data.veiculos.filter((v) => v.status === 'vendido')
        .sort((a, b) => new Date(b.data_venda || 0).getTime() - new Date(a.data_venda || 0).getTime()), [data.veiculos]);

    const filtrados = vendidos.filter((v) => !q.trim() || `${v.marca} ${v.modelo} ${v.versao || ''}`.toLowerCase().includes(q.trim().toLowerCase()));

    const totalLucro = vendidos.reduce((s, v) => s + (v.lucro || 0), 0);
    const totalReceita = vendidos.reduce((s, v) => s + (v.valor_venda || 0), 0);
    const giroMedio = vendidos.length ? Math.round(vendidos.reduce((s, v) => s + v.dias_estoque, 0) / vendidos.length) : 0;

    const lucroChart = useMemo(() => vendidos.map((v) => ({ nome: `${v.marca} ${v.modelo}`.slice(0, 18), lucro: v.lucro || 0 }))
        .sort((a, b) => b.lucro - a.lucro).slice(0, 14), [vendidos]);

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Kpi icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label="Vendidos" value={String(vendidos.length)} sub="carros no fundo" />
                <Kpi icon={<TrendingUp className="w-5 h-5 text-green-400" />} label="Lucro realizado" value={brl(totalLucro)} accent="text-green-400" />
                <Kpi icon={<Wallet className="w-5 h-5 text-blue-400" />} label="Receita" value={brl(totalReceita)} />
                <Kpi icon={<Clock className="w-5 h-5 text-amber-400" />} label="Giro médio" value={`${giroMedio}d`} sub="compra → venda" />
            </div>

            {lucroChart.length > 0 && (
                <Card title="Lucro por carro vendido" className="mb-4 p-0">
                    <div className="p-4">
                        <ResponsiveContainer width="100%" height={Math.max(160, lucroChart.length * 26)}>
                            <BarChart data={lucroChart} layout="vertical" margin={{ left: 30 }}>
                                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                                <XAxis type="number" stroke={CHART.axis} fontSize={11} tickFormatter={(n) => brlK(n)} />
                                <YAxis type="category" dataKey="nome" stroke={CHART.axis} fontSize={10} width={110} />
                                <Tooltip {...tip} formatter={(n: any) => brl(n)} />
                                <Bar dataKey="lucro" radius={[0, 4, 4, 0]}>
                                    {lucroChart.map((x, i) => <Cell key={i} fill={x.lucro >= 0 ? CHART.green : CHART.red} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            <Card className="p-0">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar vendido…"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-2 py-1.5 text-sm text-white focus:border-red-500 outline-none" />
                    </div>
                    <span className="text-[12px] text-gray-500">{filtrados.length} carro(s)</span>
                </div>
                {filtrados.length === 0 ? (
                    <div className="p-6 text-gray-500 text-sm text-center">Nenhuma venda ainda.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-gray-400 text-left">
                                <tr className="text-[11px] uppercase">
                                    <th className="px-3 py-2">Carro</th>
                                    <th className="px-3 py-2 text-right">Custo</th>
                                    <th className="px-3 py-2 text-right">Venda</th>
                                    <th className="px-3 py-2 text-right">Lucro</th>
                                    <th className="px-3 py-2 text-right">Margem</th>
                                    <th className="px-3 py-2 text-right">Giro</th>
                                    <th className="px-3 py-2">Vendido em</th>
                                    <th className="px-3 py-2 text-right"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrados.map((vc) => (
                                    <tr key={vc.id} className="border-t border-zinc-800 text-gray-200">
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-white">{vc.marca} {vc.modelo}</div>
                                            <div className="text-[11px] text-gray-500">{[vc.versao, vc.ano].filter(Boolean).join(' · ')}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right">{brl(vc.custo_total)}</td>
                                        <td className="px-3 py-2 text-right">{brl(vc.valor_venda)}</td>
                                        <td className={`px-3 py-2 text-right font-semibold ${(vc.lucro || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{brl(vc.lucro)}</td>
                                        <td className="px-3 py-2 text-right">{pct(vc.margem)}</td>
                                        <td className="px-3 py-2 text-right text-gray-400">{vc.dias_estoque}d</td>
                                        <td className="px-3 py-2 text-gray-400">{dateBR(vc.data_venda)}</td>
                                        <td className="px-3 py-2 text-right"><button onClick={() => onEdit(vc)} className="p-1.5 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// INTELIGÊNCIA DE COMPRA
// ═══════════════════════════════════════════════════════════════════════
export function CompraTab() {
    const [dias, setDias] = useState(90);
    const [dem, setDem] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true); setErr(null);
        fetch(`/api/milhao/demanda?dias=${dias}`, { cache: 'no-store' })
            .then((r) => r.json())
            .then((j) => { if (!alive) return; if (!j.success) throw new Error(j.error); setDem(j); })
            .catch((e) => alive && setErr(e?.message || 'erro'))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [dias]);

    const procChart = useMemo(() => (dem?.procurados || []).slice(0, 12).map((p: any) => ({
        nome: p.label.slice(0, 18), leads: p.total, temEstoque: p.em_estoque > 0,
    })), [dem]);

    const DiasChip = ({ d, label }: { d: number; label: string }) => (
        <button onClick={() => setDias(d)} className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${dias === d ? 'bg-red-600 border-red-500 text-white' : 'border-zinc-700 text-gray-400 hover:border-zinc-500'}`}>{label}</button>
    );

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="text-[13px] text-gray-400">
                    Cruzando <b className="text-white">o que os leads pedem</b> com o que o fundo tem e já vendeu.
                    {dem && <span className="text-gray-500"> · {dem.leads_reconhecidos} de {dem.total_leads_janela} leads com modelo identificado</span>}
                </div>
                <div className="flex items-center gap-1"><span className="text-[11px] text-gray-500 mr-1">Janela:</span><DiasChip d={30} label="30d" /><DiasChip d={90} label="90d" /><DiasChip d={180} label="180d" /></div>
            </div>

            {err && <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">Erro: {err}</div>}
            {loading || !dem ? <div className="text-gray-400 py-8 text-center">Analisando leads…</div> : (
                <>
                    {/* Dicas de compra (hero) */}
                    <Card title="🎯 Dicas de compra — procurado e SEM estoque" className="mb-5 p-0">
                        {dem.dicas_compra.length === 0 ? (
                            <div className="p-6 text-center text-[13px] text-gray-500">Sem lacunas relevantes: você tem em estoque o que os leads mais pedem. 👏</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                                {dem.dicas_compra.map((d: any, i: number) => (
                                    <div key={i} className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                                                <span className="font-semibold text-white">{d.label}</span>
                                            </div>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">{d.total} leads</span>
                                        </div>
                                        <div className="text-[12px] text-gray-300 mt-1.5">{d.motivo}</div>
                                        <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                                            {d.quentes > 0 && <span className="flex items-center gap-1 text-amber-300"><Flame className="w-3 h-3" /> {d.quentes} quentes</span>}
                                            {d.ja_vendemos > 0 && <span className="flex items-center gap-1 text-green-300"><ThumbsUp className="w-3 h-3" /> vendemos {d.ja_vendemos}×</span>}
                                            {d.margem_media != null && <span className="text-gray-400">margem hist. {pct(d.margem_media)}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* Mais procurados */}
                    {procChart.length > 0 && (
                        <Card title="Modelos mais procurados pelos leads" className="mb-5 p-0">
                            <div className="p-4">
                                <ResponsiveContainer width="100%" height={Math.max(180, procChart.length * 28)}>
                                    <BarChart data={procChart} layout="vertical" margin={{ left: 30 }}>
                                        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                                        <XAxis type="number" stroke={CHART.axis} fontSize={11} />
                                        <YAxis type="category" dataKey="nome" stroke={CHART.axis} fontSize={10} width={120} />
                                        <Tooltip {...tip} formatter={(n: any, _k: any, p: any) => [`${n} leads`, p.payload.temEstoque ? 'Tem em estoque' : 'Fora de estoque']} />
                                        <Bar dataKey="leads" radius={[0, 4, 4, 0]}>
                                            {procChart.map((x: any, i: number) => <Cell key={i} fill={x.temEstoque ? CHART.green : CHART.amber} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                <div className="flex gap-4 text-[11px] text-gray-500 mt-1">
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CHART.green }} /> temos em estoque</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CHART.amber }} /> fora de estoque (oportunidade)</span>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Tabela demanda x oferta */}
                    <Card title="Demanda × oferta (detalhe)" className="mb-5 p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-gray-400 text-left">
                                    <tr className="text-[11px] uppercase">
                                        <th className="px-3 py-2">Modelo</th>
                                        <th className="px-3 py-2 text-right">Leads</th>
                                        <th className="px-3 py-2 text-right">Quentes</th>
                                        <th className="px-3 py-2 text-right">Estoque</th>
                                        <th className="px-3 py-2 text-right">Vendemos</th>
                                        <th className="px-3 py-2 text-right">Giro</th>
                                        <th className="px-3 py-2 text-right">Margem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dem.procurados.map((p: any) => (
                                        <tr key={p.key} className="border-t border-zinc-800 text-gray-200">
                                            <td className="px-3 py-2 font-medium text-white">{p.label}</td>
                                            <td className="px-3 py-2 text-right">{p.total}</td>
                                            <td className="px-3 py-2 text-right text-amber-300">{p.quentes}</td>
                                            <td className={`px-3 py-2 text-right ${p.em_estoque > 0 ? 'text-green-400' : 'text-gray-500'}`}>{p.em_estoque || '—'}</td>
                                            <td className="px-3 py-2 text-right text-gray-400">{p.ja_vendemos || '—'}</td>
                                            <td className="px-3 py-2 text-right text-gray-400">{p.giro_medio_dias != null ? `${p.giro_medio_dias}d` : '—'}</td>
                                            <td className="px-3 py-2 text-right text-gray-400">{p.margem_media != null ? pct(p.margem_media) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Estoque sem procura */}
                        <Card title="⚠️ Estoque com pouca procura" className="p-0">
                            {dem.estoque_sem_procura.length === 0 ? (
                                <div className="p-6 text-center text-[13px] text-green-400">Tudo que está em estoque tem procura. 👍</div>
                            ) : (
                                <div className="divide-y divide-zinc-800">
                                    {dem.estoque_sem_procura.map((s: any, i: number) => (
                                        <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-2">
                                            <div>
                                                <div className="text-[13px] text-white capitalize">{s.key}</div>
                                                <div className="text-[11px] text-gray-500">{s.count} em estoque · {s.demanda} leads na janela</div>
                                            </div>
                                            <TrendingDown className="w-4 h-4 text-amber-400 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* Mais vendidos */}
                        <Card title="🏆 Mais vendidos do fundo" className="p-0">
                            {dem.mais_vendidos.length === 0 ? (
                                <div className="p-6 text-center text-[13px] text-gray-500">Sem vendas registradas ainda.</div>
                            ) : (
                                <div className="divide-y divide-zinc-800">
                                    {dem.mais_vendidos.map((m: any, i: number) => (
                                        <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-2">
                                            <div>
                                                <div className="text-[13px] text-white capitalize">{m.label}</div>
                                                <div className="text-[11px] text-gray-500">{m.count}× vendido{m.giro_medio_dias != null ? ` · giro ${m.giro_medio_dias}d` : ''} · {m.demanda} leads</div>
                                            </div>
                                            <div className="text-right"><div className="text-[13px] font-semibold text-green-400">{brl(m.lucro_total)}</div><div className="text-[10px] text-gray-500">lucro</div></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>
                </>
            )}
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// RELATÓRIO MENSAL
// ═══════════════════════════════════════════════════════════════════════
export function RelatorioTab({ data }: { data: Dados }) {
    const mensal = data.mensal || [];
    const [copiado, setCopiado] = useState(false);

    const chart = mensal.map((m) => ({ label: m.label, comprados: m.comprados, vendidos: m.vendidos, lucro: m.lucro }));

    const totalLucro = mensal.reduce((s, m) => s + m.lucro, 0);
    const totalVendidos = mensal.reduce((s, m) => s + m.vendidos, 0);
    const totalComprados = mensal.reduce((s, m) => s + m.comprados, 0);

    const gerarResumo = () => {
        const c = data.capital, e = data.emprestimo, v = data.veredito;
        const linhas = [
            '📊 RELATÓRIO MILHÃO',
            `Veredito: ${(VEREDITO_UI[v?.status] || VEREDITO_UI.sem_dados).label}`,
            `Lucro realizado: ${brl(c.lucro_realizado)} (${c.carros_vendidos} vendidos)`,
            `Líquido se liquidar hoje: ${brl(v.liquido_no_bolso)}`,
            `Patrimônio do fundo: ${brl(c.patrimonio_mercado)}`,
            `Em estoque: ${c.carros_estoque} carros · ${brl(c.custo_imobilizado)} imobilizados`,
            `Empréstimo: ${e.parcelas_pagas}/${e.parcelas_total} pagas · saldo ${brl(e.saldo_devedor)}`,
            '',
            'POR MÊS:',
            ...mensal.map((m) => `${m.label}: ${m.comprados} comprados, ${m.vendidos} vendidos, lucro ${brl(m.lucro)}${m.giro_medio_dias != null ? `, giro ${m.giro_medio_dias}d` : ''}`),
            '',
            ...(data.atencao?.length ? ['⚠️ ATENÇÃO:', ...data.atencao.map((a) => `- ${a.titulo}: ${a.detalhe}`)] : ['✅ Sem alertas.']),
        ];
        return linhas.join('\n');
    };

    const copiar = async () => {
        try { await navigator.clipboard.writeText(gerarResumo()); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* noop */ }
    };

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="grid grid-cols-3 gap-3 flex-1 min-w-[280px]">
                    <Kpi icon={<ShoppingCart className="w-5 h-5 text-blue-400" />} label="Comprados" value={String(totalComprados)} sub="no período" />
                    <Kpi icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label="Vendidos" value={String(totalVendidos)} sub="no período" />
                    <Kpi icon={<TrendingUp className="w-5 h-5 text-green-400" />} label="Lucro total" value={brl(totalLucro)} accent="text-green-400" />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={copiar} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[12px] text-gray-200">
                        <Copy className="w-4 h-4" /> {copiado ? 'Copiado!' : 'Copiar resumo'}
                    </button>
                    <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[12px] text-gray-200">
                        <Printer className="w-4 h-4" /> Imprimir
                    </button>
                </div>
            </div>

            {mensal.length === 0 ? (
                <Card className="p-8"><div className="text-center text-gray-500 text-sm">Sem movimentação registrada ainda.</div></Card>
            ) : (
                <>
                    <Card title="Compras × Vendas × Lucro por mês" className="mb-4 p-0">
                        <div className="p-4">
                            <ResponsiveContainer width="100%" height={260}>
                                <ComposedChart data={chart} margin={{ left: 6, right: 6 }}>
                                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="label" stroke={CHART.axis} fontSize={11} />
                                    <YAxis yAxisId="l" stroke={CHART.axis} fontSize={11} allowDecimals={false} />
                                    <YAxis yAxisId="r" orientation="right" stroke={CHART.axis} fontSize={11} tickFormatter={(n) => brlK(n)} />
                                    <Tooltip {...tip} formatter={(n: any, k: any) => (k === 'lucro' ? brl(n) : n)} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar yAxisId="l" dataKey="comprados" name="Comprados" fill={CHART.blue} radius={[3, 3, 0, 0]} />
                                    <Bar yAxisId="l" dataKey="vendidos" name="Vendidos" fill={CHART.green} radius={[3, 3, 0, 0]} />
                                    <Line yAxisId="r" type="monotone" dataKey="lucro" name="Lucro (R$)" stroke={CHART.amber} strokeWidth={2} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card title="Fechamento mensal" className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-gray-400 text-left">
                                    <tr className="text-[11px] uppercase">
                                        <th className="px-3 py-2">Mês</th>
                                        <th className="px-3 py-2 text-right">Comprados</th>
                                        <th className="px-3 py-2 text-right">Investido</th>
                                        <th className="px-3 py-2 text-right">Vendidos</th>
                                        <th className="px-3 py-2 text-right">Receita</th>
                                        <th className="px-3 py-2 text-right">Lucro</th>
                                        <th className="px-3 py-2 text-right">Giro</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mensal.map((m) => (
                                        <tr key={m.ym} className="border-t border-zinc-800 text-gray-200">
                                            <td className="px-3 py-2 font-medium text-white">{m.label}</td>
                                            <td className="px-3 py-2 text-right">{m.comprados || '—'}</td>
                                            <td className="px-3 py-2 text-right text-gray-400">{m.custo_comprado ? brl(m.custo_comprado) : '—'}</td>
                                            <td className="px-3 py-2 text-right">{m.vendidos || '—'}</td>
                                            <td className="px-3 py-2 text-right text-gray-400">{m.receita_vendida ? brl(m.receita_vendida) : '—'}</td>
                                            <td className={`px-3 py-2 text-right font-semibold ${m.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>{m.lucro ? brl(m.lucro) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-gray-400">{m.giro_medio_dias != null ? `${m.giro_medio_dias}d` : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-zinc-700 text-white font-semibold">
                                        <td className="px-3 py-2">Total</td>
                                        <td className="px-3 py-2 text-right">{totalComprados}</td>
                                        <td className="px-3 py-2 text-right">{brl(mensal.reduce((s, m) => s + m.custo_comprado, 0))}</td>
                                        <td className="px-3 py-2 text-right">{totalVendidos}</td>
                                        <td className="px-3 py-2 text-right">{brl(mensal.reduce((s, m) => s + m.receita_vendida, 0))}</td>
                                        <td className="px-3 py-2 text-right text-green-400">{brl(totalLucro)}</td>
                                        <td className="px-3 py-2 text-right">—</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </Card>
                </>
            )}
        </>
    );
}
