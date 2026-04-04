'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Zap } from 'lucide-react';
import { useDailyQuiz } from '@/lib/hooks/useDailyQuiz';
import { DailyTrafficQuiz } from './DailyTrafficQuiz';

export function TrafficAlertBanner() {
    const { needsQuiz, isLoading, isSubmitting, submitQuiz } = useDailyQuiz();

    // Admin ou carregando: não exibe nada
    if (isLoading || !needsQuiz) return null;

    return (
        <AnimatePresence>
            {needsQuiz && (
                <motion.div
                    key="quiz-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6 overflow-hidden"
                    style={{ 
                        backdropFilter: 'blur(16px)', 
                        backgroundColor: 'rgba(0,0,0,0.92)' 
                    }}
                >
                    {/* Pulso de fundo vermelho épico */}
                    <motion.div
                        animate={{ opacity: [0.05, 0.12, 0.05], scale: [1, 1.01, 1] }}
                        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                        className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-black to-red-900/10 pointer-events-none"
                    />

                    <motion.div
                        initial={{ scale: 0.88, opacity: 0, y: 32 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: -16 }}
                        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                        className="relative w-full max-w-md bg-[#0c0c0f] border border-red-500/20 rounded-2xl overflow-hidden shadow-2xl"
                        style={{ boxShadow: '0 0 60px rgba(229,9,20,0.15), 0 20px 60px rgba(0,0,0,0.6)' }}
                    >
                            {/* Header do modal */}
                            <div className="px-6 py-4 border-b border-white/[0.06] bg-red-500/5 flex items-center gap-3">
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0.6, 1] }}
                                    transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                                >
                                    <AlertTriangle size={16} className="text-red-400" />
                                </motion.div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.35em] text-red-400">
                                        Quiz Diário de Qualidade — Obrigatório
                                    </p>
                                    <p className="text-[11px] text-white/40 font-medium mt-0.5">
                                        3 cliques · ~15 segundos · Avalie os leads de ontem
                                    </p>
                                </div>
                            </div>

                            {/* Corpo do Quiz */}
                            <div className="p-6">
                                <DailyTrafficQuiz
                                    isSubmitting={isSubmitting}
                                    onSubmit={submitQuiz}
                                />
                            </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
