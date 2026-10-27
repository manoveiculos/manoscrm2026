'use client';

import React, { useState } from 'react';
import { X, Copy, Check, MessageSquare, Send, Sparkles } from 'lucide-react';
import { Preset } from '@/lib/financeiro/format';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    textoWhatsApp: string;
    presetAtual: Preset;
    onMudarPreset: (p: Preset) => void;
    carregando?: boolean;
}

export function ModalResumoWhatsApp({
    isOpen,
    onClose,
    textoWhatsApp,
    presetAtual,
    onMudarPreset,
    carregando,
}: Props) {
    const [copiado, setCopiado] = useState(false);

    if (!isOpen) return null;

    const handleCopiar = async () => {
        try {
            await navigator.clipboard.writeText(textoWhatsApp);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        } catch (err) {
            console.error('Falha ao copiar:', err);
        }
    };

    const handleAbrirWhatsApp = () => {
        const url = `https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-white max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <MessageSquare className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">Resumo para WhatsApp</h2>
                            <p className="text-xs text-slate-400">Pronto para envio aos sócios ou controle pessoal</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Seletor de Período */}
                <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-800">
                    <button
                        type="button"
                        onClick={() => onMudarPreset('hoje')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                            presetAtual === 'hoje'
                                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        📅 Hoje
                    </button>
                    <button
                        type="button"
                        onClick={() => onMudarPreset('semana')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                            presetAtual === 'semana'
                                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        📊 Esta Semana
                    </button>
                    <button
                        type="button"
                        onClick={() => onMudarPreset('mes')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                            presetAtual === 'mes'
                                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        🗓️ Este Mês
                    </button>
                </div>

                {/* Prévia da Mensagem (estilo WhatsApp) */}
                <div className="flex-1 overflow-y-auto bg-slate-950 border border-slate-800/80 rounded-2xl p-4 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner">
                    {carregando ? (
                        <div className="flex items-center justify-center py-12 text-slate-500">
                            Carregando dados do período...
                        </div>
                    ) : (
                        textoWhatsApp || 'Nenhum lançamento no período selecionado.'
                    )}
                </div>

                {/* Ações */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleCopiar}
                        className={`w-full sm:flex-1 py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
                            copiado
                                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                        }`}
                    >
                        {copiado ? (
                            <>
                                <Check className="w-4 h-4" />
                                <span>Copiado com Sucesso!</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4" />
                                <span>Copiar Mensagem</span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={handleAbrirWhatsApp}
                        className="w-full sm:flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                    >
                        <Send className="w-4 h-4" />
                        <span>Abrir no WhatsApp</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
