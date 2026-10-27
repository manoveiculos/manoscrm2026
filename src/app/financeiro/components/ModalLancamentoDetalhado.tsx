'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Trash2, ArrowRightLeft, Car, Building, User, Calendar } from 'lucide-react';
import { FinCategoria, FinConta, FinLancamento, TipoLancamento, Escopo, StatusLancamento, DestinacaoGasto } from '@/lib/financeiro/types';
import { hojeISO } from '@/lib/financeiro/format';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSalvar: (dados: any) => Promise<boolean>;
    onExcluir?: (id: string, lanc?: FinLancamento) => void;
    categorias: FinCategoria[];
    contas: FinConta[];
    lancamentoParaEditar?: FinLancamento | null;
}

export function ModalLancamentoDetalhado({
    isOpen,
    onClose,
    onSalvar,
    onExcluir,
    categorias,
    contas,
    lancamentoParaEditar,
}: Props) {
    const [tipo, setTipo] = useState<TipoLancamento>('saida');
    const [valor, setValor] = useState('');
    const [data, setData] = useState(hojeISO());
    const [descricao, setDescricao] = useState('');
    const [contaId, setContaId] = useState('');
    const [contaDestinoId, setContaDestinoId] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [escopo, setEscopo] = useState<Escopo>('PF');
    const [placa, setPlaca] = useState('');
    const [status, setStatus] = useState<StatusLancamento>('pago');
    const [destinacao, setDestinacao] = useState<DestinacaoGasto>('particular');
    const [criarPatrimonio, setCriarPatrimonio] = useState(false);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (lancamentoParaEditar) {
            setTipo(lancamentoParaEditar.tipo);
            setValor(String(lancamentoParaEditar.valor));
            setData(lancamentoParaEditar.data);
            setDescricao(lancamentoParaEditar.descricao);
            setContaId(lancamentoParaEditar.conta_id || '');
            setContaDestinoId(lancamentoParaEditar.conta_destino_id || '');
            setCategoriaId(lancamentoParaEditar.categoria_id || '');
            setEscopo(lancamentoParaEditar.escopo);
            setPlaca(lancamentoParaEditar.placa || '');
            setStatus(lancamentoParaEditar.status);
            setDestinacao(lancamentoParaEditar.destinacao || 'particular');
            setCriarPatrimonio(false);
        } else {
            setTipo('saida');
            setValor('');
            setData(hojeISO());
            setDescricao('');
            setContaId(contas[0]?.id || '');
            setContaDestinoId(contas[1]?.id || '');
            setCategoriaId('');
            setEscopo('PF');
            setPlaca('');
            setStatus('pago');
            setDestinacao('particular');
            setCriarPatrimonio(false);
        }
    }, [lancamentoParaEditar, contas, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const v = parseFloat(valor.replace(',', '.'));
        if (isNaN(v) || v <= 0 || !descricao.trim()) return;

        setSalvando(true);
        try {
            const ok = await onSalvar({
                id: lancamentoParaEditar?.id,
                tipo,
                valor: v,
                data,
                descricao: descricao.trim(),
                conta_id: contaId || null,
                conta_destino_id: tipo === 'transferencia' ? (contaDestinoId || null) : null,
                categoria_id: categoriaId || null,
                escopo,
                placa: placa.trim() || null,
                status,
                destinacao,
                criar_patrimonio: criarPatrimonio,
            });
            if (ok) onClose();
        } finally {
            setSalvando(false);
        }
    };

    const handleExcluir = () => {
        if (!lancamentoParaEditar?.id || !onExcluir) return;
        const item = lancamentoParaEditar;
        onClose();
        onExcluir(item.id, item);
    };

    const categoriasFiltradas = categorias.filter(c => c.tipo === (tipo === 'transferencia' ? 'saida' : tipo));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white max-h-[95vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h2 className="text-lg font-black text-white">
                        {lancamentoParaEditar ? 'Editar Lançamento' : 'Novo Lançamento Completo'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Seletor Tipo: Entrada / Saída / Transferência */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-800">
                        <button
                            type="button"
                            onClick={() => setTipo('saida')}
                            className={`py-2 rounded-xl text-xs font-bold transition-all ${
                                tipo === 'saida' ? 'bg-rose-500 text-white font-black shadow-md' : 'text-slate-400'
                            }`}
                        >
                            - Saída
                        </button>
                        <button
                            type="button"
                            onClick={() => setTipo('entrada')}
                            className={`py-2 rounded-xl text-xs font-bold transition-all ${
                                tipo === 'entrada' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400'
                            }`}
                        >
                            + Entrada
                        </button>
                        <button
                            type="button"
                            onClick={() => setTipo('transferencia')}
                            className={`py-2 rounded-xl text-xs font-bold transition-all ${
                                tipo === 'transferencia' ? 'bg-blue-500 text-white font-black shadow-md' : 'text-slate-400'
                            }`}
                        >
                            ⇆ Transf.
                        </button>
                    </div>

                    {/* Valor e Data */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Valor (R$)*</label>
                            <input
                                type="text"
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                placeholder="0,00"
                                required
                                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-black text-lg outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Data*</label>
                            <input
                                type="date"
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white text-sm outline-none"
                            />
                        </div>
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Descrição*</label>
                        <input
                            type="text"
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Ex: Compra Golf NYK4I29, Gasolina, Aluguel..."
                            required
                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-white text-sm outline-none"
                        />
                    </div>

                    {/* Contas */}
                    {tipo === 'transferencia' ? (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Sai de:</label>
                                <select
                                    value={contaId}
                                    onChange={(e) => setContaId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm outline-none"
                                >
                                    {contas.map((c) => (
                                        <option key={c.id} value={c.id} className="bg-slate-900">{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Entra em:</label>
                                <select
                                    value={contaDestinoId}
                                    onChange={(e) => setContaDestinoId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm outline-none"
                                >
                                    {contas.map((c) => (
                                        <option key={c.id} value={c.id} className="bg-slate-900">{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Conta</label>
                                <select
                                    value={contaId}
                                    onChange={(e) => setContaId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm outline-none"
                                >
                                    {contas.map((c) => (
                                        <option key={c.id} value={c.id} className="bg-slate-900">{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Categoria</label>
                                <select
                                    value={categoriaId}
                                    onChange={(e) => setCategoriaId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm outline-none"
                                >
                                    <option value="" className="bg-slate-900">Selecione...</option>
                                    {categoriasFiltradas.map((cat) => (
                                        <option key={cat.id} value={cat.id} className="bg-slate-900">{cat.nome}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Destinação do Gasto (Particular vs Loja com Reembolso) */}
                    {tipo === 'saida' && (
                        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                            <label className="block text-xs font-bold text-slate-300">
                                🏢 Destinação do Gasto (Quem deve pagar?):
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDestinacao('particular')}
                                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                                        destinacao === 'particular'
                                            ? 'bg-purple-600 text-white font-black shadow-md'
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                                    }`}
                                >
                                    👤 Particular (Meu)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDestinacao('loja_100')}
                                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                                        destinacao === 'loja_100'
                                            ? 'bg-blue-600 text-white font-black shadow-md'
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                                    }`}
                                >
                                    🏢 100% da Loja
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDestinacao('loja_50')}
                                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                                        destinacao === 'loja_50'
                                            ? 'bg-amber-600 text-white font-black shadow-md'
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                                    }`}
                                >
                                    🤝 Meio a Meio (50%)
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                {destinacao === 'particular' && 'Gasto pessoal. Não gera pendência nem acerto entre os sócios.'}
                                {destinacao === 'loja_100' && 'Adiantamento total da loja. Você fica a receber 100% de volta no Acerto de Sócios.'}
                                {destinacao === 'loja_50' && 'Despesa dividida meio a meio. Você fica a receber 50% de volta do seu sócio.'}
                            </p>
                        </div>
                    )}

                    {/* Escopo (PF/PJ), Status e Placa */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Escopo</label>
                            <select
                                value={escopo}
                                onChange={(e) => setEscopo(e.target.value as Escopo)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm outline-none font-bold"
                            >
                                <option value="PF" className="bg-slate-900">PF (Pessoal)</option>
                                <option value="PJ" className="bg-slate-900">PJ (Empresa)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as StatusLancamento)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm outline-none"
                            >
                                <option value="pago" className="bg-slate-900">Pago / Realizado</option>
                                <option value="previsto" className="bg-slate-900">Previsto (A pagar/receber)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Placa (opcional)</label>
                            <input
                                type="text"
                                value={placa}
                                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                                placeholder="ABC1D23"
                                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none"
                            />
                        </div>
                    </div>

                    {/* Checkbox para criar patrimônio automático se for compra de carro */}
                    {!lancamentoParaEditar && tipo === 'saida' && (
                        <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={criarPatrimonio}
                                onChange={(e) => setCriarPatrimonio(e.target.checked)}
                                className="rounded text-emerald-500 focus:ring-0"
                            />
                            <span>Cadastrar este item como <strong>Ativo no Patrimônio</strong> (não conta como perda)</span>
                        </label>
                    )}

                    {/* Ações */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                        {lancamentoParaEditar && onExcluir ? (
                            <button
                                type="button"
                                onClick={handleExcluir}
                                disabled={salvando}
                                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all text-xs font-bold flex items-center gap-1.5"
                            >
                                <Trash2 className="w-4 h-4" /> Excluir
                            </button>
                        ) : <div />}

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={salvando}
                                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-emerald-500/20"
                            >
                                {salvando ? 'Salvando...' : 'Salvar Lançamento'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
