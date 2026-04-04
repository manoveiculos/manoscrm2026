'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    CheckCircle, 
    Send, 
    Flame, 
    Thermometer, 
    Snowflake,
    MessageCircle,
    Facebook,
    Search,
    Check
} from 'lucide-react';

interface QuizPayload {
    temperatura_vendas: 'quente' | 'esquentando' | 'medio' | 'frio';
    origem_macro: 'WhatsApp' | 'Facebook' | 'Google' | 'OK';
    comentario_extra?: string;
}

interface DailyTrafficQuizProps {
    isSubmitting: boolean;
    onSubmit: (payload: QuizPayload) => Promise<boolean>;
}

type TemperaturaVendas = 'quente' | 'esquentando' | 'medio' | 'frio';
type OrigemMacro = 'WhatsApp' | 'Facebook' | 'Google' | 'OK';

const SLIDE_VARIANTS = {
    enter: { x: 40, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -40, opacity: 0 },
};

const TEMPERATURA_OPTIONS: { value: TemperaturaVendas; label: string; emoji: string; color: string; bg: string; border: string }[] = [
    {
        value: 'quente',
        label: 'Quentes',
        emoji: '🔥',
        color: '#ef4444',
        bg: 'bg-red-500/10 hover:bg-red-500/20',
        border: 'border-red-500/20 hover:border-red-500/50',
    },
    {
        value: 'esquentando',
        label: 'Esquentando',
        emoji: '☀️',
        color: '#f97316',
        bg: 'bg-orange-500/10 hover:bg-orange-500/20',
        border: 'border-orange-500/20 hover:border-orange-500/50',
    },
    {
        value: 'medio',
        label: 'Médios',
        emoji: '😐',
        color: '#f59e0b',
        bg: 'bg-amber-500/10 hover:bg-amber-500/20',
        border: 'border-amber-500/20 hover:border-amber-500/50',
    },
    {
        value: 'frio',
        label: 'Frios / Lixo',
        emoji: '🧊',
        color: '#3b82f6',
        bg: 'bg-blue-500/10 hover:bg-blue-500/20',
        border: 'border-blue-500/20 hover:border-blue-500/50',
    },
];

const ORIGEM_OPTIONS: { value: OrigemMacro; label: string; icon: any; color: string; bg: string }[] = [
    {
        value: 'WhatsApp',
        label: 'WhatsApp',
        icon: MessageCircle,
        color: '#22c55e',
        bg: 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40',
    },
    {
        value: 'Facebook',
        label: 'Facebook',
        icon: Facebook,
        color: '#3b82f6',
        bg: 'bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40',
    },
    {
        value: 'Google',
        label: 'Google Ads',
        icon: Search,
        color: '#f97316',
        bg: 'bg-orange-500/10 border-orange-500/20 hover:border-orange-500/40',
    },
    {
        value: 'OK',
        label: 'Tudo Ok / Não sei',
        icon: Check,
        color: '#a855f7',
        bg: 'bg-purple-500/10 border-purple-500/20 hover:border-purple-500/40',
    },
];

