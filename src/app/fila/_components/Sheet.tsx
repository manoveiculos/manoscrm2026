'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/** Painel que sobe de baixo (celular) / janela central (desktop). */
export function Sheet({ aberto, titulo, subtitulo, onFechar, children }: {
    aberto: boolean;
    titulo: string;
    subtitulo?: string | null;
    onFechar: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!aberto) return;
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [aberto, onFechar]);

    return (
        <AnimatePresence>
            {aberto && (
                <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={titulo}>
                    <motion.div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={onFechar}
                    />
                    <motion.div
                        className="relative w-full md:max-w-md max-h-[88vh] overflow-y-auto bg-[#111116] border-t md:border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                    >
                        <div className="sticky top-0 z-10 bg-[#111116] px-5 pt-3 pb-3 border-b border-white/[0.06]">
                            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 md:hidden" />
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base font-black text-white leading-tight">{titulo}</h2>
                                    {subtitulo && <p className="text-xs text-white/50 mt-0.5 truncate">{subtitulo}</p>}
                                </div>
                                <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 shrink-0 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/50 active:scale-95">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="px-5 pt-4">{children}</div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
