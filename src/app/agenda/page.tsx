'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Calendar, Plus, Store, Car, MessageCircle, Check, X, CalendarClock, CheckCircle2, Trash2 } from 'lucide-react';
import NovaVisitaModal, { VisitaPrefill } from './_components/NovaVisitaModal';

interface Visita {
    id: string; vendedor_id: string; vendedor_nome?: string; lead_uid?: string | null;
    cliente_nome: string; cliente_telefone?: string; cliente_whatsapp?: string; veiculo_interesse?: string;
    tipo: 'loja' | 'externa'; endereco?: string; data_hora: string; status: string; observacoes?: string;
}

type Range = 'hoje' | 'amanha' | 'semana';

const STATUS_UI: Record<string, { label: string; cls: string }> = {
    agendado: { label: 'Agendado', cls: 'bg-zinc-700 text-zinc-200' },
    confirmado: { label: 'Confirmado', cls: 'bg-blue-600/20 text-blue-300 border border-blue-500/30' },
    compareceu: { label: 'Compareceu', cls: 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' },
    nao_compareceu: { label: 'Não veio', cls: 'bg-red-600/20 text-red-300 border border-red-500/30' },
    remarcado: { label: 'Remarcado', cls: 'bg-amber-600/20 text-amber-300 border border-amber-500/30' },
};

const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString();
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaLabel = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function AgendaPage() {
    const [visitas, setVisitas] = useState<Visita[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [scope, setScope] = useState<'me' | 'all'>('me');
    const [range, setRange] = useState<Range>('hoje');
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ edit: VisitaPrefill | null } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/agenda?scope=${scope}`, { cache: 'no-store' });
            const json = await res.json();
            if (json.success) { setVisitas(json.agendamentos); setIsAdmin(json.isAdmin); }
        } catch { /* noop */ } finally { setLoading(false); }
    }, [scope]);

    useEffect(() => { load(); }, [load]);

    // Abre o modal já preenchido quando vem de um lead (/agenda?novo=1&nome=...)
    useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        if (p.get('novo') === '1') {
            setModal({ edit: {
                cliente_nome: p.get('nome') || '',
                cliente_whatsapp: p.get('tel') || '',
                veiculo_interesse: p.get('veiculo') || '',
                lead_uid: p.get('lead') || null,
            } });
            window.history.replaceState({}, '', '/agenda');
        }
    }, []);

    const hoje = new Date();
    const amanha = new Date(Date.now() + 86400_000);
    const filtradas = useMemo(() => {
        if (range === 'hoje') return visitas.filter((v) => sameDay(v.data_hora, hoje));
        if (range === 'amanha') return visitas.filter((v) => sameDay(v.data_hora, amanha));
        const lim = Date.now() + 7 * 86400_000;
        return visitas.filter((v) => new Date(v.data_hora).getTime() <= lim);
    }, [visitas, range]); // eslint-disable-line

    // Agrupa por dia (útil na visão Semana)
    const grupos = useMemo(() => {
        const g = new Map<string, Visita[]>();
        for (const v of filtradas) { const k = new Date(v.data_hora).toDateString(); (g.get(k) || g.set(k, []).get(k)!).push(v); }
        return [...g.entries()];
    }, [filtradas]);

    const patch = async (id: string, body: any) => { await fetch(`/api/agenda/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); load(); };
    const excluir = async (v: Visita) => { if (!confirm(`Excluir a visita de ${v.cliente_nome}?`)) return; await fetch(`/api/agenda/${v.id}`, { method: 'DELETE' }); load(); };

    const RangeTab = ({ r, label }: { r: Range; label: string }) => (
        <button onClick={() => setRange(r)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${range === r ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>{label}</button>
    );

    return (
        <div className="p-4 md:p-8 max-w-3xl mx-auto w-full pb-28">
            <div className="mb-4">
                <h1 className="text-2xl font-black text-white flex items-center gap-2"><Calendar className="w-6 h-6 text-red-500" /> Agenda</h1>
                <p className="text-xs text-zinc-500 mt-0.5">Toda conversa vira visita. Dia sem visita marcada é dia que não rendeu.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-5">
                <RangeTab r="hoje" label="Hoje" />
                <RangeTab r="amanha" label="Amanhã" />
                <RangeTab r="semana" label="Semana" />
                {isAdmin && (
                    <div className="ml-auto flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5">
                        <button onClick={() => setScope('me')} className={`px-3 py-1.5 rounded text-[12px] font-bold ${scope === 'me' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>Minhas</button>
                        <button onClick={() => setScope('all')} className={`px-3 py-1.5 rounded text-[12px] font-bold ${scope === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>Loja toda</button>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="text-zinc-500 py-10 text-center">Carregando…</div>
            ) : filtradas.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl">
                    <CalendarClock className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                    <p className="text-zinc-300 font-semibold">Nenhuma visita {range === 'hoje' ? 'hoje' : range === 'amanha' ? 'amanhã' : 'nesta semana'}.</p>
                    <p className="text-zinc-500 text-sm mt-1">Toda conversa tem que virar visita — bora agendar.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {grupos.map(([dia, lista]) => (
                        <div key={dia}>
                            {range === 'semana' && <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold mb-2 px-1">{diaLabel(lista[0].data_hora)}</div>}
                            <div className="space-y-2.5">
                                {lista.map((v) => {
                                    const su = STATUS_UI[v.status] || STATUS_UI.agendado;
                                    const wa = (v.cliente_whatsapp || v.cliente_telefone || '').replace(/\D/g, '');
                                    return (
                                        <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl font-black text-white tabular-nums">{hhmm(v.data_hora)}</span>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${su.cls}`}>{su.label}</span>
                                                    </div>
                                                    <div className="text-[15px] font-bold text-white mt-1 truncate">{v.cliente_nome}</div>
                                                    {v.veiculo_interesse && <div className="text-[13px] text-zinc-400 truncate">{v.veiculo_interesse}</div>}
                                                    {isAdmin && scope === 'all' && <div className="text-[11px] text-zinc-500 mt-0.5">Vendedor: {v.vendedor_nome}</div>}
                                                </div>
                                                <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg ${v.tipo === 'loja' ? 'bg-blue-600/15 text-blue-300' : 'bg-purple-600/15 text-purple-300'}`}>
                                                    {v.tipo === 'loja' ? <><Store className="w-3.5 h-3.5" /> Loja</> : <><Car className="w-3.5 h-3.5" /> Externa</>}
                                                </span>
                                            </div>
                                            {v.tipo === 'externa' && v.endereco && <div className="text-[12px] text-zinc-500 mt-1.5">📍 {v.endereco}</div>}
                                            {v.observacoes && <div className="text-[12px] text-zinc-500 mt-1.5 italic">“{v.observacoes}”</div>}

                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {v.status === 'agendado' && <Act onClick={() => patch(v.id, { status: 'confirmado' })} icon={<Check className="w-3.5 h-3.5" />} label="Confirmar" />}
                                                <Act onClick={() => patch(v.id, { status: 'compareceu' })} icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Veio" tone="green" />
                                                <Act onClick={() => patch(v.id, { status: 'nao_compareceu' })} icon={<X className="w-3.5 h-3.5" />} label="Faltou" tone="red" />
                                                <Act onClick={() => setModal({ edit: { ...v } })} icon={<CalendarClock className="w-3.5 h-3.5" />} label="Remarcar" />
                                                {wa && <a href={`https://wa.me/55${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
                                                <button onClick={() => excluir(v)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold text-zinc-500 hover:text-red-400 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button onClick={() => setModal({ edit: null })} className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold shadow-2xl shadow-red-900/40 active:scale-95 transition-transform">
                <Plus className="w-5 h-5" /> Nova visita
            </button>

            {modal && <NovaVisitaModal edit={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
        </div>
    );
}

function Act({ onClick, icon, label, tone }: { onClick: () => void; icon: React.ReactNode; label: string; tone?: 'green' | 'red' }) {
    const cls = tone === 'green' ? 'bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20'
        : tone === 'red' ? 'bg-red-600/10 text-red-300 hover:bg-red-600/20'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700';
    return <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold ${cls}`}>{icon} {label}</button>;
}
