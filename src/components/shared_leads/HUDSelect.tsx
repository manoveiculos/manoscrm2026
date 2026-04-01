'use client';

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Option {
    id: string;
    label: string;
}

interface HUDSelectProps {
    label: string;
    value: string;
    options: Option[];
    onChange: (val: string) => void;
    minWidth?: string;
    disabled?: boolean;
    icon?: React.ElementType;
}

export function HUDSelect({ 
    label, 
    value, 
    options, 
    onChange, 
    minWidth = '120px', 
    disabled = false,
    icon: Icon = ChevronDown
}: HUDSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const buttonRef = useRef<HTMLButtonElement>(null);
    const selectedOption = options.find(opt => opt.id === value) || options[0];

    // Garante que o portal só renderiza no cliente (evita erro de hidratação SSR)
    useEffect(() => { setMounted(true); }, []);

    const calculatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const dropdownHeight = Math.min(options.length * 36 + 12, 312);
        const openUpward = rect.bottom + dropdownHeight > viewportHeight;

        setDropdownStyle({
            position: 'fixed',
            top: openUpward ? rect.top - dropdownHeight : rect.bottom + 4,
            left: rect.left,
            minWidth: Math.max(rect.width, 200),
            zIndex: 99999,
        });
    }, [options.length]);

    const handleOpen = () => {
        if (disabled) return;
        calculatePosition();
        setIsOpen(prev => !prev);
    };

    useEffect(() => {
        if (!isOpen) return;
        const close = () => setIsOpen(false);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [isOpen]);

    return (
        <div className={`flex flex-col relative ${disabled ? 'opacity-40' : ''}`}>
            <span className="text-[7px] font-black text-red-500 uppercase tracking-widest mb-0.5">{label}</span>
            <button 
                ref={buttonRef}
                onClick={handleOpen}
                disabled={disabled}
                className={`flex items-center justify-between gap-2 bg-transparent text-[9px] font-black text-white/60 outline-none uppercase transition-colors text-left ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-white'}`}
                style={{ minWidth }}
            >
                <span className="truncate">{selectedOption?.label || 'Selecionar...'}</span>
                <Icon size={8} className={isOpen ? 'text-red-500' : 'text-white/20'} />
            </button>

            {/* Portal: AnimatePresence DEVE estar DENTRO do portal para o Framer Motion rastrear corretamente */}
            {mounted && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <>
                            <div 
                                style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                onClick={() => setIsOpen(false)} 
                            />
                            <motion.div 
                                key="hud-dropdown"
                                initial={{ opacity: 0, y: -5, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -5, scale: 0.97 }}
                                transition={{ duration: 0.12, ease: 'easeOut' }}
                                style={dropdownStyle}
                                className="bg-[#0a0a0a] border border-white/10 rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.98)] py-1.5"
                            >
                                <div className="max-h-[300px] overflow-y-auto">
                                    {options.map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                onChange(opt.id);
                                                setIsOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-red-600/10 hover:text-white transition-all flex items-center justify-between group ${value === opt.id ? 'text-red-500 bg-red-600/5' : 'text-white/40'}`}
                                        >
                                            {opt.label}
                                            {value === opt.id && <div className="w-1 h-1 rounded-full bg-red-600" />}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
