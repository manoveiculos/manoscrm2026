'use client';

import { useEffect, useState } from 'react';
import { Target, Plus, AlertTriangle, LayoutDashboard, Package, CheckCircle2, ShoppingCart, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Dados, Veiculo } from './_components/shared';
import { OverviewTab, EstoqueTab, VendidosTab, CompraTab, RelatorioTab } from './_components/tabs';
import VeiculoModal from './_components/VeiculoModal';

const ALEXANDRE = 'alexandre_gorges@hotmail.com';

type TabKey = 'geral' | 'estoque' | 'vendidos' | 'compra' | 'relatorio';
const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'geral', label: 'Visão Geral', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'estoque', label: 'Estoque', icon: <Package className="w-4 h-4" /> },
    { key: 'vendidos', label: 'Vendidos', icon: <CheckCircle2 className="w-4 h-4" /> },
    { key: 'compra', label: 'Inteligência de Compra', icon: <ShoppingCart className="w-4 h-4" /> },
    { key: 'relatorio', label: 'Relatório Mensal', icon: <FileText className="w-4 h-4" /> },
];

export default function MilhaoPage() {
    const [data, setData] = useState<Dados | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [tab, setTab] = useState<TabKey>('geral');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Veiculo | null>(null);

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

    const openEdit = (v: Veiculo) => { setEditing(v); setModalOpen(true); };

    if (allowed === null) return <div className="p-6 text-gray-400">Verificando acesso…</div>;
    if (!allowed) return (
        <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-white">Acesso restrito</h1>
            <p className="text-gray-400 text-sm mt-1">Esta área é exclusiva do administrador Alexandre.</p>
        </div>
    );

    const cfg = data?.config;

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Target className="w-6 h-6 text-red-500" /> Milhão
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Fundo de R$ 1.000.000 em giro de carros — meta: sobrar {brlHeader(cfg?.meta_liquido)} limpo após quitar o empréstimo.
                    </p>
                </div>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                >
                    <Plus className="w-4 h-4" /> Lançar carro
                </button>
            </div>

            {/* Abas */}
            <div className="flex items-center gap-1 mb-5 border-b border-zinc-800 overflow-x-auto">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                            tab === t.key ? 'border-red-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {err && <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">Erro: {err}</div>}

            {loading || !data ? (
                <div className="text-gray-400 py-8">Carregando…</div>
            ) : (
                <>
                    {tab === 'geral' && <OverviewTab data={data} onTogglePagaParcela={togglePagaParcela} />}
                    {tab === 'estoque' && <EstoqueTab data={data} onEdit={openEdit} onRemove={removerVeiculo} />}
                    {tab === 'vendidos' && <VendidosTab data={data} onEdit={openEdit} />}
                    {tab === 'compra' && <CompraTab />}
                    {tab === 'relatorio' && <RelatorioTab data={data} />}
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

const brlHeader = (n: number | null | undefined) =>
    (n == null ? 1000000 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
