'use client';

import React, { useState, useEffect } from 'react';
import { X, Calculator, CheckCircle2, Copy, FileText, ArrowRight, Sparkles, Percent, DollarSign } from 'lucide-react';
import { calcularApuracaoTributariaNF, ResultadoApuracaoTributaria } from '@/lib/services/tributosService';

interface AssistenteTributarioModalProps {
    valorInicialSaida?: number;
    valorInicialEntrada?: number;
    onClose: () => void;
    onAplicarImposto: (valorImpostoTotal: number) => void;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export function AssistenteTributarioModal({
    valorInicialSaida = 0,
    valorInicialEntrada = 0,
    onClose,
    onAplicarImposto
}: AssistenteTributarioModalProps) {
    const [saidaInput, setSaidaInput] = useState<string>(valorInicialSaida > 0 ? String(valorInicialSaida) : '');
    const [entradaInput, setEntradaInput] = useState<string>(valorInicialEntrada > 0 ? String(valorInicialEntrada) : '');
    const [copiado, setCopiado] = useState(false);

    const valorSaida = Number(saidaInput) || 0;
    const valorEntrada = Number(entradaInput) || 0;

    const [resultado, setResultado] = useState<ResultadoApuracaoTributaria>(() =>
        calcularApuracaoTributariaNF(valorSaida, valorEntrada)
    );

    useEffect(() => {
        setResultado(calcularApuracaoTributariaNF(valorSaida, valorEntrada));
    }, [valorSaida, valorEntrada]);

    const jsonEstrutura = {
        valor_nfe_saida: resultado.valor_nfe_saida,
        valor_nfe_entrada: resultado.valor_nfe_entrada,
        margem_bruta: resultado.margem_bruta,
        memoria_calculo: {
            icms: resultado.memoria_calculo.icms,
            pis_cofins: resultado.memoria_calculo.pis_cofins,
            irpj_csll: resultado.memoria_calculo.irpj_csll
        },
        imposto_provisionamento_nf: resultado.imposto_provisionamento_nf
    };

    const copiarJson = () => {
        navigator.clipboard.writeText(JSON.stringify(jsonEstrutura, null, 2));
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden relative my-6 text-slate-100">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Sparkles className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                Assistente Especialista de Apuração Tributária NF
                            </h2>
                            <p className="text-xs text-slate-400">
                                Fecho Financeiro & Cálculo de Imposto / Provisionamento NF (Manos Veículos)
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
                    {/* Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 border border-slate-800 rounded-xl">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-emerald-400" /> 1. Valor NFe de Saída (Venda Bruta R$)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={saidaInput}
                                onChange={(e) => setSaidaInput(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-base focus:border-emerald-500 focus:outline-none"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Montante bruto faturado ao cliente na nota fiscal.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-blue-400" /> 2. Valor NFe de Entrada (Custo Aquisição R$)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={entradaInput}
                                onChange={(e) => setEntradaInput(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-base focus:border-blue-500 focus:outline-none"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Custo de entrada do veículo na nota fiscal da loja.</p>
                        </div>
                    </div>

                    {/* Resumo da Margem Bruta */}
                    <div className="flex flex-wrap items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                        <span className="text-slate-400 font-medium">Margem Bruta (Diferença entre Saída e Entrada):</span>
                        <span className={`font-mono text-base font-bold ${resultado.margem_bruta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {brl(resultado.margem_bruta)}
                        </span>
                    </div>

                    {/* Cartões dos Tributos */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* ICMS */}
                        <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold text-cyan-400">
                                <span>1. ICMS</span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">5% BC · 12%</span>
                            </div>
                            <div className="text-xl font-bold font-mono text-white">
                                {brl(resultado.memoria_calculo.icms)}
                            </div>
                            <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-800 pt-2">
                                <div>Redução 95% na BC:</div>
                                <div className="font-mono text-slate-300">Base = {brl(resultado.memoria_calculo.detalhes?.base_icms || 0)}</div>
                                <div className="font-mono text-slate-500">Imposto = Base × 12%</div>
                            </div>
                        </div>

                        {/* PIS / COFINS */}
                        <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold text-indigo-400">
                                <span>2. PIS / COFINS</span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">3,65% Cumulativo</span>
                            </div>
                            <div className="text-xl font-bold font-mono text-white">
                                {brl(resultado.memoria_calculo.pis_cofins)}
                            </div>
                            <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-800 pt-2">
                                <div>Base deduzida do ICMS:</div>
                                <div className="font-mono text-slate-300">Base = {brl(resultado.memoria_calculo.detalhes?.base_pis_cofins || 0)}</div>
                                <div className="font-mono text-slate-500">Imposto = Base × 3.65%</div>
                            </div>
                        </div>

                        {/* IRPJ / CSLL */}
                        <div className="bg-slate-950/80 border border-purple-500/30 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold text-purple-400">
                                <span>3. IRPJ / CSLL</span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">32% Pres. · 24%</span>
                            </div>
                            <div className="text-xl font-bold font-mono text-white">
                                {brl(resultado.memoria_calculo.irpj_csll)}
                            </div>
                            <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-800 pt-2">
                                <div>15% IRPJ + 9% CSLL:</div>
                                <div className="font-mono text-slate-300">Base = {brl(resultado.memoria_calculo.detalhes?.base_irpj_csll || 0)}</div>
                                <div className="font-mono text-slate-500">Imposto = Margem × 7.68%</div>
                            </div>
                        </div>
                    </div>

                    {/* Total Imposto / Provisionamento NF */}
                    <div className="p-5 bg-gradient-to-r from-purple-950/50 via-slate-900 to-indigo-950/50 border border-purple-500/40 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
                        <div>
                            <span className="text-xs uppercase tracking-wider text-purple-300 font-bold block">
                                Imposto / Provisionamento NF Total (R$)
                            </span>
                            <span className="text-2xl md:text-3xl font-extrabold font-mono text-white">
                                {brl(resultado.imposto_provisionamento_nf)}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                onAplicarImposto(resultado.imposto_provisionamento_nf);
                                onClose();
                            }}
                            className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Aplicar {brl(resultado.imposto_provisionamento_nf)} no Fechamento</span>
                        </button>
                    </div>

                    {/* Preview do JSON para API / Webhook */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="flex items-center gap-1 font-semibold text-slate-300">
                                <FileText className="w-4 h-4 text-purple-400" /> Estrutura JSON Padronizada (API / Webhook CRM)
                            </span>
                            <button
                                type="button"
                                onClick={copiarJson}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                {copiado ? 'Copiado!' : 'Copiar JSON'}
                            </button>
                        </div>
                        <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto max-h-40">
                            {JSON.stringify(jsonEstrutura, null, 2)}
                        </pre>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
