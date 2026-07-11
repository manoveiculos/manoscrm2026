'use client';

import { useEffect, useState } from 'react';
import { Car, X } from 'lucide-react';
import { brl, Veiculo } from './shared';

export default function VeiculoModal({ veiculo, onClose, onSaved }: { veiculo: Veiculo | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<any>(() => veiculo ? { ...veiculo } : {
        marca: '', modelo: '', versao: '', ano: '', placa: '', km: '', cor: '',
        valor_compra: '', custos_reconto: '', valor_fipe: '', valor_anuncio: '', valor_venda: '',
        data_compra: new Date().toISOString().slice(0, 10), data_venda: '', status: 'estoque', consultor: '', obs: '',
    });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const [resultados, setResultados] = useState<any[]>([]);
    const [buscando, setBuscando] = useState(false);

    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

    // Lucro previsto ao vivo enquanto digita (ajuda a não comprar errado)
    const custo = (Number(form.valor_compra) || 0) + (Number(form.custos_reconto) || 0);
    const ref = (Number(form.valor_venda) || 0) || (Number(form.valor_anuncio) || 0) || (Number(form.valor_fipe) || 0);
    const lucroPrev = ref > 0 && custo > 0 ? ref - custo : null;
    const margemPrev = lucroPrev != null && custo > 0 ? lucroPrev / custo : null;

    // Busca no estoque ao vivo do Altimus (debounced) — só no cadastro novo
    useEffect(() => {
        if (veiculo) return;
        const q = busca.trim();
        if (q.length < 2) { setResultados([]); return; }
        setBuscando(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/milhao/estoque?q=${encodeURIComponent(q)}`);
                const json = await res.json();
                setResultados(json?.veiculos || []);
            } catch { setResultados([]); }
            finally { setBuscando(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [busca, veiculo]);

    const puxarDoEstoque = (v: any) => {
        setForm((f: any) => ({
            ...f,
            estoque_id_externo: v.id_externo || '',
            marca: v.marca || '', modelo: v.modelo || '', versao: v.versao || '',
            ano: v.ano || '', km: v.km || '', cor: v.cor || '', valor_anuncio: v.preco || '',
        }));
        setBusca(''); setResultados([]);
    };

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
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
                    <h3 className="font-bold text-white">{veiculo ? 'Editar carro' : 'Lançar carro no Milhão'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                {!veiculo && (
                    <div className="px-5 pt-4">
                        <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-[12px] text-gray-300 mb-2">
                                <Car className="w-4 h-4 text-blue-400" />
                                Puxar do estoque Altimus <span className="text-gray-500">(busca por marca/modelo)</span>
                            </div>
                            <input
                                value={busca} onChange={(ev) => setBusca(ev.target.value)}
                                placeholder="Ex: Civic, HR-V, Onix…"
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:border-red-500 outline-none"
                            />
                            {buscando && <div className="text-[11px] text-gray-500 mt-1">Buscando…</div>}
                            {resultados.length > 0 && (
                                <div className="mt-2 max-h-44 overflow-y-auto rounded border border-zinc-700 divide-y divide-zinc-800">
                                    {resultados.map((v, i) => (
                                        <button key={i} type="button" onClick={() => puxarDoEstoque(v)} className="w-full text-left px-2 py-1.5 hover:bg-zinc-700/40 transition-colors">
                                            <div className="text-[12px] text-white">{v.marca} {v.modelo} {v.versao || ''}</div>
                                            <div className="text-[10px] text-gray-500">
                                                {[v.ano, v.km ? `${Number(v.km).toLocaleString('pt-BR')}km` : null, v.cor].filter(Boolean).join(' · ')}
                                                {v.preco ? ` · ${brl(v.preco)}` : ''}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                                <div className="text-[11px] text-gray-500 mt-1">Nada encontrado no estoque para “{busca}”.</div>
                            )}
                            {form.estoque_id_externo && (
                                <div className="text-[11px] text-emerald-400 mt-2">✓ Puxado do Altimus — agora preencha compra e reconto.</div>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-5 grid grid-cols-2 gap-3">
                    {field('marca', 'Marca *')}
                    {field('modelo', 'Modelo *')}
                    {field('versao', 'Versão', 'text', 2)}
                    {field('ano', 'Ano', 'number')}
                    {field('km', 'KM', 'number')}
                    {field('cor', 'Cor')}
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

                {lucroPrev != null && (
                    <div className="px-5 pb-1">
                        <div className={`text-[12px] rounded p-2 border ${lucroPrev >= 0 ? 'text-green-300 border-green-500/20 bg-green-500/5' : 'text-red-300 border-red-500/20 bg-red-500/5'}`}>
                            Lucro previsto: <b>{brl(lucroPrev)}</b>{margemPrev != null && <> · margem <b>{(margemPrev * 100).toFixed(1)}%</b></>}
                            <span className="text-gray-500"> (ref. {form.valor_venda ? 'venda' : form.valor_anuncio ? 'anúncio' : 'FIPE'})</span>
                        </div>
                    </div>
                )}
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
