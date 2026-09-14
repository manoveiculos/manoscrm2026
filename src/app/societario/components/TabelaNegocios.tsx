'use client';

import React, { useState } from 'react';
import { Search, Eye, Car, ArrowRightLeft, FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface TabelaNegociosProps {
    veiculos: any[];
    onSelectVeiculo: (veiculo: any) => void;
}

export function TabelaNegocios({ veiculos, onSelectVeiculo }: TabelaNegociosProps) {
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('todos');

    const formatBRL = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    const [filtroLoja, setFiltroLoja] = useState('todas');

    const veiculosFiltrados = veiculos.filter((v) => {
        const termo = busca.toLowerCase();
        const bateBusca = 
            (v.placa || '').toLowerCase().includes(termo) ||
            (v.modelo || '').toLowerCase().includes(termo) ||
            (v.marca || '').toLowerCase().includes(termo) ||
            (v.chassi || '').toLowerCase().includes(termo);

        if (!bateBusca) return false;

        const lojaV = v.loja_atual || 'manos';
        if (filtroLoja === 'manos' && lojaV !== 'manos') return false;
        if (filtroLoja === 'v3' && lojaV !== 'v3') return false;

        if (filtroStatus === 'vendido') return v.status === 'vendido';
        if (filtroStatus === 'disponivel') return v.status === 'disponivel';
        if (filtroStatus === 'permuta') return v.origem === 'permuta_troca';
        return true;
    });

    return (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl shadow-xl backdrop-blur-sm overflow-hidden mb-8">
            {/* Header da Tabela com Filtros */}
            <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Car className="w-5 h-5 text-emerald-400" /> Listagem Consolidada de Negócios
                    </h2>
                    <p className="text-xs text-slate-400">Apuração de entrada, saída, margem líquida e repasses dos gestores</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Filtro de Loja */}
                    <select
                        value={filtroLoja}
                        onChange={(e) => setFiltroLoja(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 font-semibold"
                    >
                        <option value="todas">🏬 Todas as Lojas</option>
                        <option value="manos">🏬 Manos Veículos</option>
                        <option value="v3">🏎️ V3 Automóveis</option>
                    </select>

                    {/* Campo de Busca */}
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                            type="text"
                            placeholder="Buscar por placa, modelo ou chassi..."
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-4 py-2 w-56 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    {/* Filtros de Status */}
                    <select
                        value={filtroStatus}
                        onChange={(e) => setFiltroStatus(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                    >
                        <option value="todos">Todos os Veículos</option>
                        <option value="vendido">Vendidos / Liquidados</option>
                        <option value="disponivel">Em Estoque (Disponível)</option>
                        <option value="permuta">Entrados em Troca / Permuta</option>
                    </select>
                </div>
            </div>

            {/* Tabela de Operações */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                        <tr>
                            <th className="px-4 py-3">Placa / Veículo</th>
                            <th className="px-4 py-3">Loja / Origem</th>
                            <th className="px-4 py-3 text-right">Compra (Entrada)</th>
                            <th className="px-4 py-3 text-right">Venda (Saída)</th>
                            <th className="px-4 py-3 text-right">Custos Extras</th>
                            <th className="px-4 py-3 text-right">Lucro Líquido</th>
                            <th className="px-4 py-3 text-right text-cyan-400">Repasse Alexandre</th>
                            <th className="px-4 py-3 text-right text-indigo-400">Repasse Ivo</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {veiculosFiltrados.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                                    Nenhum veículo encontrado com os filtros aplicados.
                                </td>
                            </tr>
                        ) : (
                            veiculosFiltrados.map((v) => {
                                const contratoVenda = Array.isArray(v.contratos_venda) ? v.contratos_venda[0] : v.contratos_venda;
                                const fechamento = Array.isArray(v.fechamentos_lucro) ? v.fechamentos_lucro[0] : v.fechamentos_lucro;

                                const vCompra = Number(v.custo_aquisicao_inicial || 0);
                                const vVenda = Number(contratoVenda?.valor_venda_fechado || fechamento?.valor_venda || 0);
                                const custosExtras = Number(fechamento?.total_custos_extras || 0);
                                const lucroLiquido = fechamento
                                    ? Number(fechamento.lucro_liquido || 0)
                                    : v.status === 'vendido' ? vVenda - vCompra - custosExtras : 0;

                                const cotaAlexandre = fechamento ? Number(fechamento.cota_alexandre || 0) : lucroLiquido * 0.5;
                                const cotaIvo = fechamento ? Number(fechamento.cota_ivo || 0) : lucroLiquido * 0.5;
                                const lojaNome = v.loja_atual === 'v3' ? 'V3 Automóveis' : 'Manos Veículos';

                                return (
                                    <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                                        {/* Placa / Veículo */}
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-white flex items-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono tracking-wider text-emerald-400">
                                                    {v.placa || 'SEM PLACA'}
                                                </span>
                                                <span>{v.marca} {v.modelo}</span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">
                                                Ano: {v.ano_fabricacao || '-'}/{v.ano_modelo || '-'} | KM: {v.km?.toLocaleString('pt-BR') || 0}
                                            </div>
                                        </td>

                                        {/* Loja / Origem */}
                                        <td className="px-4 py-3 space-y-1">
                                            <div className="text-[10px]">
                                                <span className={`px-2 py-0.5 rounded font-bold ${
                                                    v.loja_atual === 'v3' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                                }`}>
                                                    {lojaNome}
                                                </span>
                                            </div>
                                            {v.origem === 'permuta_troca' ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">
                                                    <ArrowRightLeft className="w-3 h-3" /> Permuta
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                                                    <FileText className="w-3 h-3" /> Compra Direta
                                                </span>
                                            )}
                                        </td>

                                        {/* Valor Compra */}
                                        <td className="px-4 py-3 text-right font-mono font-medium text-slate-300">
                                            {formatBRL(vCompra)}
                                        </td>

                                        {/* Valor Venda */}
                                        <td className="px-4 py-3 text-right font-mono font-medium text-emerald-400">
                                            {vVenda > 0 ? formatBRL(vVenda) : '-'}
                                        </td>

                                        {/* Custos Extras */}
                                        <td className="px-4 py-3 text-right font-mono text-amber-400">
                                            {custosExtras > 0 ? formatBRL(custosExtras) : 'R$ 0,00'}
                                        </td>

                                        {/* Lucro Líquido */}
                                        <td className="px-4 py-3 text-right font-mono font-bold">
                                            {v.status === 'vendido' ? (
                                                <span className={lucroLiquido >= 0 ? 'text-purple-400' : 'text-rose-400'}>
                                                    {formatBRL(lucroLiquido)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-500">Em estoque</span>
                                            )}
                                        </td>

                                        {/* Repasse Alexandre */}
                                        <td className="px-4 py-3 text-right font-mono text-cyan-400 font-medium">
                                            {v.status === 'vendido' ? formatBRL(cotaAlexandre) : '-'}
                                        </td>

                                        {/* Repasse Ivo */}
                                        <td className="px-4 py-3 text-right font-mono text-indigo-400 font-medium">
                                            {v.status === 'vendido' ? formatBRL(cotaIvo) : '-'}
                                        </td>

                                        {/* Status Badge */}
                                        <td className="px-4 py-3 text-center">
                                            {v.status === 'vendido' ? (
                                                v.aprovado_alexandre_em && v.aprovado_ivo_em ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                        <CheckCircle2 className="w-3 h-3" /> Aprovada
                                                    </span>
                                                ) : v.aprovado_alexandre_em || v.aprovado_ivo_em ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                                        <AlertTriangle className="w-3 h-3" /> Falta {v.aprovado_alexandre_em ? 'Ivo' : 'Alexandre'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-500/10 text-slate-300 border border-slate-500/30 whitespace-nowrap">
                                                        <Clock className="w-3 h-3" /> Aguardando aprovação
                                                    </span>
                                                )
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                                    <Clock className="w-3 h-3" /> Disponível
                                                </span>
                                            )}
                                        </td>

                                        {/* Ações */}
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => onSelectVeiculo(v)}
                                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors"
                                                title="Ver Detalhes da Operação"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
