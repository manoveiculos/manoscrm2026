'use client';

import React, { useState } from 'react';
import {
    Gem,
    Plus,
    Car,
    Home,
    Coins,
    CreditCard,
    TrendingUp,
    TrendingDown,
    CheckCircle,
    Edit2,
    Trash2,
    Check,
    X,
    Building,
    User,
} from 'lucide-react';
import { FinPatrimonio, GrupoPatrimonio, GRUPO_LABEL, GRUPOS_ATIVO, GRUPOS_PASSIVO, Escopo } from '@/lib/financeiro/types';
import { brl, dataBR } from '@/lib/financeiro/format';

interface Props {
    itens: FinPatrimonio[];
    totais: {
        totalCaixa: number;
        totalAtivosBens: number;
        totalAtivosGeral: number;
        totalPassivos: number;
        patrimonioLiquido: number;
    };
    onSalvarItem: (dados: any) => Promise<boolean>;
    onAtualizarValor: (id: string, novoValor: number) => Promise<boolean>;
    onAlternarAtivo: (id: string, ativo: boolean) => Promise<boolean>;
    onExcluirItem: (id: string) => Promise<boolean>;
}

export function AbaPatrimonio({
    itens,
    totais,
    onSalvarItem,
    onAtualizarValor,
    onAlternarAtivo,
    onExcluirItem,
}: Props) {
    const [modalAberto, setModalAberto] = useState(false);
    const [editandoItem, setEditandoItem] = useState<FinPatrimonio | null>(null);

    // Form modal state
    const [nome, setNome] = useState('');
    const [tipo, setTipo] = useState<'ativo' | 'passivo'>('ativo');
    const [grupo, setGrupo] = useState<GrupoPatrimonio>('veiculo');
    const [escopo, setEscopo] = useState<Escopo>('PF');
    const [valorAtual, setValorAtual] = useState('');
    const [placa, setPlaca] = useState('');
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    // Inline edit value state
    const [editandoValorId, setEditandoValorId] = useState<string | null>(null);
    const [novoValorInput, setNovoValorInput] = useState('');

    const ativos = itens.filter(i => i.tipo === 'ativo' && i.ativo);
    const passivos = itens.filter(i => i.tipo === 'passivo' && i.ativo);
    const baixados = itens.filter(i => !i.ativo);

    const abrirModalNovo = (tipoInicial: 'ativo' | 'passivo' = 'ativo') => {
        setEditandoItem(null);
        setTipo(tipoInicial);
        setGrupo(tipoInicial === 'ativo' ? 'veiculo' : 'financiamento');
        setNome('');
        setEscopo('PF');
        setValorAtual('');
        setPlaca('');
        setObservacao('');
        setModalAberto(true);
    };

    const handleSalvar = async (e: React.FormEvent) => {
        e.preventDefault();
        const v = parseFloat(valorAtual.replace(',', '.'));
        if (isNaN(v) || v < 0 || !nome.trim()) return;

        setSalvando(true);
        try {
            const ok = await onSalvarItem({
                id: editandoItem?.id,
                nome: nome.trim(),
                tipo,
                grupo,
                escopo,
                valor_atual: v,
                placa: placa.trim() || null,
                observacao: observacao.trim() || null,
            });
            if (ok) setModalAberto(false);
        } finally {
            setSalvando(false);
        }
    };

    const iniciarEdicaoValor = (item: FinPatrimonio) => {
        setEditandoValorId(item.id);
        setNovoValorInput(String(item.valor_atual));
    };

    const salvarEdicaoValor = async (id: string) => {
        const v = parseFloat(novoValorInput.replace(',', '.'));
        if (!isNaN(v) && v >= 0) {
            await onAtualizarValor(id, v);
        }
        setEditandoValorId(null);
    };

    const getIconeGrupo = (g: GrupoPatrimonio) => {
        switch (g) {
            case 'veiculo': return <Car className="w-4 h-4 text-amber-400" />;
            case 'imovel': return <Home className="w-4 h-4 text-emerald-400" />;
            case 'a_receber': return <Coins className="w-4 h-4 text-blue-400" />;
            case 'financiamento':
            case 'emprestimo':
            case 'divida': return <CreditCard className="w-4 h-4 text-rose-400" />;
            default: return <Gem className="w-4 h-4 text-purple-400" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Banner Superior de Explicação contra Perda de Capital */}
            <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/20 rounded-3xl p-5 md:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Gem className="w-5 h-5 text-purple-400" />
                        <h2 className="text-lg font-black text-white">Fluxo de Patrimônio Líquido</h2>
                    </div>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                        Aqui você enxerga a <strong>realidade do seu dinheiro</strong>. Comprar um carro não é perda de capital: o dinheiro do caixa vira ativo. O que importa é se o seu Patrimônio Líquido (Bens + Caixa − Dívidas) está crescendo dia a dia.
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => abrirModalNovo('ativo')}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Cadastrar Bem / Ativo
                    </button>
                    <button
                        type="button"
                        onClick={() => abrirModalNovo('passivo')}
                        className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs transition-all shadow-md flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Cadastrar Dívida
                    </button>
                </div>
            </div>

            {/* Grid 2 Colunas: Ativos (Bens) x Passivos (Dívidas) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Coluna 1: Ativos */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                <TrendingUp className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white">Ativos & Bens</h3>
                                <p className="text-[11px] text-slate-400">Veículos, imóveis, promissórias e caixa</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Ativos</span>
                            <span className="text-base font-black text-emerald-400">{brl(totais.totalAtivosGeral)}</span>
                        </div>
                    </div>

                    {/* Caixa Livre (Item fixo automático) */}
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                                💵
                            </div>
                            <div>
                                <span className="text-xs font-bold text-white block">Caixa Livre (Saldo das Contas)</span>
                                <span className="text-[10px] text-emerald-400 font-semibold">Calculado automaticamente das contas</span>
                            </div>
                        </div>
                        <span className="text-sm font-black text-emerald-400 font-mono">{brl(totais.totalCaixa)}</span>
                    </div>

                    {/* Lista de Bens Cadastrados */}
                    <div className="space-y-2">
                        {ativos.length === 0 ? (
                            <div className="py-8 text-center text-slate-500 text-xs">
                                Nenhum bem cadastrado. Clique em "+ Cadastrar Bem / Ativo" acima.
                            </div>
                        ) : (
                            ativos.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                                            {getIconeGrupo(item.grupo)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-white">{item.nome}</span>
                                                {item.placa && (
                                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[9px] font-bold">
                                                        {item.placa}
                                                    </span>
                                                )}
                                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] font-bold">
                                                    {item.escopo}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400">
                                                {GRUPO_LABEL[item.grupo]} {item.observacao ? `• ${item.observacao}` : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Valor e Ações */}
                                    <div className="flex items-center gap-2">
                                        {editandoValorId === item.id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    value={novoValorInput}
                                                    onChange={(e) => setNovoValorInput(e.target.value)}
                                                    className="w-24 bg-slate-900 border border-emerald-500 rounded px-1.5 py-0.5 text-xs text-white font-mono outline-none"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => salvarEdicaoValor(item.id)}
                                                    className="p-1 rounded bg-emerald-500 text-slate-950"
                                                >
                                                    <Check className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={() => setEditandoValorId(null)}
                                                    className="p-1 rounded bg-slate-800 text-slate-400"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span
                                                onClick={() => iniciarEdicaoValor(item)}
                                                className="text-xs font-black text-emerald-400 font-mono cursor-pointer hover:underline"
                                                title="Clique para atualizar valor de mercado"
                                            >
                                                {brl(item.valor_atual)}
                                            </span>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => onAlternarAtivo(item.id, false)}
                                            className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-amber-400 transition-colors"
                                            title="Baixar / Marcar como Vendido"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onExcluirItem(item.id)}
                                            className="p-1 rounded-md hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Coluna 2: Passivos (Dívidas) */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                                <TrendingDown className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white">Dívidas & Passivos</h3>
                                <p className="text-[11px] text-slate-400">Financiamentos, empréstimos e parcelas</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Dívidas</span>
                            <span className="text-base font-black text-rose-400">{brl(totais.totalPassivos)}</span>
                        </div>
                    </div>

                    {/* Lista de Dívidas Cadastradas */}
                    <div className="space-y-2">
                        {passivos.length === 0 ? (
                            <div className="py-8 text-center text-slate-500 text-xs">
                                Nenhuma dívida ativa cadastrada. Parabéns!
                            </div>
                        ) : (
                            passivos.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                                            {getIconeGrupo(item.grupo)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-white">{item.nome}</span>
                                                {item.placa && (
                                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[9px] font-bold">
                                                        {item.placa}
                                                    </span>
                                                )}
                                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] font-bold">
                                                    {item.escopo}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400">
                                                {GRUPO_LABEL[item.grupo]} {item.observacao ? `• ${item.observacao}` : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Valor e Ações */}
                                    <div className="flex items-center gap-2">
                                        {editandoValorId === item.id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    value={novoValorInput}
                                                    onChange={(e) => setNovoValorInput(e.target.value)}
                                                    className="w-24 bg-slate-900 border border-rose-500 rounded px-1.5 py-0.5 text-xs text-white font-mono outline-none"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => salvarEdicaoValor(item.id)}
                                                    className="p-1 rounded bg-rose-500 text-white"
                                                >
                                                    <Check className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={() => setEditandoValorId(null)}
                                                    className="p-1 rounded bg-slate-800 text-slate-400"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span
                                                onClick={() => iniciarEdicaoValor(item)}
                                                className="text-xs font-black text-rose-400 font-mono cursor-pointer hover:underline"
                                                title="Clique para atualizar saldo devedor"
                                            >
                                                {brl(item.valor_atual)}
                                            </span>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => onAlternarAtivo(item.id, false)}
                                            className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-emerald-400 transition-colors"
                                            title="Quitar / Marcar como Pago"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onExcluirItem(item.id)}
                                            className="p-1 rounded-md hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Novo Item de Patrimônio */}
            {modalAberto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-base font-black text-white">
                                {tipo === 'ativo' ? 'Cadastrar Bem / Ativo' : 'Cadastrar Dívida / Passivo'}
                            </h3>
                            <button onClick={() => setModalAberto(false)} className="p-1 text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSalvar} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Nome / Descrição*</label>
                                <input
                                    type="text"
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    placeholder={tipo === 'ativo' ? 'Ex: Golf 2014, Terreno, Promissória...' : 'Ex: Financiamento Tucson, Empréstimo...'}
                                    required
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Grupo</label>
                                    <select
                                        value={grupo}
                                        onChange={(e) => setGrupo(e.target.value as GrupoPatrimonio)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white text-xs outline-none"
                                    >
                                        {(tipo === 'ativo' ? GRUPOS_ATIVO : GRUPOS_PASSIVO).map((g) => (
                                            <option key={g} value={g} className="bg-slate-900">{GRUPO_LABEL[g]}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Escopo</label>
                                    <select
                                        value={escopo}
                                        onChange={(e) => setEscopo(e.target.value as Escopo)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white text-xs outline-none font-bold"
                                    >
                                        <option value="PF" className="bg-slate-900">PF (Pessoal)</option>
                                        <option value="PJ" className="bg-slate-900">PJ (Empresa)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Valor Atual (R$)*</label>
                                    <input
                                        type="text"
                                        value={valorAtual}
                                        onChange={(e) => setValorAtual(e.target.value)}
                                        placeholder="0,00"
                                        required
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-black text-sm outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Placa (se for veículo)</label>
                                    <input
                                        type="text"
                                        value={placa}
                                        onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                                        placeholder="ABC1D23"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Observações</label>
                                <textarea
                                    value={observacao}
                                    onChange={(e) => setObservacao(e.target.value)}
                                    placeholder="Ex: Parcela 12 de 48, Quitação prevista em nov/2026..."
                                    rows={2}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs outline-none"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setModalAberto(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={salvando}
                                    className={`px-5 py-2 rounded-xl font-black text-xs transition-all shadow-md ${
                                        tipo === 'ativo'
                                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                            : 'bg-rose-500 hover:bg-rose-400 text-white'
                                    }`}
                                >
                                    {salvando ? 'Salvando...' : 'Salvar no Patrimônio'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
