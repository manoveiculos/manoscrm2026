'use client';

import React, { useState } from 'react';
import {
    Search,
    Filter,
    Download,
    Edit2,
    Trash2,
    ArrowUpRight,
    ArrowDownRight,
    ArrowRightLeft,
    Building,
    User,
    Car,
    Clock,
    CheckCircle2,
} from 'lucide-react';
import { FinLancamento, FinCategoria, FinConta, Escopo, TipoLancamento, StatusLancamento } from '@/lib/financeiro/types';
import { brl, dataBR, Preset, PRESET_LABEL } from '@/lib/financeiro/format';

interface Props {
    lancamentos: FinLancamento[];
    categorias: FinCategoria[];
    contas: FinConta[];
    onEditar: (lanc: FinLancamento) => void;
    onExcluir: (id: string, lanc?: FinLancamento) => void;
    filtroPreset: Preset;
    onMudarPreset: (p: Preset) => void;
    filtroEscopo: string;
    onMudarEscopo: (e: string) => void;
    filtroTipo: string;
    onMudarTipo: (t: string) => void;
    filtroStatus: string;
    onMudarStatus: (s: string) => void;
    filtroConta: string;
    onMudarConta: (c: string) => void;
    busca: string;
    onMudarBusca: (b: string) => void;
}

