'use client';

import React, { useState } from 'react';
import { X, Handshake, CheckCircle2, ArrowRight, Car, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { brl, dataBR } from '@/lib/financeiro/format';

interface ItemAcerto {
    id: string;
    data: string;
    descricao: string;
    valor: number;
    destinacao: string;
    reembolso_valor: number;
    reembolso_de: string;
    reembolso_para: string;
    owner_email: string;
    placa?: string | null;
}

interface AcertoData {
    totalAlexandreDeveAoLedra: number;
    totalLedraDeveAoAlexandre: number;
    saldoLiquidoAcerto: number;
    itensPendentes: ItemAcerto[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    acerto: AcertoData;
    onLiquidar: (ids: string[]) => Promise<boolean>;
}

export function ModalAcertoSocios({
    isOpen,
    onClose,
    acerto,
    onLiquidar,
}: Props) {
    const [liquidando, setLiquidando] = useState(false);

    if (!isOpen) return null;

    const saldo = acerto.saldoLiquidoAcerto || 0;
    const alexandreDeve = saldo > 0;
    const ledraDeve = saldo < 0;
    const zerado = saldo === 0;

    const handleLiquidarItem = async (id: string) => {
        if (!confirm('Confirmar que o pagamento deste item foi realizado (PIX feito)?')) return;
        setLiquidando(true);
        try {
            await onLiquidar([id]);
        } finally {
            setLiquidando(false);
        }
    };

    const handleLiquidarTudo = async () => {
        if (!confirm('Confirmar que todos os valores pendentes foram acertados e quitados?')) return;
        setLiquidando(true);
        try {
            const allIds = (acerto.itensPendentes || []).map(i => i.id);
            if (allIds.length > 0) {
                await onLiquidar(allIds);
            }
        } finally {
            setLiquidando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-white max-h-[90vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                            <Handshake className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white">Acerto de Contas entre Sócios</h2>
                            <p className="text-xs text-slate-400">Controle de despesas da loja pagas do bolso particular</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Termômetro do Saldo Líquido Atual */}
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    zerado
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}>
                    <div>
                        <span className="text-[10px] uppercase font-black tracking-wider block opacity-75">
                            Saldo Líquido do Acerto Hoje:
                        </span>
                        <div className="text-xl md:text-2xl font-black font-mono">
                            {zerado && '✅ Acerto 100% Zerado (Ninguém deve nada)'}
                            {alexandreDeve && `⚠️ Alexandre deve pagar ao Ledra: ${brl(saldo)}`}
                            {ledraDeve && `⚠️ Ledra deve pagar ao Alexandre: ${brl(Math.abs(saldo))}`}
                        </div>
                        <div className="text-[11px] opacity-80 mt-1 flex items-center gap-3">
                            <span>Ledra adiantou: <strong>{brl(acerto.totalAlexandreDeveAoLedra)}</strong></span>
                            <span>•</span>
                            <span>Alexandre adiantou: <strong>{brl(acerto.totalLedraDeveAoAlexandre)}</strong></span>
                        </div>
                    </div>

                    {!zerado && (acerto.itensPendentes || []).length > 0 && (
                        <button
                            type="button"
                            onClick={handleLiquidarTudo}
                            disabled={liquidando}
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-md shrink-0 flex items-center gap-1.5"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Quitar Tudo (Zerar)</span>
                        </button>
                    )}
                </div>

                {/* Lista de Adiantamentos Pendentes */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    <span className="text-xs font-bold text-slate-400 block px-1">
                        Lançamentos Pendentes de Reembolso ({acerto.itensPendentes?.length || 0}):
                    </span>

                    {(acerto.itensPendentes || []).length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/60 rounded-2xl border border-slate-800">
                            Nenhum adiantamento pendente. Quando o Ledra ou Alexandre pagarem uma conta da loja do bolso, ela aparecerá aqui automaticamente.
                        </div>
                    ) : (
                        acerto.itensPendentes.map((item) => {
                            const quemAdiantou = item.owner_email.includes('ledra') ? 'Felipe Ledra' : 'Alexandre';
                            const quemDeve = item.reembolso_de?.includes('ledra') ? 'Felipe Ledra' : 'Alexandre';

                            return (
                                <div
                                    key={item.id}
                                    className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-white">{item.descricao}</span>
                                            {item.placa && (
                                                <span className="px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[9px] font-bold flex items-center gap-1">
                                                    <Car className="w-2.5 h-2.5" /> {item.placa}
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                item.destinacao === 'loja_100'
                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                            }`}>
                                                {item.destinacao === 'loja_100' ? '100% Loja' : '50% Meio a Meio'}
                                            </span>
                                        </div>

                                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                            <span>📅 {dataBR(item.data)}</span>
                                            <span>•</span>
                                            <span>Adiantado por: <strong className="text-slate-300">{quemAdiantou}</strong> (Total pago: {brl(item.valor)})</span>
                                        </div>
                                    </div>

                                    {/* Valor a Pagar e Botão */}
                                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                                        <div className="text-right">
                                            <span className="text-[10px] text-slate-400 block font-semibold">
                                                {quemDeve} deve pagar:
                                            </span>
                                            <span className="text-sm font-black font-mono text-emerald-400">
                                                {brl(item.reembolso_valor)}
                                            </span>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleLiquidarItem(item.id)}
                                            disabled={liquidando}
                                            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1 shrink-0"
                                            title="Confirmar que o PIX de reembolso foi feito"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Confirmar PIX</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Rodapé explicativo */}
                <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">
                    💡 Quando você marca <strong>Confirmar PIX</strong>, o sistema dá baixa no valor a pagar/receber e zera essa pendência do acerto entre vocês.
                </div>
            </div>
        </div>
    );
}
