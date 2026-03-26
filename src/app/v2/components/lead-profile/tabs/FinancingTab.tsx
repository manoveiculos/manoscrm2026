'use client';
import React from 'react';
import { Calculator, Zap } from 'lucide-react';

export const FinancingTab: React.FC = () => {
    return (
        <div className="h-[300px] flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-red-600/10 border border-red-600/20 flex items-center justify-center">
                <Calculator size={32} className="text-red-500/50" />
            </div>
            <div>
                <h3 className="text-white font-bold text-lg">Módulo de Financiamento</h3>
                <p className="text-white/30 text-sm max-w-[280px] mt-2">
                    Estamos preparando um simulador avançado com aprovação direta via IA.
                </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
                <Zap size={12} className="text-amber-400" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Próxima Atualização</span>
            </div>
        </div>
    );
};
