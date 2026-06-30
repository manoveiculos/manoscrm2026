'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import {
    Wallet, Car, Landmark, Target, TrendingUp, AlertTriangle,
    Plus, Pencil, Trash2, X, CheckCircle2, Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Formatação ───────────────────────────────────────────────────────
const brl = (n: number | null | undefined) =>
    (n == null ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (n: number | null | undefined) =>
    n == null ? '—' : `${(n * 100).toFixed(1)}%`;
const dateBR = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');

const ALEXANDRE = 'alexandre_gorges@hotmail.com';

interface Veiculo {
    id: string; marca: string; modelo: string; versao?: string; ano?: number; placa?: string;
    valor_compra: number; custos_reconto: number; valor_fipe?: number; valor_anuncio?: number;
    valor_venda?: number; data_compra?: string; data_venda?: string; status: string;
    consultor?: string; obs?: string;
    custo_total: number; lucro: number | null; margem: number | null; dias_estoque: number;
    valor_ref: number; lucro_potencial: number | null;
}

interface Dados {
    config: any; capital: any; giro: any; emprestimo: any; veredito: any;
    veiculos: Veiculo[]; parcelas: any[];
}

const VEREDITO_UI: Record<string, { label: string; cls: string }> = {
    no_ritmo: { label: 'No ritmo de dobrar', cls: 'text-green-400 border-green-500/30 bg-green-500/5' },
    atencao: { label: 'Atenção — abaixo do alvo', cls: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5' },
    critico: { label: 'Crítico — não cobre a parcela', cls: 'text-red-400 border-red-500/30 bg-red-500/5' },
    sem_dados: { label: 'Sem vendas ainda', cls: 'text-gray-400 border-zinc-700 bg-zinc-800/40' },
};

export default function MilhaoPage() {
    const [data, setData] = useState<Dados | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Veiculo | null>(null);

    // Acesso estrito: somente o login Alexandre
    useEffect(() => {
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setAllowed(session?.user?.email === ALEXANDRE);
        })();
    }, []);

    const load = async () => {
        setLoading(true); setErr(null);
        try {
            const res = await fetch('/api/milhao', { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json?.error || `HTTP ${res.status}`);
            setData(json);
        } catch (e: any) {
            setErr(e?.message || 'erro');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (allowed) load(); }, [allowed]);

    const togglePagaParcela = async (p: any) => {
        await fetch(`/api/milhao/parcelas/${p.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paga: !p.paga }),
        });
        load();
    };

    const removerVeiculo = async (v: Veiculo) => {
        if (!confirm(`Remover ${v.marca} ${v.modelo} do projeto Milhão?`)) return;
        await fetch(`/api/milhao/veiculos/${v.id}`, { method: 'DELETE' });
        load();
    };

    const lucroChart = useMemo(() => {
        if (!data) return [];
        return data.veiculos
            .filter(v => v.status === 'vendido' && v.lucro != null)
            .map(v => ({ nome: `${v.marca} ${v.modelo}`.slice(0, 18), lucro: v.lucro as number }))
            .sort((a, b) => b.lucro - a.lucro)
            .slice(0, 12);
    }, [data]);

    if (allowed === null) return <div className="p-6 text-gray-400">Verificando acesso…</div>;
    if (!allowed) return (
        <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-white">Acesso restrito</h1>
            <p className="text-gray-400 text-sm mt-1">Esta área é exclusiva do administrador Alexandre.</p>
        </div>
    );

    const c = data?.capital; const e = data?.emprestimo; const g = data?.giro; const v = data?.veredito; const cfg = data?.config;
    const vu = v ? VEREDITO_UI[v.status] : VEREDITO_UI.sem_dados;
    const prog = Math.min(1, Math.max(0, v?.progresso_meta || 0));
    const progEst = Math.min(1, Math.max(0, v?.progresso_com_estoque || 0));

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Target className="w-6 h-6 text-red-500" /> Milhão
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Fundo de R$ 1.000.000 em giro de carros — meta: sobrar {brl(cfg?.meta_liquido || 1000000)} limpo após quitar o empréstimo.
                    </p>
                </div>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                >
                    <Plus className="w-4 h-4" /> Lançar carro
                </button>
            </div>

            {err && <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">Erro: {err}</div>}

            {loading || !data ? (
                <div className="text-gray-400">Carregando…</div>
            ) : (
                <>
                    {/* ── VEREDITO ─────────────────────────────────────── */}
                    <div className={`rounded-xl border p-5 mb-6 ${vu.cls}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <div className="text-[11px] uppercase tracking-widest opacity-70">Veredito</div>
                                <div className="text-xl font-black">{vu.label}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[11px] uppercase tracking-widest opacity-70">Líquido se liquidar hoje</div>
                                <div className={`text-xl font-black ${(v.liquido_no_bolso || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {brl(v.liquido_no_bolso)}
                                </div>
                            </div>
                        </div>
                        {/* Barra de progresso até a meta de trading */}
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

                    {/* ── CAPITAL ──────────────────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <Kpi icon={<Wallet className="w-5 h-5 text-emerald-400" />} label="Caixa livre" value={brl(c.caixa_livre)} sub="não aplicado em carros" />
                        <Kpi icon={<Car className="w-5 h-5 text-blue-400" />} label="Imobilizado em carros" value={brl(c.custo_imobilizado)} sub={`${c.carros_estoque} no estoque (a custo)`} />
                        <Kpi icon={<TrendingUp className="w-5 h-5 text-green-400" />} label="Lucro realizado" value={brl(c.lucro_realizado)} sub={`${c.carros_vendidos} vendidos`} />
                        <Kpi icon={<Target className="w-5 h-5 text-purple-400" />} label="Patrimônio do fundo" value={brl(c.patrimonio_mercado)} sub={`a mercado · custo ${brl(c.patrimonio_custo)}`} />
                    </div>

                    {/* ── EMPRÉSTIMO + GIRO ────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                        <div className="bg-zinc-900 rounded-lg p-4">
                            <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2"><Landmark className="w-4 h-4" /> Empréstimo</h2>
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
                            ) : (
                                <div className="text-[12px] text-green-400">Empréstimo quitado 🎉</div>
                            )}
                        </div>

                        <div className="bg-zinc-900 rounded-lg p-4">
                            <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2"><Car className="w-4 h-4" /> Giro do capital</h2>
                            <div className="grid grid-cols-3 gap-3 text-center mb-3">
                                <div><div className="text-[11px] text-gray-500">Giro médio</div><div className="text-lg font-bold text-white">{g.giro_medio_dias != null ? `${g.giro_medio_dias.toFixed(0)}d` : '—'}</div></div>
                                <div><div className="text-[11px] text-gray-500">Margem média</div><div className="text-lg font-bold text-white">{pct(g.margem_media)}</div></div>
                                <div><div className="text-[11px] text-gray-500">Sangria/dia</div><div className="text-lg font-bold text-red-400">{brl(g.sangria_diaria)}</div></div>
                            </div>
                            {g.encalhados.length > 0 ? (
                                <div className="text-[12px] text-red-300 bg-red-500/5 border border-red-500/20 rounded p-2">
                                    <b>{g.encalhados.length} carro(s) encalhado(s)</b> (+{g.encalhe_dias}d parados): {g.encalhados.map((x: any) => `${x.marca} ${x.modelo}`).join(', ')}
                                </div>
                            ) : (
                                <div className="text-[12px] text-gray-500">Nenhum carro encalhado (limite {g.encalhe_dias} dias). Capital girando bem.</div>
                            )}
                        </div>
                    </div>

                    {/* ── LUCRO POR CARRO ──────────────────────────────── */}
                    {lucroChart.length > 0 && (
                        <div className="bg-zinc-900 rounded-lg p-4 mb-6">
                            <h2 className="text-sm font-semibold text-gray-300 mb-2">Lucro por carro vendido</h2>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={lucroChart} layout="vertical" margin={{ left: 30 }}>
                                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                                    <XAxis type="number" stroke="#71717a" fontSize={11} tickFormatter={(n) => `${(n / 1000).toFixed(0)}k`} />
                                    <YAxis type="category" dataKey="nome" stroke="#71717a" fontSize={10} width={110} />
                                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} formatter={(n: any) => brl(n)} />
                                    <Bar dataKey="lucro">
                                        {lucroChart.map((x, i) => <Cell key={i} fill={x.lucro >= 0 ? '#22c55e' : '#ef4444'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* ── TABELA DE CARROS ─────────────────────────────── */}
                    <div className="bg-zinc-900 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-gray-300">Carros do projeto ({data.veiculos.length})</h2>
                        </div>
                        {data.veiculos.length === 0 ? (
                            <div className="p-6 text-gray-500 text-sm text-center">Nenhum carro lançado ainda. Clique em "Lançar carro" para começar.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-gray-400 text-left">
                                        <tr className="text-[11px] uppercase">
                                            <th className="px-3 py-2">Carro</th>
                                            <th className="px-3 py-2 text-right">Custo</th>
                                            <th className="px-3 py-2 text-right">FIPE</th>
                                            <th className="px-3 py-2 text-right">Venda</th>
                                            <th className="px-3 py-2 text-right">Lucro</th>
                                            <th className="px-3 py-2 text-right">Margem</th>
                                            <th className="px-3 py-2 text-right">Dias</th>
                                            <th className="px-3 py-2">Status</th>
                                            <th className="px-3 py-2 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.veiculos.map((vc) => (
                                            <tr key={vc.id} className="border-t border-zinc-800 text-gray-200">
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-white">{vc.marca} {vc.modelo}</div>
                                                    <div className="text-[11px] text-gray-500">{[vc.versao, vc.ano, vc.placa].filter(Boolean).join(' · ')}</div>
                                                </td>
                                                <td className="px-3 py-2 text-right">{brl(vc.custo_total)}</td>
                                                <td className="px-3 py-2 text-right text-gray-400">{vc.valor_fipe ? brl(vc.valor_fipe) : '—'}</td>
                                                <td className="px-3 py-2 text-right">{vc.valor_venda ? brl(vc.valor_venda) : <span className="text-gray-500">{vc.valor_anuncio ? `${brl(vc.valor_anuncio)} (anúncio)` : '—'}</span>}</td>
                                                <td className={`px-3 py-2 text-right font-semibold ${vc.lucro == null ? 'text-gray-500' : vc.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>{vc.lucro == null ? '—' : brl(vc.lucro)}</td>
                                                <td className="px-3 py-2 text-right">{pct(vc.margem)}</td>
                                                <td className={`px-3 py-2 text-right ${vc.dias_estoque >= 60 && vc.status !== 'vendido' ? 'text-red-400 font-semibold' : ''}`}>{vc.dias_estoque}d</td>
                                                <td className="px-3 py-2"><StatusBadge status={vc.status} /></td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    <button onClick={() => { setEditing(vc); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
                                                    <button onClick={() => removerVeiculo(vc)} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ── PARCELAS ─────────────────────────────────────── */}
                    <div className="bg-zinc-900 rounded-lg overflow-hidden mt-6">
                        <div className="px-4 py-3 border-b border-zinc-800">
                            <h2 className="text-sm font-semibold text-gray-300">Parcelas do empréstimo</h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 p-3">
                            {data.parcelas.map((p: any) => (
                                <button
                                    key={p.id}
                                    onClick={() => togglePagaParcela(p)}
                                    className={`text-left rounded-lg border p-2 transition-colors ${p.paga ? 'border-green-500/30 bg-green-500/5' : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-600'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-gray-500">#{p.numero}</span>
                                        {p.paga ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Clock className="w-3.5 h-3.5 text-gray-600" />}
                                    </div>
                                    <div className="text-[12px] font-semibold text-white">{brl(p.valor)}</div>
                                    <div className="text-[10px] text-gray-500">{dateBR(p.vencimento)}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {modalOpen && (
                <VeiculoModal
                    veiculo={editing}
                    onClose={() => setModalOpen(false)}
                    onSaved={() => { setModalOpen(false); load(); }}
                />
            )}
        </div>
    );
}

// ── Subcomponentes ───────────────────────────────────────────────────
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

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        estoque: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        reservado: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        vendido: 'bg-green-500/10 text-green-400 border-green-500/20',
        devolvido: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${map[status] || map.estoque}`}>{status}</span>;
}

function VeiculoModal({ veiculo, onClose, onSaved }: { veiculo: Veiculo | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<any>(() => veiculo ? { ...veiculo } : {
        marca: '', modelo: '', versao: '', ano: '', placa: '',
        valor_compra: '', custos_reconto: '', valor_fipe: '', valor_anuncio: '', valor_venda: '',
        data_compra: new Date().toISOString().slice(0, 10), data_venda: '', status: 'estoque', consultor: '', obs: '',
    });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

    const salvar = async () => {
        if (!form.marca || !form.modelo) { setErro('Marca e modelo são obrigatórios.'); return; }
        setSaving(true); setErro(null);
        try {
            const url = veiculo ? `/api/milhao/veiculos/${veiculo.id}` : '/api/milhao/veiculos';
            const res = await fetch(url, {
                method: veiculo ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json?.error || 'Falha ao salvar');
            onSaved();
        } catch (e: any) {
            setErro(e?.message || 'erro'); setSaving(false);
        }
    };

    // Função (não componente) para não remontar o input e perder o foco a cada tecla
    const field = (k: string, label: string, type = 'text', span = 1) => (
        <label className={`block ${span === 2 ? 'col-span-2' : ''}`}>
            <span className="text-[11px] text-gray-400">{label}</span>
            <input
                type={type} value={form[k] ?? ''} onChange={(ev) => set(k, ev.target.value)}
                className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:border-red-500 outline-none"
            />
        </label>
    );

    return (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-900">
                    <h3 className="font-bold text-white">{veiculo ? 'Editar carro' : 'Lançar carro no Milhão'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 grid grid-cols-2 gap-3">
                    {field('marca', 'Marca *')}
                    {field('modelo', 'Modelo *')}
                    {field('versao', 'Versão', 'text', 2)}
                    {field('ano', 'Ano', 'number')}
                    {field('placa', 'Placa')}
                    {field('valor_compra', 'Valor de compra (R$)', 'number')}
                    {field('custos_reconto', 'Custos / reconto (R$)', 'number')}
                    {field('valor_fipe', 'FIPE (R$)', 'number')}
                    {field('valor_anuncio', 'Anúncio (R$)', 'number')}
                    <label className="block">
                        <span className="text-[11px] text-gray-400">Status</span>
                        <select value={form.status} onChange={(ev) => set('status', ev.target.value)} className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:border-red-500 outline-none">
                            <option value="estoque">estoque</option>
                            <option value="reservado">reservado</option>
                            <option value="vendido">vendido</option>
                            <option value="devolvido">devolvido</option>
                        </select>
                    </label>
                    {field('valor_venda', 'Valor de venda (R$)', 'number')}
                    {field('data_compra', 'Data de compra', 'date')}
                    {field('data_venda', 'Data de venda', 'date')}
                    {field('consultor', 'Consultor', 'text', 2)}
                    {field('obs', 'Observações', 'text', 2)}
                </div>
                {erro && <div className="px-5 text-red-400 text-sm pb-2">{erro}</div>}
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-zinc-800">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-zinc-800 text-sm">Cancelar</button>
                    <button onClick={salvar} disabled={saving} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