export function TabelaLancamentos({
    lancamentos,
    categorias,
    contas,
    onEditar,
    onExcluir,
    filtroPreset,
    onMudarPreset,
    filtroEscopo,
    onMudarEscopo,
    filtroTipo,
    onMudarTipo,
    filtroStatus,
    onMudarStatus,
    filtroConta,
    onMudarConta,
    busca,
    onMudarBusca,
}: Props) {
    const presets: Preset[] = ['hoje', 'ontem', 'semana', 'mes', '30d', '90d', 'ano'];

    // Totalizadores dos lançamentos visíveis
    let totalEntradas = 0;
    let totalSaidas = 0;
    for (const l of lancamentos) {
        if (l.tipo === 'entrada') totalEntradas += Number(l.valor || 0);
        else if (l.tipo === 'saida') totalSaidas += Number(l.valor || 0);
    }
    const saldoExtrato = totalEntradas - totalSaidas;

    const exportarCSV = () => {
        const header = ['Data', 'Tipo', 'Descricao', 'Placa', 'Categoria', 'Conta', 'Escopo', 'Status', 'Valor (R$)'];
        const rows = lancamentos.map(l => [
            l.data,
            l.tipo,
            `"${(l.descricao || '').replace(/"/g, '""')}"`,
            l.placa || '',
            `"${((l as any)?.categoria?.nome || '').replace(/"/g, '""')}"`,
            `"${((l as any)?.conta?.nome || '').replace(/"/g, '""')}"`,
            l.escopo,
            l.status,
            (l.valor || 0).toFixed(2).replace('.', ','),
        ]);

        const csvContent = '\uFEFF' + [header.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `financeiro_extrato_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl space-y-4">
            {/* Barra de Filtros e Busca */}
            <div className="flex flex-col gap-3">
                {/* Linha 1: Presets rápidos */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
                        {presets.map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => onMudarPreset(p)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                    filtroPreset === p
                                        ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                                        : 'bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                            >
                                {PRESET_LABEL[p]}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={exportarCSV}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                    >
                        <Download className="w-3.5 h-3.5" /> Exportar CSV
                    </button>
                </div>

                {/* Linha 2: Busca + Filtros Selects */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
                    {/* Busca */}
                    <div className="relative md:col-span-2">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={busca}
                            onChange={(e) => onMudarBusca(e.target.value)}
                            placeholder="Buscar por descrição, placa, valor..."
                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-white text-xs outline-none"
                        />
                    </div>

                    {/* Escopo (PF/PJ) */}
                    <select
                        value={filtroEscopo}
                        onChange={(e) => onMudarEscopo(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white text-xs outline-none"
                    >
                        <option value="todos">Todos Escopos (PF + PJ)</option>
                        <option value="PF">Apenas PF (Pessoal)</option>
                        <option value="PJ">Apenas PJ (Empresa)</option>
                    </select>

                    {/* Tipo */}
                    <select
                        value={filtroTipo}
                        onChange={(e) => onMudarTipo(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white text-xs outline-none"
                    >
                        <option value="todos">Todos Tipos</option>
                        <option value="saida">Saídas (-)</option>
                        <option value="entrada">Entradas (+)</option>
                        <option value="transferencia">Transferências (⇆)</option>
                    </select>

                    {/* Status */}
                    <select
                        value={filtroStatus}
                        onChange={(e) => onMudarStatus(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white text-xs outline-none"
                    >
                        <option value="todos">Todos Status</option>
                        <option value="pago">Apenas Pagos</option>
                        <option value="previsto">Apenas Previstos</option>
                    </select>
                </div>
            </div>

            {/* Tabela de Lançamentos */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3">Data</th>
                            <th className="py-3 px-3">Descrição</th>
                            <th className="py-3 px-3">Categoria</th>
                            <th className="py-3 px-3">Conta</th>
                            <th className="py-3 px-3 text-center">Escopo</th>
                            <th className="py-3 px-3 text-center">Status</th>
                            <th className="py-3 px-3 text-right">Valor</th>
                            <th className="py-3 px-2 text-center w-16">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {lancamentos.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-12 text-center text-slate-500">
                                    Nenhum lançamento encontrado para os filtros selecionados.
                                </td>
                            </tr>
                        ) : (
                            lancamentos.map((l) => {
                                const isEntrada = l.tipo === 'entrada';
                                const isSaida = l.tipo === 'saida';
                                const isTransf = l.tipo === 'transferencia';
                                const cat = (l as any)?.categoria;
                                const conta = (l as any)?.conta;

                                return (
                                    <tr
                                        key={l.id}
                                        className="hover:bg-slate-900/60 transition-colors group cursor-pointer"
                                        onClick={() => onEditar(l)}
                                    >
                                        {/* Data */}
                                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 font-medium">
                                            {dataBR(l.data)}
                                        </td>

                                        {/* Descrição & Placa */}
                                        <td className="py-2.5 px-3">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-semibold text-white">
                                                    {l.descricao}
                                                </span>
                                                {l.placa && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                                                        <Car className="w-2.5 h-2.5" />
                                                        {l.placa}
                                                    </span>
                                                )}
                                                {l.destinacao === 'loja_100' && (
                                                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                                        l.reembolso_status === 'pago'
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                                    }`}>
                                                        {l.reembolso_status === 'pago' ? '✅ Loja (Reembolsado)' : '🏢 100% Loja (A Receber)'}
                                                    </span>
                                                )}
                                                {l.destinacao === 'loja_50' && (
                                                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                                        l.reembolso_status === 'pago'
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                                    }`}>
                                                        {l.reembolso_status === 'pago' ? '✅ Meio a Meio (Pago)' : '🤝 Meio a Meio (A Receber 50%)'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Categoria */}
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            {cat ? (
                                                <span
                                                    className="inline-block px-2 py-0.5 rounded-md font-semibold text-[11px]"
                                                    style={{
                                                        backgroundColor: `${cat.cor || '#64748b'}20`,
                                                        color: cat.cor || '#cbd5e1',
                                                        border: `1px solid ${cat.cor || '#64748b'}40`,
                                                    }}
                                                >
                                                    {cat.nome}
                                                </span>
                                            ) : (
                                                <span className="text-slate-500 italic">—</span>
                                            )}
                                        </td>

                                        {/* Conta */}
                                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                                            {isTransf ? (
                                                <span className="flex items-center gap-1 text-[11px]">
                                                    {conta?.nome || '—'} <ArrowRightLeft className="w-3 h-3 text-blue-400" /> {((l as any)?.conta_destino)?.nome || '—'}
                                                </span>
                                            ) : (
                                                conta?.nome || '—'
                                            )}
                                        </td>

                                        {/* Escopo */}
                                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                l.escopo === 'PJ'
                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                            }`}>
                                                {l.escopo === 'PJ' ? <Building className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                                                {l.escopo}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                            {l.status === 'previsto' ? (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                                                    <Clock className="w-2.5 h-2.5" /> Previsto
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                                    <CheckCircle2 className="w-2.5 h-2.5" /> Pago
                                                </span>
                                            )}
                                        </td>

                                        {/* Valor */}
                                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-black font-mono">
                                            <span className={
                                                isEntrada ? 'text-emerald-400' :
                                                isSaida ? 'text-rose-400' : 'text-blue-400'
                                            }>
                                                {isEntrada ? '+ ' : isSaida ? '- ' : ''}
                                                {brl(l.valor)}
                                            </span>
                                        </td>

                                        {/* Ações */}
                                        <td className="py-2.5 px-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={() => onEditar(l)}
                                                    className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onExcluir(l.id, l)}
                                                    className="p-1 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Rodapé Totalizador do Extrato */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs border-t border-slate-800">
                <span className="text-slate-400">
                    Mostrando <strong className="text-white">{lancamentos.length}</strong> lançamentos no período
                </span>

                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Entradas: {brl(totalEntradas)}
                    </span>
                    <span className="flex items-center gap-1 text-rose-400 font-bold">
                        <ArrowDownRight className="w-3.5 h-3.5" /> Saídas: {brl(totalSaidas)}
                    </span>
                    <span className={`font-black px-2.5 py-1 rounded-xl border ${
                        saldoExtrato >= 0
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}>
                        Resultado: {saldoExtrato >= 0 ? '+' : ''}{brl(saldoExtrato)}
                    </span>
                </div>
            </div>
        </div>
    );
}
