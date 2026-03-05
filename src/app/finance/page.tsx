'use client';

import { motion } from 'framer-motion';
import { CreditCard, Construction, Sparkles, Clock } from 'lucide-react';

export default function FinancePage() {
    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="max-w-2xl w-full"
            >
                {/* Icon Circle */}
                <div className="relative mb-10 inline-block">
                    <div className="absolute inset-0 bg-red-600/20 blur-3xl rounded-full" />
                    <div className="relative h-24 w-24 md:h-32 md:w-32 rounded-[2.5rem] bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white shadow-2xl border border-white/10 group">
                        <CreditCard size={48} className="md:h-16 md:w-16 animate-pulse" />
                    </div>
                    {/* Floating mini icons */}
                    <motion.div
                        animate={{ y: [0, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                        className="absolute -top-4 -right-4 p-3 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 text-red-500 shadow-xl"
                    >
                        <Construction size={20} />
                    </motion.div>
                    <motion.div
                        animate={{ y: [0, 10, 0] }}
                        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 1 }}
                        className="absolute -bottom-4 -left-4 p-3 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 text-amber-500 shadow-xl"
                    >
                        <Clock size={20} />
                    </motion.div>
                </div>

                {/* Text Content */}
                <div className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <Sparkles size={16} className="text-red-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Lançamento Próximo</span>
                            <Sparkles size={16} className="text-red-500" />
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-none uppercase">
                            Análise de <span className="text-red-600 italic">Crédito</span>
                        </h1>
                    </div>

                    <div className="glass-card p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 space-y-4">
                        <p className="text-lg md:text-xl font-bold text-white/80 leading-relaxed italic">
                            "Estamos construindo a ferramenta de crédito mais rápida e inteligente do mercado para a Manos Veículos."
                        </p>
                        <div className="h-1 w-24 bg-red-600 mx-auto rounded-full" />
                        <p className="text-xs md:text-sm text-white/40 font-medium uppercase tracking-[0.2em]">
                            Em breve: Aprovações automáticas, integração com bancos e score de pré-aprovado.
                        </p>
                    </div>

                    <div className="pt-10 flex flex-col md:flex-row items-center justify-center gap-4">
                        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
                            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Em Desenvolvimento</span>
                        </div>
                        <div className="text-[11px] font-bold text-white/20 italic">
                            Disponibilidade Prevista: Março 2026
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
