'use client';

import { useEffect, useState } from 'react';
import { X, Store, Car, Calendar, MapPin, Search, UserPlus } from 'lucide-react';

export interface VisitaPrefill {
    id?: string;
    lead_uid?: string | null;
    cliente_nome?: string;
    cliente_whatsapp?: string;
    cliente_telefone?: string;
    veiculo_interesse?: string;
    tipo?: 'loja' | 'externa';
    endereco?: string;
    data_hora?: string; // ISO
    observacoes?: string;
}

const splitDateTime = (iso?: string) => {
    if (!iso) return { d: '', t: '' };
    const dt = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { d: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, t: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
};

export default function NovaVisitaModal({ edit, onClose, onSaved }: { edit?: VisitaPrefill | null; onClose: () => void; onSaved: () => void }) {
    const init = splitDateTime(edit?.data_hora);
    const [f, setF] = useState({
        cliente_nome: edit?.cliente_nome || '',
        cliente_whatsapp: edit?.cliente_whatsapp || edit?.cliente_telefone || '',
        veiculo_interesse: edit?.veiculo_interesse || '',
        tipo: (edit?.tipo || 'loja') as 'loja' | 'externa',
        endereco: edit?.endereco || '',
        data: init.d,
        hora: init.t,
        observacoes: edit?.observacoes || '',
    });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
    const isEdit = !!edit?.id;

    // ── Busca nos leads do CRM (nome ou telefone) ──
    const [leadUid, setLeadUid] = useState<string | null>(edit?.lead_uid || null);
    const [results, setResults] = useState<any[]>([]);
    const [buscando, setBuscando] = useState(false);
    const [dropOpen, setDropOpen] = useState(false);

    useEffect(() => {
        if (isEdit) return; // edição não re-busca
        const q = f.cliente_nome.trim();
        if (q.length < 2 || leadUid) { setResults([]); setDropOpen(false); return; }
        setBuscando(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/agenda/buscar-lead?q=${encodeURIComponent(q)}`);
                const json = await res.json();
                setResults(json?.leads || []);
                setDropOpen(true);
            } catch { setResults([]); }
            finally { setBuscando(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [f.cliente_nome, isEdit, leadUid]);

    const pickLead = (l: any) => {
        setF((p) => ({
            ...p,
            cliente_nome: l.nome,
            cliente_whatsapp: l.telefone || p.cliente_whatsapp,
            veiculo_interesse: l.veiculo || p.veiculo_interesse,
        }));
        setLeadUid(l.uid);
        setDropOpen(false); setResults([]);
    };
    const cadastroNovo = () => { setLeadUid(null); setDropOpen(false); setResults([]); };

    const salvar = async () => {
        if (!f.cliente_nome.trim()) { setErro('Informe o nome do cliente.'); return; }
        if (!f.data || !f.hora) { setErro('Informe data e hora.'); return; }
        if (f.tipo === 'externa' && !f.endereco.trim()) { setErro('Endereço é obrigatório na visita externa.'); return; }
        const data_hora = new Date(`${f.data}T${f.hora}`).toISOString();
        setSaving(true); setErro(null);
        try {
            const payload: any = {
                cliente_nome: f.cliente_nome.trim(),
                cliente_whatsapp: f.cliente_whatsapp.replace(/\D/g, '') || null,
                cliente_telefone: f.cliente_whatsapp.replace(/\D/g, '') || null,
                veiculo_interesse: f.veiculo_interesse || null,
                tipo: f.tipo,
                endereco: f.tipo === 'externa' ? f.endereco : null,
                data_hora,
                observacoes: f.observacoes || null,
            };
            if (!isEdit && leadUid) payload.lead_uid = leadUid;
            const url = isEdit ? `/api/agenda/${edit!.id}` : '/api/agenda';
            const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json?.error || 'Falha ao salvar');
            onSaved();
        } catch (e: any) { setErro(e?.message || 'erro'); setSaving(false); }
    };

    const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-[15px] text-white focus:border-red-500 outline-none';
    const label = 'text-[12px] font-semibold text-zinc-400 block mb-1';

    return (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
                    <h3 className="font-bold text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-red-500" /> {isEdit ? 'Editar visita' : 'Nova visita'}</h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-3.5">
                    <div className="relative">
                        <span className={label}>Cliente * <span className="text-zinc-600 font-normal">(digite nome ou telefone — puxa dos leads)</span></span>
                        <input className={inputCls} value={f.cliente_nome}
                            onChange={(e) => { set('cliente_nome', e.target.value); if (leadUid) setLeadUid(null); }}
                            placeholder="Nome ou telefone do cliente" />
                        {leadUid && <div className="text-[11px] text-emerald-400 mt-1">✓ Vinculado ao lead do CRM</div>}
                        {buscando && <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1"><Search className="w-3 h-3" /> Buscando nos leads…</div>}
                        {dropOpen && !buscando && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl max-h-56 overflow-y-auto">
                                {results.map((l) => (
                                    <button key={l.uid} type="button" onClick={() => pickLead(l)}
                                        className="w-full text-left px-3 py-2.5 hover:bg-zinc-700/60 border-b border-zinc-700/50">
                                        <div className="text-[13px] font-semibold text-white">{l.nome}</div>
                                        <div className="text-[11px] text-zinc-400">{[l.telefone, l.veiculo].filter(Boolean).join(' · ') || 'sem telefone visível'}</div>
                                    </button>
                                ))}
                                <button type="button" onClick={cadastroNovo}
                                    className="w-full text-left px-3 py-2.5 hover:bg-zinc-700/60 flex items-center gap-2 text-emerald-300 text-[13px] font-semibold">
                                    <UserPlus className="w-4 h-4" />
                                    {results.length === 0 ? 'Nenhum lead encontrado — cadastrar cliente novo' : 'Não é nenhum desses — cadastrar novo'}
                                </button>
                            </div>
                        )}
                    </div>
                    <div>
                        <span className={label}>WhatsApp</span>
                        <input className={inputCls} inputMode="tel" value={f.cliente_whatsapp} onChange={(e) => set('cliente_whatsapp', e.target.value)} placeholder="DDD + número" />
                    </div>
                    <div>
                        <span className={label}>Veículo de interesse</span>
                        <input className={inputCls} value={f.veiculo_interesse} onChange={(e) => set('veiculo_interesse', e.target.value)} placeholder="Ex.: Onix 1.0 2020 prata" />
                    </div>

                    <div>
                        <span className={label}>Tipo</span>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => set('tipo', 'loja')} className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-[13px] font-semibold ${f.tipo === 'loja' ? 'bg-red-600 border-red-500 text-white' : 'border-zinc-700 text-zinc-400'}`}><Store className="w-4 h-4" /> Trazer na loja</button>
                            <button onClick={() => set('tipo', 'externa')} className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-[13px] font-semibold ${f.tipo === 'externa' ? 'bg-red-600 border-red-500 text-white' : 'border-zinc-700 text-zinc-400'}`}><Car className="w-4 h-4" /> Ir até o cliente</button>
                        </div>
                    </div>
                    {f.tipo === 'externa' && (
                        <div>
                            <span className={label}><MapPin className="w-3 h-3 inline -mt-0.5" /> Endereço *</span>
                            <input className={inputCls} value={f.endereco} onChange={(e) => set('endereco', e.target.value)} placeholder="Rua, número, bairro" />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div><span className={label}>Data *</span><input type="date" className={inputCls} value={f.data} onChange={(e) => set('data', e.target.value)} /></div>
                        <div><span className={label}>Hora *</span><input type="time" className={inputCls} value={f.hora} onChange={(e) => set('hora', e.target.value)} /></div>
                    </div>
                    <div>
                        <span className={label}>Observações</span>
                        <textarea className={inputCls} rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Ex.: prefere início da tarde" />
                    </div>

                    {erro && <div className="text-red-400 text-[13px]">{erro}</div>}
                </div>

                <div className="flex gap-2 px-5 py-3.5 border-t border-zinc-800 sticky bottom-0 bg-zinc-900">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-zinc-300 hover:bg-zinc-800 text-sm font-semibold">Cancelar</button>
                    <button onClick={salvar} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-50">{saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Agendar visita'}</button>
                </div>
            </div>
        </div>
    );
}
