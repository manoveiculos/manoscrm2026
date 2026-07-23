'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle, PhoneOff, MessageCircle, ClipboardCheck, Flag, X, Star, RefreshCw } from 'lucide-react';

interface Perdido {
    id: string; lead_uid: string; categoria: string;
    cliente_nome?: string; cliente_telefone?: string; veiculo_interesse?: string;
    vendedor_consultant_id?: string; vendedor_nome?: string; motivo?: string; perdido_em?: string;
    status_auditoria: string; bem_atendido?: boolean | null; nota?: number | null;
    duvidas?: string; comentario?: string; gerar_cobranca: boolean; cobranca_texto?: string; cobranca_resolvida: boolean;
}

const ST_UI: Record<string, { label: string; cls: string }> = {
    pendente: { label: 'Pendente', cls: 'bg-amber-600/20 text-amber-300 border border-amber-500/30' },
    contatado: { label: 'Contatado', cls: 'bg-blue-600/20 text-blue-300 border border-blue-500/30' },
    sem_resposta: { label: 'Sem resposta', cls: 'bg-zinc-700 text-zinc-300' },
    resolvido: { label: 'Resolvido', cls: 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' },
};

export default function PerdidosPage() {
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [lista, setLista] = useState<Perdido[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState<'pendente' | 'contatado' | 'todos'>('pendente');
    const [vendFiltro, setVendFiltro] = useState('todos');
    const [auditando, setAuditando] = useState<Perdido | null>(null);

    useEffect(() => {
        (async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const email = (session?.user?.email || '').toLowerCase();
            if (email === 'alexandre_gorges@hotmail.com') { setAllowed(true); return; }
            if (session?.user?.id) {
                const { data: c } = await supabase.from('consultants_manos_crm').select('role').eq('auth_id', session.user.id).maybeSingle();
                setAllowed(c?.role === 'admin');
            } else setAllowed(false);
        })();
    }, []);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/perdidos', { cache: 'no-store' });
            const json = await res.json();
            if (json.success) setLista(json.perdidos);
        } catch { /* noop */ } finally { setLoading(false); }
    };
    useEffect(() => { if (allowed) load(); }, [allowed]);

    const vendedores = useMemo(() => [...new Set(lista.map((p) => p.vendedor_nome).filter(Boolean))] as string[], [lista]);
    const filtrados = useMemo(() => lista.filter((p) => {
        if (filtro === 'pendente' && p.status_auditoria !== 'pendente') return false;
        if (filtro === 'contatado' && !['contatado', 'sem_resposta', 'resolvido'].includes(p.status_auditoria)) return false;
        if (vendFiltro !== 'todos' && p.vendedor_nome !== vendFiltro) return false;
        return true;
    }), [lista, filtro, vendFiltro]);

    const kpi = useMemo(() => ({
        pendentes: lista.filter((p) => p.status_auditoria === 'pendente').length,
        malAtendidos: lista.filter((p) => p.bem_atendido === false).length,
        cobrancas: lista.filter((p) => p.gerar_cobranca && !p.cobranca_resolvida).length,
    }), [lista]);

    if (allowed === null) return <div className="p-6 text-gray-400">Verificando acesso…</div>;
    if (!allowed) return (
        <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-white">Acesso restrito</h1>
            <p className="text-gray-400 text-sm mt-1">Esta área é exclusiva da gerência.</p>
        </div>
    );

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full pb-20">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-black text-white flex items-center gap-2"><PhoneOff className="w-6 h-6 text-red-500" /> Perdidos — Auditoria</h1>
                    <p className="text-xs text-zinc-500 mt-0.5">Todo perdido/spam cai aqui. Ligue, pergunte se foi bem atendido e cobre o vendedor quando precisar.</p>
                </div>
                <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[12px] text-gray-200">
                    <RefreshCw className="w-4 h-4" /> Atualizar
                </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3"><div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Pendentes</div><div className="text-2xl font-black text-amber-400">{kpi.pendentes}</div></div>
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3"><div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Mal atendidos</div><div className="text-2xl font-black text-red-400">{kpi.malAtendidos}</div></div>
                <div className="bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-xl p-3"><div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cobranças abertas</div><div className="text-2xl font-black text-fuchsia-400">{kpi.cobrancas}</div></div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
                {([['pendente', 'Pendentes'], ['contatado', 'Já contatados'], ['todos', 'Todos']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold ${filtro === k ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>{l}</button>
                ))}
                <select value={vendFiltro} onChange={(e) => setVendFiltro(e.target.value)} className="ml-auto bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-white outline-none">
                    <option value="todos">Todos os vendedores</option>
                    {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
            </div>

            {loading ? <div className="text-zinc-500 py-10 text-center">Carregando…</div>
                : filtrados.length === 0 ? <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500 text-sm">Nada aqui. 👏</div>
                    : (
                        <div className="space-y-2.5">
                            {filtrados.map((p) => {
                                const st = ST_UI[p.status_auditoria] || ST_UI.pendente;
                                const tel = (p.cliente_telefone || '').replace(/\D/g, '');
                                return (
                                    <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[15px] font-bold text-white">{p.cliente_nome || 'Sem nome'}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${st.cls}`}>{st.label}</span>
                                                    {p.categoria === 'spam' && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-zinc-700 text-zinc-300">SPAM</span>}
                                                    {p.nota != null && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-600/20 text-blue-300 flex items-center gap-0.5"><Star className="w-3 h-3" /> {p.nota}</span>}
                                                    {p.bem_atendido === false && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-600/20 text-red-300">MAL ATENDIDO</span>}
                                                    {p.gerar_cobranca && !p.cobranca_resolvida && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-fuchsia-600/20 text-fuchsia-300 flex items-center gap-0.5"><Flag className="w-3 h-3" /> COBRANÇA</span>}
                                                </div>
                                                <div className="text-[12px] text-zinc-400 mt-1">
                                                    {[p.veiculo_interesse, p.vendedor_nome ? `Vendedor: ${p.vendedor_nome.split(' ')[0]}` : null, p.perdido_em ? new Date(p.perdido_em).toLocaleDateString('pt-BR') : null].filter(Boolean).join(' · ')}
                                                </div>
                                                {p.motivo && <div className="text-[12px] text-zinc-500 mt-1 italic line-clamp-2">“{p.motivo}”</div>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {tel && <a href={`https://wa.me/55${tel.startsWith('55') ? tel.slice(2) : tel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
                                                <button onClick={() => setAuditando(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-red-600 hover:bg-red-500 text-white"><ClipboardCheck className="w-3.5 h-3.5" /> Auditar</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

            {auditando && <AuditModal p={auditando} onClose={() => setAuditando(null)} onSaved={() => { setAuditando(null); load(); }} />}
        </div>
    );
}

function AuditModal({ p, onClose, onSaved }: { p: Perdido; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = useState({
        status_auditoria: p.status_auditoria === 'pendente' ? 'contatado' : p.status_auditoria,
        bem_atendido: p.bem_atendido ?? null as boolean | null,
        nota: p.nota ?? null as number | null,
        duvidas: p.duvidas || '',
        comentario: p.comentario || '',
        gerar_cobranca: p.gerar_cobranca,
        cobranca_texto: p.cobranca_texto || '',
        cobranca_resolvida: p.cobranca_resolvida,
    });
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: any) => setF((prev) => ({ ...prev, [k]: v }));

    const salvar = async () => {
        setSaving(true);
        await fetch(`/api/perdidos/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
        onSaved();
    };

    const label = 'text-[12px] font-semibold text-zinc-400 block mb-1';
    const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-[14px] text-white focus:border-red-500 outline-none';

    return (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
                    <h3 className="font-bold text-white">Pesquisa — {p.cliente_nome || 'Sem nome'}</h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <span className={label}>Resultado do contato</span>
                        <select value={f.status_auditoria} onChange={(e) => set('status_auditoria', e.target.value)} className={inputCls}>
                            <option value="contatado">Contatado — conversei com o cliente</option>
                            <option value="sem_resposta">Sem resposta</option>
                            <option value="resolvido">Resolvido — auditoria encerrada</option>
                            <option value="pendente">Voltar pra pendente</option>
                        </select>
                    </div>
                    <div>
                        <span className={label}>Foi bem atendido?</span>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => set('bem_atendido', f.bem_atendido === true ? null : true)} className={`py-2.5 rounded-lg border text-[13px] font-bold ${f.bem_atendido === true ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-zinc-700 text-zinc-400'}`}>👍 Sim</button>
                            <button onClick={() => set('bem_atendido', f.bem_atendido === false ? null : false)} className={`py-2.5 rounded-lg border text-[13px] font-bold ${f.bem_atendido === false ? 'bg-red-600 border-red-500 text-white' : 'border-zinc-700 text-zinc-400'}`}>👎 Não</button>
                        </div>
                    </div>
                    <div>
                        <span className={label}>Nota do atendimento (1–5)</span>
                        <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button key={n} onClick={() => set('nota', f.nota === n ? null : n)} className={`flex-1 py-2 rounded-lg border text-sm font-black ${f.nota != null && n <= f.nota ? 'bg-amber-500 border-amber-400 text-black' : 'border-zinc-700 text-zinc-500'}`}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <span className={label}>Ficou alguma dúvida? (do cliente)</span>
                        <input className={inputCls} value={f.duvidas} onChange={(e) => set('duvidas', e.target.value)} placeholder="Ex.: queria saber de financiamento…" />
                    </div>
                    <div>
                        <span className={label}>Comentário da auditoria</span>
                        <textarea className={inputCls} rows={2} value={f.comentario} onChange={(e) => set('comentario', e.target.value)} placeholder="O que o cliente relatou" />
                    </div>

                    <div className={`rounded-xl border p-3 ${f.gerar_cobranca ? 'border-fuchsia-500/40 bg-fuchsia-500/5' : 'border-zinc-800'}`}>
                        <button onClick={() => set('gerar_cobranca', !f.gerar_cobranca)} className="flex items-center gap-2 text-[13px] font-bold text-white w-full">
                            <span className={`w-9 h-5 rounded-full relative transition-colors ${f.gerar_cobranca ? 'bg-fuchsia-500' : 'bg-zinc-700'}`}>
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${f.gerar_cobranca ? 'left-4.5 right-0.5' : 'left-0.5'}`} />
                            </span>
                            <Flag className="w-4 h-4 text-fuchsia-400" /> Gerar cobrança no vendedor
                        </button>
                        {f.gerar_cobranca && (
                            <>
                                <textarea className={`${inputCls} mt-2`} rows={2} value={f.cobranca_texto} onChange={(e) => set('cobranca_texto', e.target.value)} placeholder={`O que cobrar do ${p.vendedor_nome?.split(' ')[0] || 'vendedor'} (aparece no War Room dele)`} />
                                {p.gerar_cobranca && (
                                    <label className="flex items-center gap-2 mt-2 text-[12px] text-zinc-400">
                                        <input type="checkbox" checked={f.cobranca_resolvida} onChange={(e) => set('cobranca_resolvida', e.target.checked)} />
                                        Cobrança resolvida (conversei com o vendedor)
                                    </label>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 px-5 py-3.5 border-t border-zinc-800 sticky bottom-0 bg-zinc-900">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-zinc-300 hover:bg-zinc-800 text-sm font-semibold">Cancelar</button>
                    <button onClick={salvar} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar auditoria'}</button>
                </div>
            </div>
        </div>
    );
}
