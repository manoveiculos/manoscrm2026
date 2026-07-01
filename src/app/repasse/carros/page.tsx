'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Car, Search } from 'lucide-react';
import { brl, STATUS_CFG, STATUS_OPCOES, TIPO_OP } from '../lib';

export default function RepasseCarros() {
    const [veiculos, setVeiculos] = useState<any[]>([]);
    const [lojas, setLojas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState<string>('todos');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);

    const load = async () => {
        setLoading(true);
        try {
            const [rv, rl] = await Promise.all([
                fetch('/api/repasse/veiculos', { cache: 'no-store' }).then((r) => r.json()),
                fetch('/api/repasse/lojas', { cache: 'no-store' }).then((r) => r.json()),
            ]);
            setVeiculos(rv?.veiculos || []);
            setLojas(rl?.lojas || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    // Abre o modal automaticamente quando vem de "?novo=1"
    useEffect(() => {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('novo') === '1') {
            setEditing(null); setModalOpen(true);
        }
    }, []);

    const lojaNome = (id: string | null) => lojas.find((l) => l.id === id)?.nome || null;

    const filtrados = useMemo(() => {
        if (filtro === 'todos') return veiculos;
        if (filtro === 'estoque') return veiculos.filter((v) => v.comprou && !v.vendeu);
        return veiculos.filter((v) => v.status === filtro);
    }, [veiculos, filtro]);

    const remover = async (v: any) => {
        if (!confirm(`Remover ${v.marca} ${v.modelo}?`)) return;
        await fetch(`/api/repasse/veiculos/${v.id}`, { method: 'DELETE' });
        load();
    };

    const chips = [
        { k: 'todos', label: 'Todos' },
        { k: 'negociando', label: 'Negociando' },
        { k: 'estoque', label: 'Em estoque' },
        { k: 'vendido', label: 'Vendidos' },
    ];

    return (
        <div className="px-4 pt-6">
            <div className="flex items-center justify-between mb-3">
                <h1 className="text-xl font-black">Carros</h1>
                <button onClick={() => { setEditing(null); setModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold">
                    <Plus className="w-4 h-4" /> Carro
                </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
                {chips.map((c) => (
                    <button key={c.k} onClick={() => setFiltro(c.k)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === c.k ? 'bg-red-600 border-red-600 text-white' : 'border-white/15 text-white/50'}`}>
                        {c.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-white/40 text-sm py-10 text-center">Carregando…</div>
            ) : filtrados.length === 0 ? (
                <div className="text-white/40 text-sm py-10 text-center">
                    <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum carro aqui. Toque em “Carro” para lançar.
                </div>
            ) : (
                <div className="space-y-3">
                    {filtrados.map((v) => {
                        const st = STATUS_CFG[v.status] || STATUS_CFG.negociando;
                        const interm = v.tipo_operacao === 'intermediacao';
                        return (
                            <div key={v.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5" onClick={() => { setEditing(v); setModalOpen(true); }}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-bold truncate">{v.marca} {v.modelo}</div>
                                        <div className="text-[11px] text-white/40 truncate">{[v.versao, v.ano, v.placa].filter(Boolean).join(' · ')}</div>
                                    </div>
                                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-2 text-[12px]">
                                    {interm ? (
                                        <span className="text-white/60">Comissão: <b className="text-white">{brl(v.comissao)}</b></span>
                                    ) : (
                                        <>
                                            <span className="text-white/60">Custo <b className="text-white">{brl(v.custo_total)}</b></span>
                                            <span className="text-white/60">{v.vendeu ? 'Venda' : 'Anúncio'} <b className="text-white">{brl(v.vendeu ? v.valor_venda : v.valor_anuncio)}</b></span>
                                        </>
                                    )}
                                    {v.lucro != null && <span className={`ml-auto font-black ${v.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>{v.lucro >= 0 ? '+' : ''}{brl(v.lucro)}</span>}
                                </div>
                                <div className="flex items-center justify-between mt-2 text-[10px] text-white/35">
                                    <span>
                                        {interm ? 'Intermediação' : 'Compra e venda'}
                                        {v.comprou && !v.vendeu ? ` · ${v.dias}d parado` : ''}
                                        {lojaNome(v.comprador_id) ? ` · p/ ${lojaNome(v.comprador_id)}` : ''}
                                    </span>
                                    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => { setEditing(v); setModalOpen(true); }} className="p-1.5 text-white/40"><Pencil className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => remover(v)} className="p-1.5 text-white/40 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {modalOpen && (
                <CarroModal veiculo={editing} lojas={lojas} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
            )}
        </div>
    );
}

function CarroModal({ veiculo, lojas, onClose, onSaved }: { veiculo: any; lojas: any[]; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<any>(() => veiculo ? { ...veiculo } : {
        tipo_operacao: 'compra_venda', status: 'negociando',
        marca: '', modelo: '', versao: '', ano: '', placa: '', km: '', cor: '',
        valor_compra: '', custos: '', valor_anuncio: '', valor_venda: '', comissao: '',
        fornecedor_id: '', comprador_id: '', compra_paga: true, venda_recebida: true,
        data_compra: '', data_venda: '', obs: '',
    });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const [resultados, setResultados] = useState<any[]>([]);

    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
    const interm = form.tipo_operacao === 'intermediacao';

    useEffect(() => {
        if (veiculo) return;
        const q = busca.trim();
        if (q.length < 2) { setResultados([]); return; }
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/milhao/estoque?q=${encodeURIComponent(q)}`);
                const json = await res.json();
                setResultados(json?.veiculos || []);
            } catch { setResultados([]); }
        }, 300);
        return () => clearTimeout(t);
    }, [busca, veiculo]);

    const puxar = (v: any) => {
        setForm((f: any) => ({
            ...f, estoque_id_externo: v.id_externo || '', marca: v.marca || '', modelo: v.modelo || '',
            versao: v.versao || '', ano: v.ano || '', km: v.km || '', cor: v.cor || '', valor_anuncio: v.preco || '',
        }));
        setBusca(''); setResultados([]);
    };

    const salvar = async () => {
        if (!form.marca || !form.modelo) { setErro('Marca e modelo são obrigatórios.'); return; }
        setSaving(true); setErro(null);
        try {
            const url = veiculo ? `/api/repasse/veiculos/${veiculo.id}` : '/api/repasse/veiculos';
            const res = await fetch(url, { method: veiculo ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json?.error || 'Falha ao salvar');
            onSaved();
        } catch (e: any) { setErro(e?.message || 'erro'); setSaving(false); }
    };

    const campo = (k: string, label: string, type = 'text') => (
        <label className="block">
            <span className="text-[11px] text-white/50">{label}</span>
            <input type={type} inputMode={type === 'number' ? 'decimal' : undefined} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)}
                className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-red-500 outline-none" />
        </label>
    );

    const toggle = (k: string, label: string) => (
        <button type="button" onClick={() => set(k, !form[k])}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${form[k] ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-white/[0.04] border-white/10 text-white/50'}`}>
            <span>{label}</span>
            <span className="text-[11px] font-bold">{form[k] ? 'SIM' : 'NÃO'}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-[#131318] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-[#131318] z-10">
                    <h3 className="font-bold">{veiculo ? 'Editar carro' : 'Lançar carro'}</h3>
                    <button onClick={onClose} className="text-white/50"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-4 space-y-3">
                    {/* Buscador do estoque Altimus (só no cadastro novo) */}
                    {!veiculo && (
                        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2.5">
                            <div className="flex items-center gap-2 text-white/50">
                                <Search className="w-4 h-4" />
                                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no estoque Altimus…"
                                    className="w-full bg-transparent text-sm text-white outline-none" />
                            </div>
                            {resultados.length > 0 && (
                                <div className="mt-2 max-h-40 overflow-y-auto rounded border border-white/10 divide-y divide-white/5">
                                    {resultados.map((v, i) => (
                                        <button key={i} type="button" onClick={() => puxar(v)} className="w-full text-left px-2 py-1.5 hover:bg-white/5">
                                            <div className="text-[12px]">{v.marca} {v.modelo} {v.versao || ''}</div>
                                            <div className="text-[10px] text-white/40">{[v.ano, v.cor].filter(Boolean).join(' · ')}{v.preco ? ` · ${brl(v.preco)}` : ''}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tipo de operação */}
                    <div className="grid grid-cols-2 gap-2">
                        {(['compra_venda', 'intermediacao'] as const).map((t) => (
                            <button key={t} type="button" onClick={() => set('tipo_operacao', t)}
                                className={`py-2.5 rounded-lg border text-sm font-semibold ${form.tipo_operacao === t ? 'bg-red-600 border-red-600' : 'bg-white/[0.04] border-white/10 text-white/50'}`}>
                                {TIPO_OP[t]}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {campo('marca', 'Marca *')}
                        {campo('modelo', 'Modelo *')}
                        {campo('versao', 'Versão')}
                        {campo('ano', 'Ano', 'number')}
                        {campo('placa', 'Placa')}
                        {campo('km', 'KM', 'number')}
                    </div>

                    {interm ? (
                        <div className="grid grid-cols-2 gap-2">
                            {campo('comissao', 'Comissão (R$)', 'number')}
                            {campo('valor_venda', 'Valor do negócio (R$)', 'number')}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {campo('valor_compra', 'Compra (R$)', 'number')}
                            {campo('custos', 'Custos/reconto (R$)', 'number')}
                            {campo('valor_anuncio', 'Anúncio (R$)', 'number')}
                            {campo('valor_venda', 'Venda (R$)', 'number')}
                        </div>
                    )}

                    <label className="block">
                        <span className="text-[11px] text-white/50">Status</span>
                        <select value={form.status} onChange={(e) => set('status', e.target.value)}
                            className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none">
                            {STATUS_OPCOES.map((s) => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                        </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="text-[11px] text-white/50">De quem (fornecedor)</span>
                            <select value={form.fornecedor_id ?? ''} onChange={(e) => set('fornecedor_id', e.target.value)}
                                className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none">
                                <option value="">—</option>
                                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-[11px] text-white/50">Pra quem (comprador)</span>
                            <select value={form.comprador_id ?? ''} onChange={(e) => set('comprador_id', e.target.value)}
                                className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none">
                                <option value="">—</option>
                                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                            </select>
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {campo('data_compra', 'Data compra', 'date')}
                        {campo('data_venda', 'Data venda', 'date')}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {!interm && toggle('compra_paga', 'Compra paga?')}
                        {toggle('venda_recebida', interm ? 'Comissão recebida?' : 'Venda recebida?')}
                    </div>

                    {campo('obs', 'Observações')}

                    {erro && <div className="text-red-400 text-sm">{erro}</div>}
                </div>

                <div className="flex gap-2 p-4 border-t border-white/10 sticky bottom-0 bg-[#131318]">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl text-white/60 bg-white/[0.04] text-sm font-semibold">Cancelar</button>
                    <button onClick={salvar} disabled={saving} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold disabled:opacity-50">
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