export function DailyTrafficQuiz({ isSubmitting, onSubmit }: DailyTrafficQuizProps) {
    const [step, setStep] = useState(1);
    const [temperatura, setTemperatura] = useState<TemperaturaVendas | null>(null);
    const [origemMacro, setOrigemMacro] = useState<OrigemMacro | null>(null);
    const [comentario, setComentario] = useState('');
    const [submitSuccess, setSubmitSuccess] = useState(false);

    const handleTemperatura = (value: TemperaturaVendas) => {
        setTemperatura(value);
        setTimeout(() => setStep(2), 300);
    };

    const handleOrigem = (value: OrigemMacro) => {
        setOrigemMacro(value);
        setTimeout(() => setStep(3), 300);
    };

    const handleSubmit = async () => {
        if (!temperatura || !origemMacro) return;

        const success = await onSubmit({
            temperatura_vendas: temperatura,
            origem_macro: origemMacro,
            comentario_extra: comentario,
        });

        if (success) {
            setSubmitSuccess(true);
            // O unblock visual é instantâneo via Success screen
        }
    };

    const canSubmit = temperatura !== null && origemMacro !== null && !isSubmitting;

    if (submitSuccess) {
        return (
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center gap-6 py-10 text-center"
            >
                <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
                    className="w-24 h-24 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                >
                    <CheckCircle size={48} className="text-emerald-400" />
                </motion.div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-black text-white tracking-tight">Sistema Liberado!</h3>
                    <p className="text-sm text-white/40 font-medium max-w-[240px] leading-relaxed">
                        Feedback enviado com sucesso. Bom trabalho e ótimas vendas hoje! 🚀
                    </p>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="space-y-7">
            {/* Barra de Progresso Minimalista */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/25">
                        Passo {step} de 3
                    </span>
                    <div className="flex gap-1.5">
                        {[1, 2, 3].map((s) => (
                            <div 
                                key={s} 
                                className={`h-1 rounded-full transition-all duration-500 ${
                                    s === step ? 'w-6 bg-red-500' : s < step ? 'w-3 bg-red-900/40' : 'w-3 bg-white/10'
                                }`} 
                            />
                        ))}
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {/* ETAPA 1: Temperatura */}
                {step === 1 && (
                    <motion.div
                        key="step1"
                        variants={SLIDE_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="space-y-5"
                    >
                        <div className="space-y-1.5">
                            <h3 className="text-xl font-black text-white leading-tight">
                                Qual a temperatura geral dos leads de ontem?
                            </h3>
                            <p className="text-xs text-white/40 font-medium">
                                Avalie o perfil de compra dos contatos recebidos ontem.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {TEMPERATURA_OPTIONS.map((opt) => (
                                <motion.button
                                    key={opt.value}
                                    whileHover={{ x: 6, backgroundColor: 'rgba(255,255,255,0.05)' }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleTemperatura(opt.value)}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 text-left group ${opt.bg} ${opt.border}`}
                                >
                                    <span className="text-3xl select-none group-hover:scale-110 transition-transform">{opt.emoji}</span>
                                    <div className="flex-1">
                                        <span className="block text-[13px] font-black text-white uppercase tracking-wider">
                                            {opt.label}
                                        </span>
                                        <span className="text-[10px] text-white/30 font-medium">
                                            {opt.value === 'quente' ? 'Prontos para comprar' : opt.value === 'esquentando' ? 'Interesse real em fechar' : opt.value === 'medio' ? 'Apenas curiosos/pesquisando' : 'Fora do perfil / DDD errado'}
                                        </span>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* ETAPA 2: Origem Macro */}
                {step === 2 && (
                    <motion.div
                        key="step2"
                        variants={SLIDE_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="space-y-5"
                    >
                        <div className="space-y-1.5">
                            <h3 className="text-xl font-black text-white leading-tight">
                                Qual origem trouxe o público mais desqualificado ontem?
                            </h3>
                            <p className="text-xs text-white/40 font-medium">
                                Identifique a fonte com leads mais "frios" no dia anterior.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {ORIGEM_OPTIONS.map((opt) => {
                                const Icon = opt.icon;
                                return (
                                    <motion.button
                                        key={opt.value}
                                        whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.05)' }}
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => handleOrigem(opt.value)}
                                        className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border transition-all duration-200 text-center ${opt.bg}`}
                                    >
                                        <div className="p-2 rounded-xl bg-black/20 border border-white/5">
                                            <Icon size={20} style={{ color: opt.color }} />
                                        </div>
                                        <span className="text-[11px] font-black text-white/80 uppercase tracking-widest leading-tight">
                                            {opt.label}
                                        </span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

                {/* ETAPA 3: Comentário Opcional */}
                {step === 3 && (
                    <motion.div
                        key="step3"
                        variants={SLIDE_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="space-y-6"
                    >
                        <div className="space-y-1.5">
                            <h3 className="text-xl font-black text-white leading-tight">
                                Algo específico que queira relatar?
                            </h3>
                            <p className="text-xs text-white/40 font-medium">
                                Feedback extra sobre as campanhas ou leads.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <textarea
                                value={comentario}
                                onChange={(e) => setComentario(e.target.value)}
                                placeholder="Opcional: Ex: Muitos leads de Curitiba/PR querendo carro popular..."
                                rows={4}
                                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4 text-sm text-white placeholder:text-white/20 resize-none outline-none focus:border-red-500/40 transition-all font-medium leading-relaxed"
                            />
                        </div>

                        <div className="pt-2">
                            <motion.button
                                whileHover={canSubmit ? { scale: 1.02, y: -2 } : {}}
                                whileTap={canSubmit ? { scale: 0.98 } : {}}
                                onClick={handleSubmit}
                                disabled={!canSubmit || isSubmitting}
                                className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 text-white font-black uppercase tracking-[0.2em] text-[13px] flex items-center justify-center gap-3 transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-[0_10px_30px_rgba(239,68,68,0.2)] hover:shadow-[0_15px_40px_rgba(239,68,68,0.3)]"
                            >
                                {isSubmitting ? (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                                        className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full"
                                    />
                                ) : (
                                    <>
                                        <Send size={16} />
                                        Finalizar e Liberar Sistema
                                    </>
                                )}
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
