'use client';

import React, { useState, useEffect } from 'react';
import { X, Lock, CheckCircle2, AlertCircle, Building, Landmark, Coins } from 'lucide-react';
import { FinConta } from '@/lib/financeiro/types';
import { brl, dataBR, hojeISO, inicioMes, addDias } from '@/lib/financeiro/format';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    contas: FinConta[];
    contaIdInicial?: string;
    onRealizarFechamento: (dados: any) => Promise<boolean>;
}

export function ModalFechamentoConta({
    isOpen,
    onClose,
    contas,
    contaIdInicial,
    onRealizarFechamento,
}: Props) {
    const [contaId, setContaId] = useState<string>('');
    const [dataInicio, setDataInicio] = useState(inicioMes(hojeISO()));
    const [dataFim, setDataFim] = useState(hojeISO());
    const [titulo, setTitulo] = useState('');
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (contaIdInicial) {
            setContaId(contaIdInicial);
        } else {
            setContaId('');
        }
        setDataInicio(inicioMes(hojeISO()));
        setDataFim(hojeISO());
        setTitulo('');
        setObservacao('');
    }, [contaIdInicial, isOpen]);

    if (!isOpen) return null;

    const contaSelecionada = contas.find(c => c.id === contaId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dataInicio || !dataFim) return;

        setSalvando(true);
        try {
            const ok = await onRealizarFechamento({
                conta_id: contaId || null,
                data_inicio: dataInicio,
                data_fim: dataFim,
                titulo: titulo.trim() || undefined,
                observacao: observacao.trim() || undefined,
            });
            if (ok) onClose();
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Lock className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white">
                                {contaSelecionada ? `Fechamento: ${contaSelecionada.nome}` : 'Fechamento de Caixa'}
                            </h2>
                            <p className="text-[11px] text-slate-400">Conferência e trava de período</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Seleção da Conta (Individual ou Geral) */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Qual conta deseja fechar?</label>
                        <select
                            value={contaId}
                            onChange={(e) => setContaId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold text-xs outline-none"
                        >
                            <option value="" className="bg-slate-900">🌐 Fechamento Geral (Todas as Contas Juntas)</option>
                            {contas.map((c) => (
                                <option key={c.id} value={c.id} className="bg-slate-900">
                                    {c.nome} — Saldo Atual: {brl(c.saldo)}
                                </option>
                            ))}
                        </select>
                        {contaSelecionada && (
                            <p className="text-[11px] text-emerald-400 font-semibold mt-1">
                                Saldo atual desta conta no sistema: {brl(contaSelecionada.saldo)}
                            </p>
                        )}
                    </div>

                    {/* Datas Início e Fim */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Data Início*</label>
                            <input
                                type="date"
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Data Fim*</label>
                            <input
                                type="date"
                                value={dataFim}
                                onChange={(e) => setDataFim(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs outline-none"
                            />
                        </div>
                    </div>

                    {/* Título */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Título do Fechamento (opcional)</label>
                        <input
                            type="text"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder={contaSelecionada ? `Ex: Fechamento ${contaSelecionada.nome} Outubro` : 'Ex: Fechamento Geral Outubro'}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs outline-none"
                        />
                    </div>

                    {/* Observações / Auditoria */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Observações de Conferência</label>
                        <textarea
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            placeholder="Ex: Saldo conferido com o extrato bancário, dinheiro contado no cofre..."
                            rows={2}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs outline-none"
                        />
                    </div>

                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Os lançamentos deste período serão <strong>travados</strong> contra alterações. O saldo final vira o saldo inicial do próximo período.
                        </span>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={salvando}
                            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-md"
                        >
                            {salvando ? 'Fechando Período...' : 'Concluir Fechamento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
