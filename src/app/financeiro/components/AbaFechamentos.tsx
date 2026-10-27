'use client';

import React, { useState } from 'react';
import { Lock, Unlock, Plus, Calendar, AlertCircle, ArrowUpRight, ArrowDownRight, CheckCircle2, CreditCard } from 'lucide-react';
import { FinFechamento, FinConta } from '@/lib/financeiro/types';
import { brl, dataBR, hojeISO, addDias, inicioMes } from '@/lib/financeiro/format';

interface Props {
    fechamentos: FinFechamento[];
    contas: FinConta[];
    onAbrirModalFechamento: (contaId?: string) => void;
    onReabrirFechamento: (id: string) => Promise<boolean>;
}

export function AbaFechamentos({
    fechamentos,
    contas,
    onAbrirModalFechamento,
    onReabrirFechamento,
}: Props) {
    const [filtroContaId, setFiltroContaId] = useState<string>('todos');

    const handleReabrir = async (id: string) => {
        if (!confirm('Reabrir este período irá destravar os lançamentos para edição. Deseja continuar?')) return;
        await onReabrirFechamento(id);
    };

    const fechamentosFiltrados = fechamentos.filter(f => {
        if (filtroContaId === 'todos') return true;
        if (filtroContaId === 'geral') return !f.conta_id;
        return f.conta_id === filtroContaId;
    });

    return (
        <div className="space-y-6">
            {/* Header com CTA de Fechamento */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-lg font-black text-white">Fechamento de Períodos & Contas Individuais</h2>
                    </div>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                        Faça a conferência de cada conta individualmente (ex: Dinheiro Vivo, Nubank, Conta Loja) ou um Fechamento Geral para travar o período e garantir que os saldos fiquem 100% conciliados.
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <select
                        value={filtroContaId}
                        onChange={(e) => setFiltroContaId(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-xs font-bold outline-none"
                    >
                        <option value="todos">Todos os Fechamentos</option>
                        <option value="geral">🌐 Apenas Fechamentos Gerais</option>
                        {contas.map(c => (
                            <option key={c.id} value={c.id}>
                                🏦 {c.nome}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={() => onAbrirModalFechamento()}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Realizar Fechamento
                    </button>
                </div>
            </div>

            {/* Lista de Períodos Fechados */}
            <div className="space-y-3">
                {fechamentosFiltrados.length === 0 ? (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 text-xs space-y-2">
                        <Lock className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                        <p className="font-bold text-slate-400">Nenhum fechamento registrado para este filtro.</p>
                        <p>Você pode fechar contas individuais ou todas juntas quando conferir os números para manter o histórico seguro.</p>
                    </div>
                ) : (
                    fechamentosFiltrados.map((f) => {
                        const conta = (f as any)?.conta;

                        return (
                            <div
                                key={f.id}
                                className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Fechado
                                        </span>
                                        {conta ? (
                                            <span
                                                className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                                                style={{
                                                    backgroundColor: `${conta.cor || '#10b981'}20`,
                                                    color: conta.cor || '#10b981',
                                                    border: `1px solid ${conta.cor || '#10b981'}40`,
                                                }}
                                            >
                                                {conta.nome} ({conta.escopo})
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-bold">
                                                🌐 Fechamento Geral
                                            </span>
                                        )}
                                        <h3 className="text-sm font-black text-white">
                                            {f.titulo || `Fechamento ${dataBR(f.data_inicio)} a ${dataBR(f.data_fim)}`}
                                        </h3>
                                    </div>
                                    <div className="text-xs text-slate-400 flex items-center gap-3">
                                        <span>📅 {dataBR(f.data_inicio)} até {dataBR(f.data_fim)}</span>
                                        {f.observacao && <span>• {f.observacao}</span>}
                                    </div>
                                </div>

                                {/* Indicadores do Fechamento */}
                                <div className="flex flex-wrap items-center gap-4 text-xs">
                                    <div>
                                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Saldo Inicial</span>
                                        <span className="font-mono font-bold text-slate-300">{brl(f.caixa_inicial)}</span>
                                    </div>

                                    <div>
                                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Entradas / Depósitos</span>
                                        <span className="font-mono font-bold text-emerald-400 flex items-center gap-0.5">
                                            <ArrowUpRight className="w-3 h-3" /> {brl(f.entradas)}
                                        </span>
                                    </div>

                                    <div>
                                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Saídas / Pagamentos</span>
                                        <span className="font-mono font-bold text-rose-400 flex items-center gap-0.5">
                                            <ArrowDownRight className="w-3 h-3" /> {brl(f.saidas)}
                                        </span>
                                    </div>

                                    <div className="pl-3 border-l border-slate-800">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Saldo Final Fechado</span>
                                        <span className="font-mono font-black text-base text-white">{brl(f.caixa_final)}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleReabrir(f.id)}
                                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-xs font-bold flex items-center gap-1.5"
                                        title="Reabrir período para ajustes"
                                    >
                                        <Unlock className="w-3.5 h-3.5" /> Reabrir
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
