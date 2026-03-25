'use client';

import React from 'react';
import { Facebook, Globe, MessageCircle } from 'lucide-react';
import { Campaign } from '@/lib/types';
import { motion } from 'framer-motion';

interface TableProps {
    campaigns: Campaign[];
    leadsCount: Record<string, number>;
    onSelect: (campaign: Campaign) => void;
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export const CampaignsTableV2 = ({ campaigns, leadsCount, onSelect }: TableProps) => {
    return (
        <motion.div 
            variants={item}
            className="w-full bg-[#0C0C0F] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl relative"
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600/50 via-red-500/20 to-transparent" />
            
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5">
                            <th className="px-8 py-5 text-[10px] font-black uppercase text-white/30 tracking-[0.2em]">Campanha</th>
                            <th className="px-8 py-5 text-[10px] font-black uppercase text-white/30 tracking-[0.2em]">Status</th>
                            <th className="px-8 py-5 text-[10px] font-black uppercase text-white/30 tracking-[0.2em]">Investimento</th>
                            <th className="px-8 py-5 text-[10px] font-black uppercase text-white/30 tracking-[0.2em] hidden md:table-cell">Impressões</th>
                            <th className="px-8 py-5 text-[10px] font-black uppercase text-white/30 tracking-[0.2em] hidden lg:table-cell text-center">Leads (No CRM)</th>
                            <th className="px-8 py-5 text-right text-[10px] font-black uppercase text-white/30 tracking-[0.2em]">Ação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {campaigns.map((camp) => (
                            <tr 
                                key={camp.id} 
                                className="group hover:bg-white/[0.04] transition-all cursor-pointer"
                                onClick={() => onSelect(camp)}
                            >
                                <td className="px-8 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shrink-0">
                                            {camp.platform?.toLowerCase().includes('meta') ? <Facebook size={16} /> : <Globe size={16} />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm text-white group-hover:text-red-500 transition-colors truncate">{camp.name}</p>
                                            <p className="text-[10px] text-white/20 font-black uppercase tracking-widest mt-0.5">{camp.platform}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-5">
                                    <div className="flex items-center gap-2">
                                        <div className={`h-1.5 w-1.5 rounded-full ${camp.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${camp.status === 'active' ? 'text-emerald-500/80' : 'text-amber-500/80'}`}>
                                            {camp.status === 'active' ? 'Ativa' : 'Pausada'}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-8 py-5">
                                    <p className="text-sm font-bold text-white tabular-nums">R$ {Number(camp.total_spend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </td>
                                <td className="px-8 py-5 hidden md:table-cell text-sm text-white/40 tabular-nums">
                                    {Number(camp.impressions || 0).toLocaleString()}
                                </td>
                                <td className="px-8 py-5 hidden lg:table-cell">
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="h-6 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                            <span className="text-[11px] font-black text-emerald-500 tabular-nums">{camp.meta_results || 0}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-5 text-right">
                                    <button className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-red-600/20 hover:text-red-500 hover:border-red-500/30 transition-all">
                                        <ArrowUpRight size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {campaigns.length === 0 && (
                <div className="p-20 text-center">
                    <div className="h-16 w-16 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-white/10 mx-auto mb-4">
                        <MessageCircle size={32} />
                    </div>
                    <p className="text-sm text-white/20 font-medium italic italic">Nenhuma campanha encontrada no período.</p>
                </div>
            )}
        </motion.div>
    );
};

const ArrowUpRight = ({ size, className = '' }: { size: number, className?: string }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M7 17L17 7M17 7H7M17 7V17"/>
    </svg>
);
