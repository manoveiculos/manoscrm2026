import React from 'react';
import { Trophy, Flag, CalendarClock } from 'lucide-react';

interface QuickActionsProps {
    onOpenFinish: (type: 'venda' | 'perda' | 'compra') => void;
    agendarPrefill?: { nome?: string; telefone?: string; veiculo?: string; leadUid?: string } | null;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onOpenFinish, agendarPrefill }) => {
    const abrirAgenda = () => {
        const p = new URLSearchParams({ novo: '1' });
        if (agendarPrefill?.nome) p.set('nome', agendarPrefill.nome);
        if (agendarPrefill?.telefone) p.set('tel', agendarPrefill.telefone);
        if (agendarPrefill?.veiculo) p.set('veiculo', agendarPrefill.veiculo);
        if (agendarPrefill?.leadUid) p.set('lead', agendarPrefill.leadUid);
        window.open(`/agenda?${p.toString()}`, '_blank');
    };

    return (
        <div className="space-y-3 pb-10">
            {/* WhatsApp só serve pra AGENDAR: ação de destaque */}
            <button
                onClick={abrirAgenda}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 transition-all flex items-center justify-center gap-2 text-white"
            >
                <CalendarClock size={15} />
                <span className="text-[11px] font-black uppercase tracking-widest">Agendar visita</span>
            </button>

            <div className="grid grid-cols-2 gap-4">
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
        </div>
    );
};
