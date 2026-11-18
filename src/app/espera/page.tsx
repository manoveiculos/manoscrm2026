'use client';

import { useCallback, useEffect, useState } from 'react';
import { CarFront, Check, Plus, X, TrendingUp, BellRing } from 'lucide-react';
import { formatarTelefoneBR } from '@/lib/telefone';

interface Pedido {
    id: string; telefone_key: string; nome_cliente: string | null; texto_original: string;
    preco_max: number | null; ano_min: number | null; origem: string; status: 'aguardando' | 'avisado';
    criado_em: string; avisado_em: string | null;
}
interface Demanda { chave: string; carro: string; pessoas: number; maisAntigoDias: number; precoMedio: number | null }

const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;
const dias = (iso: string) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return d <= 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`;
};

export default function EsperaPage() {
    const [pedidos, setPedidos] = useState<Pedido[]>([]);
    const [ranking, setRanking] = useState<Demanda[]>([]);
    const [veTudo, setVeTudo] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [novo, setNovo] = useState(false);
    const [form, setForm] = useState({ nome: '', telefone: '', carro: '', preco_max: '' });
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await fetch('/api/espera', { cache: 'no-store' });
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'erro');
            setPedidos(j.pedidos); setRanking(j.ranking || []); setVeTudo(Boolean(j.veTudo)); setErro(null);
        } catch (e) { setErro(e instanceof Error ? e.message : 'erro ao carregar'); } finally { setCarregando(false); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    async function encerrar(id: string, status: 'atendido' | 'cancelado') {
        await fetch('/api/espera', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
        carregar();
    }
    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setSalvando(true); setErro(null);
        try {
            const r = await fetch('/api/espera', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome: form.nome, telefone: form.telefone, carro: form.carro, preco_max: Number(form.preco_max.replace(/\D/g, '')) || undefined }),
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'erro ao salvar');
            setForm({ nome: '', telefone: '', carro: '', preco_max: '' }); setNovo(false); carregar();
        } catch (e2) { setErro(e2 instanceof Error ? e2.message : 'erro ao salvar'); } finally { setSalvando(false); }
    }

    const aguardando = pedidos.filter(p => p.status === 'aguardando');
    const avisados = pedidos.filter(p => p.status === 'avisado');
    const campo = 'w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500';

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2"><CarFront className="w-5 h-5" /> Procurando carro</h1>
                    <p className="text-sm text-zinc-400 mt-1">Clientes que pediram um carro que não temos. Quando ele entrar no estoque, a Laura avisa o cliente e você recebe um aviso.</p>
                </div>
                <button onClick={() => setNovo(v => !v)} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 text-zinc-900 px-3 py-2 text-sm font-medium hover:bg-white">
                    <Plus className="w-4 h-4" /> Novo pedido
                </button>
            </header>

            {erro && <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">{erro}</div>}

            {novo && (
                <form onSubmit={salvar} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 grid gap-3 sm:grid-cols-2">
                    <input className={campo} placeholder="Nome do cliente" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
                    <input className={campo} placeholder="WhatsApp com DDD" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} required />
                    <input className={`${campo} sm:col-span-2`} placeholder="Carro que ele quer (ex.: Civic automático)" value={form.carro} onChange={e => setForm({ ...form, carro: e.target.value })} required />
                    <input className={campo} placeholder="Até quanto paga (opcional)" inputMode="numeric" value={form.preco_max} onChange={e => setForm({ ...form, preco_max: e.target.value })} />
                    <button disabled={salvando} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-3 py-2">{salvando ? 'Salvando…' : 'Salvar pedido'}</button>
                </form>
            )}

            {veTudo && ranking.length > 0 && (
                <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4" /> O que mais falta no estoque</h2>
                    <ul className="divide-y divide-zinc-800">
                        {ranking.map(d => (
                            <li key={d.chave} className="py-2 flex items-center justify-between gap-3 text-sm">
                                <span className="text-zinc-100">{d.carro}</span>
                                <span className="text-zinc-400 text-right">
                                    <b className="text-zinc-100">{d.pessoas}</b> {d.pessoas === 1 ? 'pessoa' : 'pessoas'}
                                    {d.precoMedio ? ` · até ${reais(d.precoMedio)}` : ''} · {d.maisAntigoDias === 0 ? 'desde hoje' : `esperando há ${d.maisAntigoDias}d`}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section>
                <h2 className="text-sm font-semibold text-zinc-200 mb-2">Aguardando ({aguardando.length})</h2>
                {carregando ? <p className="text-sm text-zinc-500">Carregando…</p>
                    : aguardando.length === 0 ? <p className="text-sm text-zinc-500">Ninguém esperando carro agora. A Laura registra aqui quando o cliente pede algo que não temos.</p>
                    : <ul className="space-y-2">{aguardando.map(p => (
                        <li key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-zinc-100 font-medium truncate">{p.texto_original}</p>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    {p.nome_cliente || 'Cliente'} · {formatarTelefoneBR(p.telefone_key)}
                                    {p.preco_max ? ` · até ${reais(Number(p.preco_max))}` : ''}{p.ano_min ? ` · ${p.ano_min}+` : ''} · {dias(p.criado_em)} · {p.origem === 'laura' ? 'pedido pela Laura' : 'cadastrado por consultor'}
                                </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                                <button title="Cliente já foi atendido" onClick={() => encerrar(p.id, 'atendido')} className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"><Check className="w-4 h-4" /></button>
                                <button title="Cliente desistiu" onClick={() => encerrar(p.id, 'cancelado')} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"><X className="w-4 h-4" /></button>
                            </div>
                        </li>
                    ))}</ul>}
            </section>

            {avisados.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2"><BellRing className="w-4 h-4" /> Já avisados ({avisados.length})</h2>
                    <ul className="space-y-2">{avisados.map(p => (
                        <li key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-zinc-200 truncate">{p.texto_original}</p>
                                <p className="text-xs text-zinc-400 mt-0.5">{p.nome_cliente || 'Cliente'} · {formatarTelefoneBR(p.telefone_key)} · avisado {p.avisado_em ? dias(p.avisado_em) : ''}</p>
                            </div>
                            <button title="Marcar como atendido" onClick={() => encerrar(p.id, 'atendido')} className="shrink-0 p-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"><Check className="w-4 h-4" /></button>
                        </li>
                    ))}</ul>
                </section>
            )}
        </div>
    );
}
