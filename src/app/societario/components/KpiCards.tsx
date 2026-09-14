'use client';

import React from 'react';
import { KpisSocietarios } from '@/lib/services/societarioService';
import { 
    TrendingUp, 
    DollarSign, 
    Receipt, 
    PiggyBank, 
    UserCheck, 
    Wallet 
} from 'lucide-react';

interface KpiCardsProps {
    kpis: KpisSocietarios;
}

export function KpiCards({ kpis }: KpiCardsProps) {
    const formatBRL = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            {/* 1. Volume de Vendas */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Volume Vendas</span>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                </div>
                <div className="text-xl font-bold text-white tracking-tight">{formatBRL(kpis.volumeVendas)}</div>
                <p className="text-[11px] text-slate-500 mt-1">Total bruto faturado</p>
            </div>

            {/* 2. Custo de Aquisição */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-blue-500/50 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Custo Aquisição</span>
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                        <DollarSign className="w-5 h-5" />
                    </div>
                </div>
                <div className="text-xl font-bold text-white tracking-tight">{formatBRL(kpis.custoAquisicaoTotal)}</div>
                <p className="text-[11px] text-slate-500 mt-1">Custo inicial de estoque</p>
            </div>

            {/* 3. Comissões e Custos */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/50 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Custos & Comissões</span>
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                        <Receipt className="w-5 h-5" />
                    </div>
                </div>
                <div className="text-xl font-bold text-amber-400 tracking-tight">{formatBRL(kpis.comissoesECustosTotal)}</div>
                <p className="text-[11px] text-slate-500 mt-1">Oficina, NF e Vendedores</p>
            </div>

            {/* 4. Lucro Líquido Realizado */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-purple-500/50 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lucro Líquido</span>
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                        <PiggyBank className="w-5 h-5" />
                    </div>
                </div>
                <div className="text-xl font-bold text-purple-400 tracking-tight">{formatBRL(kpis.lucroLiquidoTotal)}</div>
                <p className="text-[11px] text-slate-500 mt-1">Margem líquida apurada</p>
            </div>

            {/* 5. Cota Alexandre */}
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-cyan-400 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-400" />
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" /> Alexandre
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-medium">50%</span>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">{formatBRL(kpis.alexandre.saldoDisponivel)}</div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 border-t border-slate-800/80 pt-1.5">
                    <span>Cota: {formatBRL(kpis.alexandre.cotaTotal)}</span>
                    <span className="text-amber-400">Saques: {formatBRL(kpis.alexandre.retiradas)}</span>
                </div>
            </div>

            {/* 6. Cota Ivo */}
            <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-indigo-400 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400" />
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5" /> Ivo
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">50%</span>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">{formatBRL(kpis.ivo.saldoDisponivel)}</div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 border-t border-slate-800/80 pt-1.5">
                    <span>Cota: {formatBRL(kpis.ivo.cotaTotal)}</span>
                    <span className="text-amber-400">Saques: {formatBRL(kpis.ivo.retiradas)}</span>
                </div>
            </div>
        </div>
    );
}
