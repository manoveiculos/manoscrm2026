import React from 'react';
import { Trophy, Flag } from 'lucide-react';

interface QuickActionsProps {
    onOpenFinish: (type: 'venda' | 'perda' | 'compra') => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onOpenFinish }) => {
    return (
        <div className="grid grid-cols-2 gap-4 pb-10">
            <button
                onClick={() => onOpenFinish('venda')}
                className="py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-red-600/50 transition-all flex items-center justify-center gap-2 text-white hover:bg-white/[0.05]"
            >
                <Trophy size={14} className="text-red-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Registrar Venda</span>
            </button>
            <button
                onClick={() => onOpenFinish('perda')}
                className="py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-red-600/50 transition-all flex items-center justify-center gap-2 text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
            >
                <Flag size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Perda Total</span>
            </button>
        </div>
    );
};
