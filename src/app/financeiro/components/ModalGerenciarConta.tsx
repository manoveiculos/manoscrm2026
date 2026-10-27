'use client';

import React, { useState, useEffect } from 'react';
import { X, CreditCard, Landmark, Banknote, TrendingUp, Trash2, Check } from 'lucide-react';
import { FinConta, Escopo } from '@/lib/financeiro/types';
import { brl } from '@/lib/financeiro/format';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSalvar: (dados: any) => Promise<boolean>;
    onExcluir?: (id: string) => Promise<boolean>;
    contaParaEditar?: FinConta | null;
}

const CORES_SUGERIDAS = [
    '#10b981', // emerald
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#f59e0b', // amber
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#ef4444', // red
    '#64748b', // slate
];

export function ModalGerenciarConta({
    isOpen,
    onClose,
    onSalvar,
    onExcluir,
    contaParaEditar,
}: Props) {
    const [nome, setNome] = useState('');
    const [tipo, setTipo] = useState<'banco' | 'dinheiro' | 'cartao' | 'investimento'>('banco');
    const [escopo, setEscopo] = useState<Escopo>('PF');
    const [saldoInicial, setSaldoInicial] = useState('');
    const [cor, setCor] = useState('#10b981');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (contaParaEditar) {
            setNome(contaParaEditar.nome);
            setTipo(contaParaEditar.tipo);
            setEscopo(contaParaEditar.escopo);
            setSaldoInicial(String(contaParaEditar.saldo_inicial || 0));
            setCor(contaParaEditar.cor || '#10b981');
        } else {
            setNome('');
            setTipo('banco');
            setEscopo('PF');
            setSaldoInicial('0');
            setCor('#10b981');
        }
    }, [contaParaEditar, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nome.trim()) return;

        const saldo = parseFloat(saldoInicial.replace(',', '.')) || 0;

        setSalvando(true);
        try {
            const ok = await onSalvar({
                id: contaParaEditar?.id,
                nome: nome.trim(),
                tipo,
                escopo,
                saldo_inicial: saldo,
                cor,
            });
            if (ok) onClose();
        } finally {
            setSalvando(false);
        }
    };

    const handleExcluir = async () => {
        if (!contaParaEditar?.id || !onExcluir) return;
        if (!confirm(`Deseja excluir ou desativar a conta "${contaParaEditar.nome}"?`)) return;

        setSalvando(true);
        try {
            const ok = await onExcluir(contaParaEditar.id);
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
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${cor}25`, color: cor }}
                        >
                            <CreditCard className="w-4 h-4" />
                        </div>
                        <h2 className="text-base font-black text-white">
                            {contaParaEditar ? 'Editar Conta' : 'Cadastrar Nova Conta'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Nome da Conta */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Nome da Conta*</label>
                        <input
                            type="text"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            placeholder="Ex: Nubank, Sicredi, Cofre Loja, Dinheiro Carteira..."
                            required
                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-white text-sm outline-none"
                        />
                    </div>

                    {/* Tipo e Escopo */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Tipo de Conta</label>
                            <select
                                value={tipo}
                                onChange={(e) => setTipo(e.target.value as any)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white text-xs outline-none"
                            >
                                <option value="banco" className="bg-slate-900">🏦 Conta Bancária</option>
                                <option value="dinheiro" className="bg-slate-900">💵 Dinheiro Vivo / Cofre</option>
                                <option value="cartao" className="bg-slate-900">💳 Cartão de Crédito</option>
                                <option value="investimento" className="bg-slate-900">📈 Investimento / Reserva</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Escopo</label>
                            <select
                                value={escopo}
                                onChange={(e) => setEscopo(e.target.value as Escopo)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white text-xs outline-none font-bold"
                            >
                                <option value="PF" className="bg-slate-900">👤 PF (Pessoal)</option>
                                <option value="PJ" className="bg-slate-900">🏢 PJ (Empresa)</option>
                            </select>
                        </div>
                    </div>

                    {/* Saldo Inicial */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">
                            {contaParaEditar ? 'Saldo Inicial Base (R$)' : 'Saldo Atual Inicial (R$)'}
                        </label>
                        <input
                            type="text"
                            value={saldoInicial}
                            onChange={(e) => setSaldoInicial(e.target.value)}
                            placeholder="0,00"
                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-mono font-black text-base outline-none"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            O saldo atual será calculado somando as entradas, saídas e transferências a partir desse valor inicial.
                        </p>
                    </div>

                    {/* Paleta de Cores */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1.5">Cor da Conta</label>
                        <div className="flex items-center gap-2">
                            {CORES_SUGERIDAS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCor(c)}
                                    className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 relative"
                                    style={{ backgroundColor: c }}
                                >
                                    {cor === c && <Check className="w-4 h-4 text-white stroke-[3]" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                        {contaParaEditar && onExcluir ? (
                            <button
                                type="button"
                                onClick={handleExcluir}
                                disabled={salvando}
                                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all text-xs font-bold flex items-center gap-1.5"
                            >
                                <Trash2 className="w-4 h-4" /> Desativar / Excluir
                            </button>
                        ) : <div />}

                        <div className="flex items-center gap-2">
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
                                {salvando ? 'Salvando...' : (contaParaEditar ? 'Atualizar Conta' : 'Criar Conta')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
