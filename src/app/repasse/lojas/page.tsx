'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Store, Phone, MessageCircle } from 'lucide-react';
import { LOJA_TIPO } from '../lib';

const soDigitos = (s?: string) => (s || '').replace(/\D/g, '');

export default function RepasseLojas() {
    const [lojas, setLojas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);

    const load = async () => {
        setLoading(true);
        try {
            const json = await fetch('/api/repasse/lojas', { cache: 'no-store' }).then((r) => r.json());
            setLojas(json?.lojas || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('novo') === '1') {
            setEditing(null); setModalOpen(true);
        }
    }, []);

    const remover = async (l: any) => {
        if (!confirm(`Remover ${l.nome}?`)) return;
        await fetch(`/api/repasse/lojas/${l.id}`, { method: 'DELETE' });
        load();
    };

    return (
        <div className="px-4 pt-6">
            <div className="flex items-center justify-between mb-3">
                <h1 className="text-xl font-black">Lojas & contatos</h1>
                <button onClick={() => { setEditing(null); setModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold">
                    <Plus className="w-4 h-4" /> Novo
                </button>
            </div>

            {loading ? (
                <div className="text-white/40 text-sm py-10 text-center">Carregando…</div>
            ) : lojas.length === 0 ? (
                <div className="text-white/40 text-sm py-10 text-center">
                    <Store className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum contato. Cadastre as lojas e repassadores da sua rede.
                </div>
            ) : (
                <div className="space-y-2.5">
                    {lojas.map((l) => (
                        <div key={l.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-bold truncate">{l.nome}</div>
                                    <div className="text-[11px] text-white/40">{LOJA_TIPO[l.tipo] || l.tipo}{l.cidade ? ` · ${l.cidade}` : ''}</div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => { setEditing(l); setModalOpen(true); }} className="p-1.5 text-white/40"><Pencil className="w-4 h-4" /></button>
                                    <button onClick={() => remover(l)} className="p-1.5 text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            {l.telefone && (
                                <div className="flex gap-2 mt-2.5">
                                    <a href={`tel:${soDigitos(l.telefone)}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-[12px] font-semibold">
                                        <Phone className="w-3.5 h-3.5" /> Ligar
                                    </a>
                                    <a href={`https://wa.me/55${soDigitos(l.telefone)}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600/15 border border-green-500/20 text-green-300 text-[12px] font-semibold">
                                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                    </a>
                                </div>
                            )}
                            {l.obs && <div className="text-[11px] text-white/40 mt-2">{l.obs}</div>}
                        </div>
                    ))}
                </div>
            )}

            {modalOpen && <LojaModal loja={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />}
        </div>
    );
}

function LojaModal({ loja, onClose, onSaved }: { loja: any; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<any>(() => loja ? { ...loja } : { nome: '', tipo: 'loja', telefone: '', cidade: '', obs: '' });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

    const salvar = async () => {
        if (!form.nome) { setErro('Nome é obrigatório.'); return; }
        setSaving(true); setErro(null);
        try {
            const url = loja ? `/api/repasse/lojas/${loja.id}` : '/api/repasse/lojas';
            const res = await fetch(url, { method: loja ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json?.error || 'Falha ao salvar');
            onSaved();
        } catch (e: any) { setErro(e?.message || 'erro'); setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-[#131318] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="font-bold">{loja ? 'Editar contato' : 'Novo contato'}</h3>
                    <button onClick={onClose} className="text-white/50"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 space-y-3">
                    <label className="block">
                        <span className="text-[11px] text-white/50">Nome *</span>
                        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-red-500" />
                    </label>
                    <label className="block">
                        <span className="text-[11px] text-white/50">Tipo</span>
                        <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)} className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none">
                            {Object.entries(LOJA_TIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="text-[11px] text-white/50">Telefone</span>
                            <input value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} inputMode="tel" className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-red-500" />
                        </label>
                        <label className="block">
                            <span className="text-[11px] text-white/50">Cidade</span>
                            <input value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-red-500" />
                        </label>
                    </div>
                    <label className="block">
                        <span className="text-[11px] text-white/50">Observações</span>
                        <input value={form.obs ?? ''} onChange={(e) => set('obs', e.target.value)} className="w-full mt-0.5 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-red-500" />
                    </label>
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
