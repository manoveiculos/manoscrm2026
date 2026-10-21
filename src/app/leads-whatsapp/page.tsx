'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
    RefreshCw, Lock, ShieldCheck, MessageCircle, Search, Phone, MapPin,
    Car, CreditCard, Repeat, X, Save, ExternalLink, Users, Flame, Trophy, XCircle, Trash2,
} from 'lucide-react';

const ALLOWED = ['alexandre_gorges@hotmail.com', 'dultra49@gmail.com'];
const ADMIN_EMAIL = 'alexandre_gorges@hotmail.com';
const TABLE = 'leads_whatsapp_direto_wilsol';

type Status = 'novo' | 'em_atendimento' | 'agendado' | 'visitou' | 'proposta' | 'vendido' | 'perdido' | 'sem_resposta';

interface Lead {
    id: string;
    created_at: string;
    nome: string | null;
    telefone_lead: string;
    cidade: string | null;
    tem_troca: string | null;
    qual_troca: string | null;
    pagamento: string | null;
    veiculo_interesse: string | null;
    mensagem_texto: string | null;
    vendedor_telefone: string | null;
    vendedor_nome: string | null;
    status: Status;
    motivo_perda: string | null;
    observacoes: string | null;
    proximo_contato: string | null;
    valor_venda: number | null;
}

