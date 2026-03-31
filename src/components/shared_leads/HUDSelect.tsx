'use client';

import React, { useState } from 'react';
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
    const selectedOption = options.find(opt => opt.id === value) || options[0];

    return (
        <div className={`flex flex-col relative ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
            <span className="text-[7px] font-black text-red-500 uppercase tracking-widest mb-0.5">{label}</span>
            <button 
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center justify-between gap-2 bg-transparent text-[9px] font-black text-white/60 outline-none uppercase cursor-pointer hover:text-white transition-colors text-left"
                style={{ minWidth }}
            >
                <span className="truncate">{selectedOption.label}</span>
                <Icon size={8} className={isOpen ? 'text-red-500' : 'text-white/20'} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Overlay invisível para fechar ao clicar fora */}
                        <div 
                            className="fixed inset-0 z-[999]" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <motion.div 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="absolute top-full left-0 bg-[#0a0a0a]/95 border border-white/10 rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.95)] py-1.5 z-[1000] min-w-[200px] backdrop-blur-3xl"
                        >
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
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
                                        {value === opt.id && <div className="w-1 h-1 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]" />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
