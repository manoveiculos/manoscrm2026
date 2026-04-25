'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FileText, 
    Sparkles, 
    ChevronRight, 
    Copy, 
    Check, 
    Zap, 
    TrendingUp, 
    Smartphone,
    Download,
    RefreshCw,
    X
} from 'lucide-react';

interface ProposalTabProps {
    leadId: string;
    leadName?: string;
    onClose?: () => void;
}

export default function ProposalTab({ leadId, leadName, onClose }: ProposalTabProps) {
    const [loading, setLoading] = useState(false);
    const [proposal, setProposal] = useState<any>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const generateProposal = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/lead/generate-proposal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setProposal(data);
        } catch (err) {
            console.error('Erro ao gerar proposta:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[500px] gap-6 bg-black/40 backdrop-blur-xl">
                <div className="relative">
                    <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="text-blue-500"
                    >
                        <RefreshCw size={48} />
                    </motion.div>
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ repeat: Infinity, duration: 1.5, repeatType: "reverse" }}
                        className="absolute inset-0 flex items-center justify-center text-blue-400"
                    >
                        <Sparkles size={20} />
                    </motion.div>
                </div>
                <div className="text-center space-y-2">
                    <p className="text-xl font-bold text-white">Refinando Estratégia...</p>
                    <p className="text-white/40 text-sm max-w-[240px]">
                        Calculando parcelas e criando argumentos fatais para {leadName}.
                    </p>
                </div>
            </div>
        );
    }

    if (!proposal) {
        return (
            <div className="flex flex-col items-center justify-center h-[500px] p-10 text-center bg-gradient-to-b from-blue-600/5 to-transparent">
                <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-[2.5rem] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Sparkles size={48} className="text-blue-400" />
                    </div>
                    <motion.div 
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/40 border-2 border-black"
                    >
                        <Zap size={20} fill="white" className="text-white" />
                    </motion.div>
                </div>
                
                <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Assistente de Proposta IA</h3>
                <p className="text-white/50 max-w-xs mb-10 text-sm leading-relaxed">
                    Não apenas informe números. Envie uma proposta com gatilhos psicológicos desenhados para o perfil deste cliente.
                </p>
                
                <button 
                    onClick={generateProposal}
                    className="group relative flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl font-black transition-all shadow-[0_20px_40px_rgba(37,99,235,0.3)] active:scale-95 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <Zap size={20} fill="currentColor" />
                    GERAR PROPOSTA MATADORA
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-black/40 backdrop-blur-3xl">
            {/* Custom Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div>
                    <h3 className="text-xl font-black text-white tracking-tight leading-none mb-2">{proposal.titulo}</h3>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20">
                            <TrendingUp size={10} className="text-green-400" />
                            <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">{proposal.veiculo_preco}</span>
                        </div>
                        <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Taxa 2% a.m.</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={generateProposal}
                        className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                        title="Recalcular"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-32">
                {/* Pitch Inicial */}
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                    <div className="relative bg-black/60 border border-white/10 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                <Sparkles size={12} className="text-blue-400" />
                            </div>
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">SCRIPT DE ABERTURA</span>
                        </div>
                        <p className="text-white/90 font-semibold leading-relaxed italic text-lg">
                            "{proposal.pitch}"
                        </p>
                    </div>
                </div>

                {/* Grid de Cenários */}
                <div className="grid grid-cols-1 gap-5">
                    {proposal.cenarios.map((cenario: any, idx: number) => (
                        <motion.div 
                            key={idx}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className="group relative bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 rounded-[2.5rem] p-8 transition-all overflow-hidden"
                        >
                            {/* Decorative element */}
                            <div className="absolute -right-4 -top-4 w-32 h-32 bg-blue-600/5 blur-[40px] group-hover:bg-blue-600/10 transition-all rounded-full" />

                            <div className="flex items-start justify-between relative z-10 mb-8">
                                <div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest mb-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                        {cenario.label}
                                    </div>
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-5xl font-black text-white tracking-tighter">{cenario.parcela}</span>
                                        <span className="text-white/20 font-black text-xl uppercase italic">/mês</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em] mb-1">Entrada Total</p>
                                    <p className="text-2xl font-black text-white/90">{cenario.entrada}</p>
                                    <p className="text-[10px] text-white/20 font-medium">Prazo {cenario.prazo}</p>
                                </div>
                            </div>

                            {/* Obs IA */}
                            <div className="flex items-center gap-3 mb-8 px-5 py-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-200/90 text-sm font-bold italic leading-tight">
                                <div className="p-1.5 rounded-lg bg-amber-500/20">
                                    <Zap size={14} fill="currentColor" className="text-amber-400" />
                                </div>
                                {cenario.obs}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 relative z-10">
                                <button 
                                    onClick={() => handleCopy(cenario.mensagem_whatsapp, idx)}
                                    className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-black transition-all active:scale-95 ${
                                        copiedIndex === idx 
                                        ? 'bg-green-600 text-white shadow-lg shadow-green-600/20' 
                                        : 'bg-white text-black hover:bg-white/90'
                                    }`}
                                >
                                    {copiedIndex === idx ? <Check size={20} strokeWidth={3} /> : <Smartphone size={20} strokeWidth={3} />}
                                    {copiedIndex === idx ? 'COPIADO!' : 'COPIAR WHATSAPP'}
                                </button>
                                <button className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/10">
                                    <Download size={24} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* CTA Final */}
                <div className="text-center px-10 pb-12 pt-4">
                    <div className="w-12 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent mx-auto mb-6" />
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mb-3">FECHAMENTO RECOMENDADO</p>
                    <p className="text-white/50 font-bold text-lg italic leading-relaxed">
                        "{proposal.cta}"
                    </p>
                </div>
            </div>
        </div>
    );
}
