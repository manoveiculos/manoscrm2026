'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { brl, dateBR, CATEGORIA_LABEL } from '../lib';

export default function RepasseCaixa() {
    const [extrato, setExtrato] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [tipoInicial, setTipoInicial] = useState<'entrada' | 'saida'>('saida');

    const load = async () => {
        setLoading(true);
        try {
            const json = await fetch('/api/repasse/caixa', { cache: 'no-store' }).then((r) => r.json());
            setExtrato(json?.extrato || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('novo') === '1') {
            setTipoInicial('saida'); setModalOpen(true);
        }
    }, []);

    const resumo = useMemo(() => {
        let saldo = 0, aReceber = 0, aPagar = 0;
        for (const m of extrato) {
            if (m.pendente) { if (m.tipo === 'entrada') aReceber += m.valor; else aPagar += m.valor; }
            else saldo += m.tipo === 'entrada' ? m.valor : -m.valor;
        }
        return { saldo, aReceber, aPagar };
    }, [extrato]);

    const remover = async (m: any) => {
        if (m.origem !== 'manual') { alert('Movimento de carro — edite/remova pela tela Carros.'); return; }
        if (!confirm('Remover este lançamento?')) return;
        await fetch(`/api/repasse/caixa/${m.id}`, { method: 'DELETE' });
        load();
    };

    const abrir = (tipo: 'entrada' | 'saida') => { setTipoInicial(tipo); setModalOpen(true); };

    return (
        <div className="px-4 pt-6">
            <h1 className="text-xl font-black mb-3">Caixa</h1>

            <div className="rounded-2xl bg-gradient-to-br from-red-600/20 to-transparent border border-red-500/20 p-4 mb-3">
                <div className="text-[11px] uppercase tracking-widest text-white/50">Saldo em caixa</div>
                <div className={`text-3xl font-black mt-1 ${resumo.saldo >= 0 ? 'text-white' : 'text-red-400'}`}>{brl(resumo.saldo)}</div>
                <div className="flex gap-4 mt-2 text-[11px] text-white/50">
                    <span>A receber <b className="text-green-400">{brl(resumo.aReceber)}</b></span>
                    <span>A pagar <b className="text-red-400">{brl(resumo.aPagar)}</b></span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <button onClick={() => abrir('entrada')} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600/90 hover:bg-green-600 font-bold text-sm">
                    <ArrowUpCircle className="w-4 h-4" /> Entrada
                </button>
                <button onClick={() => abrir('saida')} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.06] border border-white/10 font-bold text-sm">
                    <ArrowDownCircle className="w-4 h-4" /> Saída
                </button>
            </div>

            <h2 className="text-sm font-bold text-white/80 mb-2">Extrato</h2>
            {loading ? (
                <div className="text-white/40 text-sm py-10 text-center">Carregando…</div>
            ) : extrato.length === 0 ? (
                <div className="text-white/40 text-sm py-10 text-center">Nenhuma movimentação ainda.</div>
            ) : (
                <div className="space-y-2">
                    {extrato.map((m: any, i: number) => (
                        <div key={m.id || i} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold truncate">{m.descricao}</div>
                                <div className="text-[10px] text-white/40">
                                    {dateBR(m.data)} · {CATEGORIA_LABEL[m.categoria] || m.categoria}
                                    {m.origem === 'carro' ? ' · carro' : ''}{m.pendente ? ' · pendente' : ''}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className={`text-sm font-black ${m.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                                    {m.tipo === 'entrada' ? '+' : '−'}{brl(m.valor)}
                                </span>
                                {m.origem === 'manual' && (
                                    <button onClick={() => remover(m)} className="text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {modalOpen && <MovModal tipoInicial={tipoInicial} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />}
        </div>
    );
}

function MovModal({ tipoInicial, onClose, onSaved }: { tipoInicial: 'entrada' | 'saida'; onClose: () => void; onSaved: () => void }) {
    const [tipo, setTipo] = useState<'entrada' | 'saida'>(tipoInicial);
    const [form, setForm] = useState<any>({ categoria: tipoInicial === 'entrada' ? 'aporte' : 'despesa', descricao: '', valor: '', data: new Date().toISOString().slice(0, 10), forma_pagamento: '' });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

    const cats = tipo === 'entrada'
        ? [['aporte', 'Aporte (pôr dinheiro)'], ['comissao', 'Comissão'], ['outros', 'Outros']]
        : [['despesa', 'Despesa (rua/carro)'], ['retirada', 'Retirada (tirar p/ mim)'], ['outros', 'Outros']];

    const trocarTipo = (t: 'entrada' | 'saida') => { setTipo(t); set('categoria', t === 'entrada' ? 'aporte' : 'despesa'); };

    const salvar = async () => {
        if (!form.valor || Number(form.valor) <= 0) { setErro('Informe o valor.'); return; }
        setSaving(true); setErro(null);
        try {
            const res = await fetch('/api/repasse/caixa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, tipo }) });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json?.error || 'Falha ao salvar');
            onSaved();
        } catch (e: any) { setErro(e?.message || 'erro'); setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-[#131318] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="font-bold">Lançar no caixa</h3>
                    <button onClick={onClose} className="text-white/50"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => trocarTipo('entrada')} className={`py-2.5 rounded-lg border text-sm font-semibold ${tipo === 'entrada' ? 'bg-green-600 border-green-600' : 'bg-white/[0.04] border-white/10 text-white/50'}`}>Entrada</button>
                        <button type="button" onClick={() => trocarTipo('saida')} className={`py-2.5 rounded-lg border text-sm font-semibold ${tipo === 'saida' ? 'bg-red-600 border-red-600' : 'bg-white/[0.04] border-white/10 text-white/50'}`}>Saída</button>
                    </div>
                    <label className="block">
                        <span className="text-[11px] text-white/50">Categoria</span>
                        <select value={form.categoria} onChange={(e) => set('categoria', e.target.value)} className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none">
                            {cats.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-[11px] text-white/50">Valor (R$)</span>
                        <input type="number" inputMode="decimal" value={form.valor} onChange={(e) => set('valor', e.target.value)} className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-lg font-bold text-white outline-none focus:border-red-500" />
                    </label>
                    <label className="block">
                        <span className="text-[11px] text-white/50">Descrição</span>
                        <input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Ex: gasolina, guincho, almoço…" className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-red-500" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="text-[11px] text-white/50">Data</span>
                            <input type="date" value={form.data} onChange={(e) => set('data', e.target.value)} className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none" />
                        </label>
                        <label className="block">
                            <span className="text-[11px] text-white/50">Forma</span>
                            <input value={form.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value)} placeholder="Pix, dinheiro…" className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none" />
                        </label>
                    </div>
                    {erro && <div className="text-red-400 text-sm">{erro}</div>}
                </div>
                <div className="flex gap-2 p-4 border-t border-white/10">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl text-white/60 bg-white/[0.04] text-sm font-semibold">Cancelar</button>
                    <button onClick={salvar} disabled={saving} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button>
                </div>
            </div>
        </div>
    );
}
