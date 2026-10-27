'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, ArrowDown, Wallet, ArrowRight } from 'lucide-react';
import { FinConta } from '@/lib/financeiro/types';
import { brl, hojeISO } from '@/lib/financeiro/format';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    contas: FinConta[];
    contaOrigemInicial?: string;
    onRealizarTransferencia: (dados: any) => Promise<boolean>;
}

export function ModalTransferencia({
    isOpen,
    onClose,
    contas,
    contaOrigemInicial,
    onRealizarTransferencia,
}: Props) {
    const [contaOrigemId, setContaOrigemId] = useState('');
    const [contaDestinoId, setContaDestinoId] = useState('');
    const [valor, setValor] = useState('');
    const [data, setData] = useState(hojeISO());
    const [descricao, setDescricao] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (contas.length >= 2) {
            const origem = contaOrigemInicial || contas[0].id;
            setContaOrigemId(origem);
            const destino = contas.find(c => c.id !== origem)?.id || contas[1].id;
            setContaDestinoId(destino);
        } else if (contas.length === 1) {
            setContaOrigemId(contas[0].id);
        }
        setValor('');
        setData(hojeISO());
        setDescricao('');
    }, [contas, contaOrigemInicial, isOpen]);

    if (!isOpen) return null;

    const contaOrigem = contas.find(c => c.id === contaOrigemId);
    const contaDestino = contas.find(c => c.id === contaDestinoId);

    const valorNum = parseFloat(valor.replace(',', '.')) || 0;
    const saldoOrigemPos = (contaOrigem?.saldo || 0) - valorNum;
    const saldoDestinoPos = (contaDestino?.saldo || 0) + valorNum;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (valorNum <= 0 || !contaOrigemId || !contaDestinoId) return;
        if (contaOrigemId === contaDestinoId) {
            alert('A conta de origem e destino devem ser diferentes!');
            return;
        }

        setSalvando(true);
        try {
            const desc = descricao.trim() || `Transferência ${contaOrigem?.nome} → ${contaDestino?.nome}`;
            const ok = await onRealizarTransferencia({
                tipo: 'transferencia',
                valor: valorNum,
                data,
                descricao: desc,
                conta_id: contaOrigemId,
                conta_destino_id: contaDestinoId,
                status: 'pago',
                escopo: contaOrigem?.escopo || 'PF',
            });
            if (ok) onClose();
        } finally {
            setSalvando(false);
        }
    };

    const inverterContas = () => {
        const aux = contaOrigemId;
        setContaOrigemId(contaDestinoId);
        setContaDestinoId(aux);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                            <ArrowRightLeft className="w-4 h-4" />
                        </div>
                        <h2 className="text-base font-black text-white">Transferência Entre Contas</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Contas Origem x Destino com botão de inverter */}
                    <div className="space-y-2 relative">
                        {/* Origem */}
                        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-400">Sai da Conta (Origem):</span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                    Saldo: <strong className="text-white">{brl(contaOrigem?.saldo)}</strong>
                                </span>
                            </div>
                            <select
                                value={contaOrigemId}
                                onChange={(e) => setContaOrigemId(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-bold text-xs outline-none"
                            >
                                {contas.map((c) => (
                                    <option key={c.id} value={c.id} disabled={c.id === contaDestinoId}>
                                        {c.nome} ({brl(c.saldo)})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Botão de Inverter */}
                        <div className="flex justify-center -my-2 relative z-10">
                            <button
                                type="button"
                                onClick={inverterContas}
                                className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 hover:border-blue-500 hover:text-blue-400 text-slate-300 flex items-center justify-center shadow-lg transition-all"
                                title="Inverter contas"
                            >
                                <ArrowDown className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Destino */}
                        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-400">Entra na Conta (Destino):</span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                    Saldo: <strong className="text-white">{brl(contaDestino?.saldo)}</strong>
                                </span>
                            </div>
                            <select
                                value={contaDestinoId}
                                onChange={(e) => setContaDestinoId(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-bold text-xs outline-none"
                            >
                                {contas.map((c) => (
                                    <option key={c.id} value={c.id} disabled={c.id === contaOrigemId}>
                                        {c.nome} ({brl(c.saldo)})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Valor e Data */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Valor a Transferir (R$)*</label>
                            <input
                                type="text"
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                placeholder="0,00"
                                required
                                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-white font-mono font-black text-base outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Data*</label>
                            <input
                                type="date"
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-xs outline-none"
                            />
                        </div>
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Descrição / Motivo (opcional)</label>
                        <input
                            type="text"
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Ex: Saque para pagar no dinheiro, aporte de caixa..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs outline-none"
                        />
                    </div>

                    {/* Simulação em tempo real dos saldos */}
                    {valorNum > 0 && (
                        <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 space-y-1 animate-in fade-in">
                            <span className="font-bold block text-[11px] text-blue-300">Simulação de Saldos:</span>
                            <div className="flex items-center justify-between text-[11px]">
                                <span>{contaOrigem?.nome}:</span>
                                <span className="font-mono">{brl(contaOrigem?.saldo)} → <strong className="text-white">{brl(saldoOrigemPos)}</strong></span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                                <span>{contaDestino?.nome}:</span>
                                <span className="font-mono">{brl(contaDestino?.saldo)} → <strong className="text-white">{brl(saldoDestinoPos)}</strong></span>
                            </div>
                        </div>
                    )}

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
                            disabled={salvando || valorNum <= 0}
                            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs transition-all shadow-md flex items-center gap-1.5"
                        >
                            {salvando ? 'Transferindo...' : 'Confirmar Transferência'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
