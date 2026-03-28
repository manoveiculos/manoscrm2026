'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Users, TrendingUp, Award } from 'lucide-react';

interface RankingItem {
    name: string;
    count: number;
}

interface RankingCardProps {
    ranking: RankingItem[];
}

export const RankingCard: React.FC<RankingCardProps> = ({ ranking }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="premium-glass p-6 border-white/5 bg-white/[0.01] rounded-[2rem] h-full flex flex-col shadow-2xl"
        >
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 shadow-lg shadow-amber-500/5">
                        <Trophy size={24} />
                    </div>
                    <div>
                        <h3 className="font-black text-white uppercase text-sm tracking-tight">Top Performance</h3>
                        <p className="text-[9px] text-white/30 uppercase font-black tracking-[0.2em] mt-1">Ranking de Vendas</p>
                    </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-white/40 uppercase tracking-widest">
                    Mês Atual
                </div>
            </div>

            <div className="space-y-3 flex-1">
                {ranking.length > 0 ? (
                    ranking.map((item, index) => (
                        <div 
                            key={item.name} 
                            className={`flex items-center justify-between p-4 rounded-xl border transition-all group ${
                                index === 0 
                                ? 'bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5' 
                                : 'bg-white/[0.03] border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="flex items-center gap-5">
                                <div className={`h-10 w-10 flex items-center justify-center rounded-xl font-black text-sm ${
                                    index === 0 ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/60'
                                }`}>
                                    {index + 1}º
                                </div>
                                <div>
                                    <p className="text-sm font-black text-white uppercase tracking-tight group-hover:text-amber-500 transition-colors">
                                        {item.name}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <TrendingUp size={10} className="text-emerald-500" />
                                        <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Em ascensão</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-black text-white tabular-nums">
                                    {item.count}
                                </div>
                                <p className="text-[9px] text-white/20 font-black uppercase tracking-widest">Vendas</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center py-20 opacity-20 text-center space-y-4">
                        <Users size={48} />
                        <p className="text-sm font-medium italic">Aguardando dados de performance...</p>
                    </div>
                )}
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-white/20">
                <Award size={14} />
                <span className="text-[9px] font-black uppercase tracking-[0.3em]">Competição Saudável e Transparente</span>
            </div>
        </motion.div>
    );
};
