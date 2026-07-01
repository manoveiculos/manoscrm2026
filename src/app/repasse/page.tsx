'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Car, Plus, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Wallet } from 'lucide-react';
import { brl, dateBR, CATEGORIA_LABEL } from './lib';

export default function RepasseInicio() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/repasse/overview', { cache: 'no-store' });
                const json = await res.json();
                if (json.success) setData(json);
            } finally { setLoading(false); }
        })();
    }, []);

    const o = data?.overview;
    const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long' });

    return (
        <div className="px-4 pt-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-xl font-black">Repasse</h1>
                    <p className="text-[11px] text-white/40 capitalize">Controle de {mesNome}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-red-600/15 border border-red-500/20 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-red-500" />
                </div>
            </div>

            {loading || !o ? (
                <div className="text-white/40 text-sm py-10 text-center">Carregando…</div>
            ) : (
                <>
                    {/* Saldo em caixa — número gigante */}
                    <div className="rounded-2xl bg-gradient-to-br from-red-600/20 to-transparent border border-red-500/20 p-5 mb-3">
                        <div className="text-[11px] uppercase tracking-widest text-white/50">Saldo em caixa</div>
                        <div className={`text-4xl font-black mt-1 ${o.saldo >= 0 ? 'text-white' : 'text-red-400'}`}>{brl(o.saldo)}</div>
                        <div className="flex gap-4 mt-3 text-[11px] text-white/50">
                            <span className="flex items-center gap-1"><ArrowUpCircle className="w-3.5 h-3.5 text-green-400" /> Entrou {brl(o.totais.entrada_carros + o.totais.entradas_manuais)}</span>
                            <span className="flex items-center gap-1"><ArrowDownCircle className="w-3.5 h-3.5 text-red-400" /> Saiu {brl(o.totais.saida_carros + o.totais.saidas_manuais)}</span>
                        </div>
                    </div>

                    {/* Resultado do mês + negócios */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <Card>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-white/50">Resultado do mês</span>
                                {o.mes.resultado >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                            </div>
                            <div className={`text-2xl font-black mt-1 ${o.mes.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>{brl(o.mes.resultado)}</div>
                            <div className="text-[10px] text-white/40 mt-0.5">lucro {brl(o.mes.lucro_negocios)} − despesas {brl(o.mes.despesas)}</div>
                        </Card>
                        <Card>
                            <span className="text-[11px] text-white/50">Negócios no mês</span>
                            <div className="text-2xl font-black mt-1">{o.mes.negocios}</div>
                            <div className="text-[10px] text-white/40 mt-0.5">{o.carros.vendidos} vendidos no total</div>
                        </Card>
                    </div>

                    {/* A receber / A pagar */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <Card>
                            <span className="text-[11px] text-white/50">A receber</span>
                            <div className="text-xl font-black mt-1 text-green-400">{brl(o.a_receber)}</div>
                        </Card>
                        <Card>
                            <span className="text-[11px] text-white/50">A pagar</span>
                            <div className="text-xl font-black mt-1 text-red-400">{brl(o.a_pagar)}</div>
                        </Card>
                    </div>

                    {/* Capital em carros / parados */}
                    <Card className="mb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[11px] text-white/50">Capital preso em carros</span>
                                <div className="text-xl font-black mt-1">{brl(o.capital_em_carros)}</div>
                            </div>
                            <Link href="/repasse/carros" className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                                <Car className="w-4 h-4" /> {o.carros.estoque} no estoque
                            </Link>
                        </div>
                        {o.carros.parados > 0 && (
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {o.carros.parados} carro(s) parado(s) +30 dias — dinheiro parado é prejuízo.
                            </div>
                        )}
                    </Card>

                    {/* Ações rápidas */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <Link href="/repasse/carros?novo=1" className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-sm">
                            <Plus className="w-4 h-4" /> Lançar carro
                        </Link>
                        <Link href="/repasse/caixa?novo=1" className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.06] border border-white/10 font-bold text-sm">
                            <Wallet className="w-4 h-4" /> Lançar no caixa
                        </Link>
                    </div>

                    {/* Últimas movimentações */}
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-bold text-white/80">Últimas movimentações</h2>
                        <Link href="/repasse/caixa" className="text-[11px] text-red-400 font-semibold">ver tudo</Link>
                    </div>
                    <div className="space-y-2">
                        {data.extrato.length === 0 && <div className="text-white/40 text-sm py-4 text-center">Nada ainda.</div>}
                        {data.extrato.map((m: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold truncate">{m.descricao}</div>
                                    <div className="text-[10px] text-white/40">{dateBR(m.data)} · {CATEGORIA_LABEL[m.categoria] || m.categoria}{m.pendente ? ' · pendente' : ''}</div>
                                </div>
                                <div className={`text-sm font-black shrink-0 ml-2 ${m.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                                    {m.tipo === 'entrada' ? '+' : '−'}{brl(m.valor)}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 ${className}`}>{children}</div>;
}
