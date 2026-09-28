'use client';

import { useCallback, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Visualizador de imagem em tela cheia, aberto por cima do painel (sem sair
 * da página / abrir nova aba). Navega entre todas as imagens da mesma pauta
 * com setas, teclado (← → Esc) e uma tira de miniaturas que rola na
 * horizontal — pedido do Alexandre: "ao clicar na imagem abra no lugar e
 * nao em nova aba, deixar rolar ao lado para passar as imagens".
 */
export function Lightbox({
    images, index, title, onClose, onNavigate,
}: {
    images: string[];
    index: number;
    title: string;
    onClose: () => void;
    onNavigate: (nextIndex: number) => void;
}) {
    const stripRef = useRef<HTMLDivElement>(null);

    const go = useCallback((delta: number) => {
        if (images.length === 0) return;
        const next = (index + delta + images.length) % images.length;
        onNavigate(next);
    }, [index, images.length, onNavigate]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') go(-1);
            if (e.key === 'ArrowRight') go(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, go]);

    useEffect(() => {
        const el = stripRef.current?.children[index] as HTMLElement | undefined;
        el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [index]);

    if (images.length === 0) return null;

    return (
        <div
            className="fixed inset-0 z-[300] flex flex-col bg-black/95 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            role="dialog"
            aria-modal="true"
        >
            <div className="flex items-center justify-between px-5 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm text-zinc-300 truncate pr-4">
                    {title} <span className="text-zinc-600">— {index + 1}/{images.length}</span>
                </p>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors shrink-0" aria-label="Fechar">
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center px-4 relative" onClick={(e) => e.stopPropagation()}>
                {images.length > 1 && (
                    <button
                        onClick={() => go(-1)}
                        className="absolute left-2 md:left-6 z-10 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                        aria-label="Imagem anterior"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={images[index]}
                    alt={`${title} — imagem ${index + 1}`}
                    className="max-w-full max-h-full object-contain rounded-lg select-none"
                />
                {images.length > 1 && (
                    <button
                        onClick={() => go(1)}
                        className="absolute right-2 md:right-6 z-10 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                        aria-label="Próxima imagem"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                )}
            </div>

            {images.length > 1 && (
                <div
                    ref={stripRef}
                    className="shrink-0 flex gap-2 overflow-x-auto px-4 py-3 custom-scrollbar snap-x snap-mandatory"
                    onClick={(e) => e.stopPropagation()}
                >
                    {images.map((url, i) => (
                        <button
                            key={i}
                            onClick={() => onNavigate(i)}
                            className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 snap-start transition-opacity ${i === index ? 'border-white opacity-100' : 'border-white/10 opacity-50 hover:opacity-80'}`}
                            aria-label={`Ver imagem ${i + 1}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`miniatura ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