const STATUS: Record<Status, { label: string; cls: string }> = {
    novo: { label: 'Novo', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/20' },
    em_atendimento: { label: 'Em atendimento', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
    agendado: { label: 'Agendado', cls: 'bg-violet-500/10 text-violet-300 border-violet-500/20' },
    visitou: { label: 'Visitou', cls: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' },
    proposta: { label: 'Proposta', cls: 'bg-orange-500/10 text-orange-300 border-orange-500/20' },
    vendido: { label: 'Vendido', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
    perdido: { label: 'Perdido', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
    sem_resposta: { label: 'Sem resposta', cls: 'bg-white/5 text-white/50 border-white/10' },
};

const pretty = (v: string | null) => (v ? v.replace(/_/g, ' ').replace(/\s*,\s*/g, ', ') : '—');
const onlyDigits = (v: string) => v.replace(/\D/g, '');
const fmtDate = (d: string) =>
    new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const toLocalInput = (d: string | null) => {
    if (!d) return '';
    const dt = new Date(d);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function LeadsWhatsappPage() {
    const router = useRouter();
    const [autorizado, setAutorizado] = useState<boolean | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState<Status | 'todos'>('todos');
    const [selecionado, setSelecionado] = useState<Lead | null>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
        if (error) setErro(error.message);
        setLeads((data as Lead[]) || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        (async () => {
            const { data } = await supabase.auth.getSession();
            const e = data?.session?.user?.email?.toLowerCase() || null;
            setEmail(e);
            if (e && ALLOWED.includes(e)) {
                setAutorizado(true);
                carregar();
            } else {
                setAutorizado(false);
                setTimeout(() => router.push('/'), 3000);
            }
        })();
    }, [carregar, router]);

    // Realtime: novos leads aparecem sozinhos
    useEffect(() => {
        if (!autorizado) return;
        const ch = supabase
            .channel('lwd-wilsol')
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => carregar())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [autorizado, carregar]);

    const filtrados = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return leads.filter(l => {
            if (filtroStatus !== 'todos' && l.status !== filtroStatus) return false;
            if (!q) return true;
            return [l.nome, l.telefone_lead, l.cidade, l.veiculo_interesse, l.qual_troca, l.vendedor_nome]
                .some(v => v?.toLowerCase().includes(q));
        });
    }, [leads, busca, filtroStatus]);

    const kpis = useMemo(() => {
        const hoje = new Date().toDateString();
        const total = leads.length;
        const vendidos = leads.filter(l => l.status === 'vendido').length;
        return {
            total,
            hoje: leads.filter(l => new Date(l.created_at).toDateString() === hoje).length,
            novos: leads.filter(l => l.status === 'novo').length,
            vendidos,
            perdidos: leads.filter(l => l.status === 'perdido').length,
            conversao: total ? ((vendidos / total) * 100).toFixed(1) : '0.0',
        };
    }, [leads]);

    if (autorizado === null) {
        return (
            <div className="min-h-screen bg-[#0C0C0F] flex items-center justify-center text-white/50 gap-3">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" /> Carregando...
            </div>
        );
    }

    if (autorizado === false) {
        return (
            <div className="min-h-screen bg-[#0C0C0F] flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Acesso Negado</h2>
                    <p className="text-sm text-slate-400">Módulo exclusivo de <strong>Alexandre</strong> e <strong>Wilson</strong>.</p>
                    <p className="text-xs text-slate-500">Redirecionando...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0C0C0F] text-white p-4 md:p-8">
            <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <span className="inline-flex px-2.5 py-1 mb-2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Restrito: Alexandre & Wilson
                    </span>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                        <MessageCircle className="w-8 h-8 text-emerald-500" /> Leads WhatsApp Direto
                    </h1>
                    <p className="text-sm text-white/50 mt-1">Leads de formulário que caem direto no WhatsApp do vendedor.</p>
                </div>
                <button
                    id="lwd-refresh"
                    onClick={carregar}
                    className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white transition-all flex items-center gap-2 text-xs font-bold"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} /> Atualizar
                </button>
            </header>

            <main className="max-w-7xl mx-auto space-y-6">
                {/* KPIs */}
                <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Kpi icon={Users} label="Total" value={kpis.total} accent="text-white" />
                    <Kpi icon={Flame} label="Hoje" value={kpis.hoje} accent="text-amber-400" />
                    <Kpi icon={MessageCircle} label="Sem contato" value={kpis.novos} accent="text-sky-400" />
                    <Kpi icon={Trophy} label={`Vendidos · ${kpis.conversao}%`} value={kpis.vendidos} accent="text-emerald-400" />
                    <Kpi icon={XCircle} label="Perdidos" value={kpis.perdidos} accent="text-rose-400" />
                </section>

                {/* Filtros */}
                <section className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                            id="lwd-search"
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Buscar nome, telefone, cidade, veículo..."
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-emerald-500/40"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {(['todos', ...Object.keys(STATUS)] as (Status | 'todos')[]).map(s => (
                            <button
                                key={s}
                                id={`lwd-filter-${s}`}
                                onClick={() => setFiltroStatus(s)}
                                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
                                    filtroStatus === s
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                        : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white'
                                }`}
                            >
                                {s === 'todos' ? 'Todos' : STATUS[s].label}
                            </button>
                        ))}
                    </div>
                </section>

                {erro && (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
                        Erro ao carregar: {erro}
                    </div>
                )}

                {/* Tabela */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/[0.03] text-white/40 text-[11px] uppercase tracking-wider">
                                <tr>
                                    <th className="text-left px-4 py-3">Chegou</th>
                                    <th className="text-left px-4 py-3">Lead</th>
                                    <th className="text-left px-4 py-3">Interesse</th>
                                    <th className="text-left px-4 py-3">Troca</th>
                                    <th className="text-left px-4 py-3">Pagamento</th>
                                    <th className="text-left px-4 py-3">Status</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {!loading && filtrados.length === 0 && (
                                    <tr><td colSpan={7} className="text-center py-12 text-white/30">Nenhum lead encontrado.</td></tr>
                                )}
                                {filtrados.map(l => (
                                    <tr
                                        key={l.id}
                                        onClick={() => setSelecionado(l)}
                                        className="border-t border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                                    >
                                        <td className="px-4 py-3 text-white/50 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold">{l.nome || '—'}</div>
                                            <div className="text-xs text-white/40">{l.telefone_lead} · {l.cidade || '—'}</div>
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-emerald-300">{l.veiculo_interesse || '—'}</td>
                                        <td className="px-4 py-3 text-white/60 max-w-[220px]">
                                            <div className="truncate">{l.qual_troca || pretty(l.tem_troca)}</div>
                                        </td>
                                        <td className="px-4 py-3 text-white/60 capitalize">{pretty(l.pagamento)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-lg border text-[11px] font-bold ${STATUS[l.status]?.cls}`}>
                                                {STATUS[l.status]?.label || l.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <a
                                                href={`https://wa.me/${onlyDigits(l.telefone_lead)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                className="inline-flex p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                                title="Abrir WhatsApp"
                                            >
                                                <Phone className="w-4 h-4" />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            {selecionado && (
                <DetalheLead
                    lead={selecionado}
                    email={email}
                    onClose={() => setSelecionado(null)}
                    onSaved={() => { setSelecionado(null); carregar(); }}
                />
            )}
        </div>
    );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-4 hover:border-white/20 transition-all">
            <div className="flex items-center gap-2 text-white/40 text-[11px] font-bold uppercase tracking-wider">
                <Icon className={`w-4 h-4 ${accent}`} /> {label}
            </div>
            <div className={`text-3xl font-black mt-2 ${accent}`}>{value}</div>
        </div>
    );
}

function DetalheLead({ lead, email, onClose, onSaved }: {
    lead: Lead; email: string | null; onClose: () => void; onSaved: () => void;
}) {
    const [status, setStatus] = useState<Status>(lead.status);
    const [vendedor, setVendedor] = useState(lead.vendedor_nome || '');
    const [obs, setObs] = useState(lead.observacoes || '');
    const [motivo, setMotivo] = useState(lead.motivo_perda || '');
    const [proximo, setProximo] = useState(toLocalInput(lead.proximo_contato));
    const [valor, setValor] = useState(lead.valor_venda?.toString() || '');
    const [salvando, setSalvando] = useState(false);
    const [excluindo, setExcluindo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const isAdmin = email === ADMIN_EMAIL;

    const excluir = async () => {
        if (!isAdmin) return;
        if (!window.confirm(`Apagar definitivamente o lead "${lead.nome || lead.telefone_lead}"?`)) return;
        setExcluindo(true);
        setErro(null);
        const { error } = await supabase.from(TABLE).delete().eq('id', lead.id);
        setExcluindo(false);
        if (error) setErro(error.message);
        else onSaved();
    };

    const salvar = async () => {
        setSalvando(true);
        setErro(null);
        const { error } = await supabase.from(TABLE).update({
            status,
            vendedor_nome: vendedor || null,
            observacoes: obs || null,
            motivo_perda: status === 'perdido' ? motivo || null : null,
            proximo_contato: proximo ? new Date(proximo).toISOString() : null,
            valor_venda: status === 'vendido' && valor ? Number(valor.replace(',', '.')) : null,
            atualizado_por: email,
        }).eq('id', lead.id);
        setSalvando(false);
        if (error) setErro(error.message);
        else onSaved();
    };

    const input = 'w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm focus:outline-none focus:border-emerald-500/40';

    return (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#121217] border border-white/10 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 border-b border-white/10">
                    <div>
                        <h2 className="text-xl font-black">{lead.nome || 'Sem nome'}</h2>
                        <p className="text-xs text-white/40 mt-0.5">Chegou em {fmtDate(lead.created_at)}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/50"><X className="w-4 h-4" /></button>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <Info icon={Phone} label="Telefone" value={lead.telefone_lead} />
                    <Info icon={MapPin} label="Cidade" value={lead.cidade || '—'} />
                    <Info icon={Car} label="Interesse" value={lead.veiculo_interesse || '—'} />
                    <Info icon={CreditCard} label="Pagamento" value={pretty(lead.pagamento)} />
                    <Info icon={Repeat} label="Tem troca" value={pretty(lead.tem_troca)} />
                    <Info icon={Car} label="Veículo da troca" value={lead.qual_troca || '—'} />
                    {lead.vendedor_telefone && <Info icon={Phone} label="WhatsApp vendedor" value={lead.vendedor_telefone} />}
                </div>

                <div className="px-5 pb-5 space-y-4">
                    <div>
                        <label className="text-[11px] font-bold uppercase text-white/40">Status</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {(Object.keys(STATUS) as Status[]).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatus(s)}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                        status === s ? STATUS[s].cls + ' ring-1 ring-white/20' : 'border-white/10 text-white/40 hover:text-white'
                                    }`}
                                >
                                    {STATUS[s].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-[11px] font-bold uppercase text-white/40">Vendedor</label>
                            <input id="lwd-vendedor" className={input} value={vendedor} onChange={e => setVendedor(e.target.value)} placeholder="Nome do vendedor" />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold uppercase text-white/40">Próximo contato</label>
                            <input id="lwd-proximo" type="datetime-local" className={input} value={proximo} onChange={e => setProximo(e.target.value)} />
                        </div>
                        {status === 'vendido' && (
                            <div>
                                <label className="text-[11px] font-bold uppercase text-white/40">Valor da venda (R$)</label>
                                <input id="lwd-valor" className={input} value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                            </div>
                        )}
                        {status === 'perdido' && (
                            <div>
                                <label className="text-[11px] font-bold uppercase text-white/40">Motivo da perda</label>
                                <input id="lwd-motivo" className={input} value={motivo} onChange={e => setMotivo(e.target.value)} />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[11px] font-bold uppercase text-white/40">Observações</label>
                        <textarea id="lwd-obs" rows={3} className={input} value={obs} onChange={e => setObs(e.target.value)} />
                    </div>

                    {erro && <p className="text-rose-400 text-xs">{erro}</p>}

                    <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-between">
                        <div className="flex flex-col md:flex-row gap-2">
                        {isAdmin && (
                            <button
                                id="lwd-delete"
                                onClick={excluir}
                                disabled={excluindo}
                                className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-rose-500/20 disabled:opacity-50"
                            >
                                <Trash2 className="w-4 h-4" /> {excluindo ? 'Apagando...' : 'Apagar lead'}
                            </button>
                        )}
                        <a
                            href={`https://wa.me/${onlyDigits(lead.telefone_lead)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-500/20"
                        >
                            <ExternalLink className="w-4 h-4" /> Chamar no WhatsApp
                        </a>
                        </div>
                        <button
                            id="lwd-save"
                            onClick={salvar}
                            disabled={salvando}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                        >
                            <Save className="w-4 h-4" /> {salvando ? 'Salvando...' : 'Salvar acompanhamento'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
            <div className="text-[10px] uppercase font-bold text-white/30 flex items-center gap-1.5">
                <Icon className="w-3 h-3" /> {label}
            </div>
            <div className="mt-1 font-semibold capitalize-first">{value}</div>
        </div>
    );
}
