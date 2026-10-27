'use client';

import React from 'react';
import {
    Wallet,
    Gem,
    TrendingUp,
    TrendingDown,
    Clock,
    ArrowUpRight,
    ArrowDownRight,
    Building2,
    ShieldAlert,
    CreditCard,
    Coins,
    Plus,
    ArrowRightLeft,
    Lock,
    Edit2,
    Banknote,
    Landmark,
} from 'lucide-react';
import { brl } from '@/lib/financeiro/format';
import { FinConta } from '@/lib/financeiro/types';

interface KpisData {
    totalCaixa: number;
    patrimonioLiquido: number;
    totalAtivosBens: number;
    totalPassivos: number;
    totalEntradas: number;
    totalSaidas: number;
    resultadoPeriodo: number;
    resultadoOperacional: number;
    aPagar7d: number;
    aReceber7d: number;
}

interface Props {
    kpis: KpisData;
    contas: FinConta[];
    onEditarConta: (conta: FinConta) => void;
    onNovaConta: () => void;
    onTransferir: (contaOrigemId?: string) => void;
    onFecharConta: (contaId?: string) => void;
}

export function KpiCardsFinanceiro({
    kpis,
    contas,
    onEditarConta,
    onNovaConta,
    onTransferir,
    onFecharConta,
}: Props) {
    const isResultadoPositivo = kpis.resultadoPeriodo >= 0;
    const isPatrimonioPositivo = kpis.patrimonioLiquido >= 0;

    const getIconeTipoConta = (tipo: string) => {
        switch (tipo) {
            case 'dinheiro': return <Banknote className="w-3.5 h-3.5 text-emerald-400" />;
            case 'cartao': return <CreditCard className="w-3.5 h-3.5 text-rose-400" />;
            case 'investimento': return <TrendingUp className="w-3.5 h-3.5 text-purple-400" />;
            default: return <Landmark className="w-3.5 h-3.5 text-blue-400" />;
        }
    };

    return (
        <div className="space-y-4">
            {/* 4 Cards Principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Caixa Livre */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Caixa Livre (Saldo Total)
                        </span>
                        <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Wallet className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">
                        {brl(kpis.totalCaixa)}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>{contas.length} contas cadastradas</span>
                        <button
                            type="button"
                            onClick={() => onTransferir()}
                            className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                            <ArrowRightLeft className="w-3 h-3" /> Transferir
                        </button>
                    </div>
                </div>

                {/* 2. Patrimônio Líquido */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 border border-purple-500/20 rounded-3xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Patrimônio Líquido
                        </span>
                        <div className="w-9 h-9 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                            <Gem className="w-5 h-5" />
                        </div>
                    </div>
                    <div className={`text-2xl md:text-3xl font-black tracking-tight mb-2 ${
                        isPatrimonioPositivo ? 'text-purple-300' : 'text-rose-400'
                    }`}>
                        {brl(kpis.patrimonioLiquido)}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="text-emerald-400">Ativos: {brl(kpis.totalAtivosBens + kpis.totalCaixa)}</span>
                        <span className="text-rose-400">Dívidas: {brl(kpis.totalPassivos)}</span>
                    </div>
                </div>

                {/* 3. Resultado do Período */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Resultado no Período
                        </span>
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
                            isResultadoPositivo
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                        }`}>
                            {isResultadoPositivo ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        </div>
                    </div>
                    <div className={`text-2xl md:text-3xl font-black tracking-tight mb-2 ${
                        isResultadoPositivo ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                        {kpis.resultadoPeriodo >= 0 ? '+' : ''}{brl(kpis.resultadoPeriodo)}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="flex items-center gap-1 text-emerald-400">
                            <ArrowUpRight className="w-3 h-3" /> {brl(kpis.totalEntradas)}
                        </span>
                        <span className="flex items-center gap-1 text-rose-400">
                            <ArrowDownRight className="w-3 h-3" /> {brl(kpis.totalSaidas)}
                        </span>
                    </div>
                </div>

                {/* 4. Previsão 7 Dias */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Previsão Próximos 7 Dias
                        </span>
                        <div className="w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                            <Clock className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">
                        {brl(kpis.aReceber7d - kpis.aPagar7d)}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="text-emerald-400">Receber: {brl(kpis.aReceber7d)}</span>
                        <span className="text-amber-400">Pagar: {brl(kpis.aPagar7d)}</span>
                    </div>
                </div>
            </div>

            {/* Painel de Contas Individuais (Saldos Atuais + Ações Rápidas) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 md:p-5 shadow-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
                            <CreditCard className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white">Saldos das Contas & Fechamentos Individuais</h3>
                            <p className="text-[11px] text-slate-400">Acompanhamento e conciliação de cada conta em tempo real</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onTransferir()}
                            className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 font-bold text-xs transition-all flex items-center gap-1.5"
                        >
                            <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir Entre Contas
                        </button>
                        <button
                            type="button"
                            onClick={onNovaConta}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5"
                        >
                            <Plus className="w-3.5 h-3.5" /> Cadastrar Nova Conta
                        </button>
                    </div>
                </div>

                {/* Grid das Contas Individuais */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {contas.map((c) => {
                        const saldoNum = Number(c.saldo || 0);
                        const isPositivo = saldoNum >= 0;

                        return (
                            <div
                                key={c.id}
                                className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between group space-y-3 relative overflow-hidden"
                            >
                                {/* Barra colorida lateral */}
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-1"
                                    style={{ backgroundColor: c.cor || '#10b981' }}
                                />

                                {/* Cabeçalho da Conta */}
                                <div>
                                    <div className="flex items-center justify-between gap-1 mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                            {getIconeTipoConta(c.tipo)}
                                            <span className="font-bold text-xs text-white truncate max-w-[130px]">
                                                {c.nome}
                                            </span>
                                        </div>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                                            c.escopo === 'PJ'
                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                        }`}>
                                            {c.escopo}
                                        </span>
                                    </div>

                                    {/* Saldo Atual */}
                                    <div className="text-lg md:text-xl font-black font-mono tracking-tight text-white">
                                        {brl(saldoNum)}
                                    </div>
                                    <span className="text-[10px] text-slate-500">
                                        Saldo inicial: {brl(c.saldo_inicial)}
                                    </span>
                                </div>

                                {/* Ações Rápidas da Conta */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                                    <button
                                        type="button"
                                        onClick={() => onTransferir(c.id)}
                                        className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-colors"
                                        title="Transferir a partir desta conta"
                                    >
                                        <ArrowRightLeft className="w-3 h-3" /> Transf.
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onFecharConta(c.id)}
                                        className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition-colors"
                                        title="Fechar / Conciliar o caixa desta conta"
                                    >
                                        <Lock className="w-3 h-3" /> Fechar
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onEditarConta(c)}
                                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                                        title="Editar conta ou ajustar saldo inicial"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
