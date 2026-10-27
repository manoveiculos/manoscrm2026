'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Plus, ArrowRight, CornerDownLeft, Car, Tag, Calendar, Building, User } from 'lucide-react';
import { FinCategoria, FinConta } from '@/lib/financeiro/types';
import { parseLinhaRapida, ParsedLancamento } from '@/lib/financeiro/quickParser';
import { brl, dataBR } from '@/lib/financeiro/format';

interface Props {
    categorias: FinCategoria[];
    contas: FinConta[];
    onSalvar: (dados: any) => Promise<boolean>;
    onAbrirModalCompleto: () => void;
    onAbrirTransferencia: () => void;
}

export function BarraLancamentoRapido({
    categorias,
    contas,
    onSalvar,
    onAbrirModalCompleto,
    onAbrirTransferencia,
}: Props) {
    const [texto, setTexto] = useState('');
    const [parsed, setParsed] = useState<ParsedLancamento | null>(null);
    const [contaSelecionada, setContaSelecionada] = useState<string>('');
    const [enviando, setEnviando] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Seleciona primeira conta por padrão
    useEffect(() => {
        if (contas.length > 0 && !contaSelecionada) {
            setContaSelecionada(contas[0].id);
        }
    }, [contas, contaSelecionada]);

    // Parse em tempo real
    useEffect(() => {
        if (!texto.trim()) {
            setParsed(null);
            return;
        }
        const res = parseLinhaRapida(texto, categorias);
        setParsed(res);
    }, [texto, categorias]);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!parsed || enviando) return;

        setEnviando(true);
        try {
            const ok = await onSalvar({
                tipo: parsed.tipo,
                valor: parsed.valor,
                data: parsed.data,
                descricao: parsed.descricao,
                conta_id: contaSelecionada || null,
                categoria_id: parsed.categoriaSugeridaId || null,
                escopo: parsed.escopo,
                placa: parsed.placa || null,
                status: parsed.status,
                texto_original: texto,
            });

            if (ok) {
                setTexto('');
                setParsed(null);
            }
        } finally {
            setEnviando(false);
        }
    };

    const aplicarAtalho = (prefixo: string) => {
        setTexto(prefixo);
        inputRef.current?.focus();
    };

    return (
        <div className="bg-gradient-to-b from-slate-900 to-slate-900/90 border border-emerald-500/20 rounded-2xl p-4 md:p-5 shadow-2xl relative overflow-hidden">
            {/* Brilho sutil */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-black text-white tracking-wide">
                        Lançamento Rápido Inteligente
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                        (digite em 1 linha e aperte Enter)
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Seletor de Conta */}
                    <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
                        <span className="text-slate-400 font-medium">Conta:</span>
                        <select
                            value={contaSelecionada}
                            onChange={(e) => setContaSelecionada(e.target.value)}
                            className="bg-transparent text-white font-semibold outline-none cursor-pointer"
                        >
                            {contas.map((c) => (
                                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                                    {c.nome} {c.saldo !== undefined ? `(${brl(c.saldo)})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={onAbrirTransferencia}
                        className="px-3 py-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        ⇆ Transferir
                    </button>

                    <button
                        type="button"
                        onClick={onAbrirModalCompleto}
                        className="px-3 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        <Plus className="w-3.5 h-3.5" /> Completo
                    </button>
                </div>
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSubmit} className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Ex: -380 chaveiro ford ka  ou  +1500 pix comissao  ou  -12000 aluguel loja pj"
                    disabled={enviando}
                    className="w-full bg-slate-950/90 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3.5 pr-28 text-white placeholder-slate-500 text-sm md:text-base outline-none transition-all shadow-inner font-medium"
                />

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                        type="submit"
                        disabled={!parsed || enviando}
                        className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                    >
                        {enviando ? 'Gravando...' : (
                            <>
                                <span>Lançar</span>
                                <CornerDownLeft className="w-3.5 h-3.5" />
                            </>
                        )}
                    </button>
                </div>
            </form>

            {/* Live Preview de interpretação */}
            {parsed && (
                <div className="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center gap-2 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="text-slate-400 font-bold">Interpretação:</span>

                    {/* Tipo & Valor */}
                    <span
                        className={`px-2 py-0.5 rounded-md font-black ${
                            parsed.tipo === 'entrada'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : parsed.tipo === 'saida'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        }`}
                    >
                        {parsed.tipo === 'entrada' ? '+ ' : parsed.tipo === 'saida' ? '- ' : '> '}
                        {brl(parsed.valor)}
                    </span>

                    {/* Descrição */}
                    <span className="font-semibold text-white bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                        {parsed.descricao}
                    </span>

                    {/* Categoria */}
                    {parsed.categoriaSugeridaNome && (
                        <span className="flex items-center gap-1 text-slate-300 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                            <Tag className="w-3 h-3 text-emerald-400" />
                            {parsed.categoriaSugeridaNome}
                        </span>
                    )}

                    {/* Placa */}
                    {parsed.placa && (
                        <span className="flex items-center gap-1 font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
                            <Car className="w-3 h-3" />
                            {parsed.placa}
                        </span>
                    )}

                    {/* Escopo */}
                    <span className="flex items-center gap-1 text-slate-300 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                        {parsed.escopo === 'PJ' ? <Building className="w-3 h-3 text-blue-400" /> : <User className="w-3 h-3 text-purple-400" />}
                        {parsed.escopo}
                    </span>

                    {/* Data */}
                    <span className="flex items-center gap-1 text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                        <Calendar className="w-3 h-3" />
                        {dataBR(parsed.data)}
                    </span>

                    {/* Status */}
                    {parsed.status === 'previsto' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                            Previsto
                        </span>
                    )}
                </div>
            )}

            {/* Atalhos com 1 clique */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Atalhos:</span>
                <button
                    type="button"
                    onClick={() => aplicarAtalho('-70 gasolina ')}
                    className="px-2 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-all"
                >
                    ⛽ Gasolina
                </button>
                <button
                    type="button"
                    onClick={() => aplicarAtalho('-30 lavacao ')}
                    className="px-2 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-all"
                >
                    🧼 Lavação
                </button>
                <button
                    type="button"
                    onClick={() => aplicarAtalho('-500 comissao ')}
                    className="px-2 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-all"
                >
                    🤝 Comissão
                </button>
                <button
                    type="button"
                    onClick={() => aplicarAtalho('-12000 aluguel loja pj ')}
                    className="px-2 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-all"
                >
                    🏢 Aluguel Loja
                </button>
                <button
                    type="button"
                    onClick={() => aplicarAtalho('+1500 cobranca ')}
                    className="px-2 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-emerald-400 transition-all"
                >
                    + Cobrança
                </button>
                <button
                    type="button"
                    onClick={() => aplicarAtalho('+10000 pix venda ')}
                    className="px-2 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-emerald-400 transition-all"
                >
                    + Venda Carro
                </button>
            </div>
        </div>
    );
}
