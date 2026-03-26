'use client';

import React from 'react';
import { TrendingUp, Users, Target, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface KPIProps {
    totalImpressions: number;
    totalLeads: number;
    avgCpl: number;
    totalSpend: number;
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export const KPISectionV2 = ({ totalImpressions, totalLeads, avgCpl, totalSpend }: KPIProps) => {
    const kpis = [
        { 
            label: "Visualização Total", 
            value: totalImpressions.toLocaleString(), 
            unit: "VISTAS", 
            icon: <TrendingUp size={20} />, 
            color: "text-blue-400",
            accent: "blue"
        },
        { 
            label: "Leads no CRM", 
            value: totalLeads.toString(), 
            unit: "LEADS", 
            icon: <Users size={20} />, 
            color: "text-purple-400",
            accent: "purple"
        },
        { 
            label: "CPL Médio", 
            value: `R$ ${avgCpl.toFixed(2)}`, 
            unit: "MÉDIA", 
            icon: <Target size={20} />, 
            color: "text-red-400",
            accent: "red"
        },
        { 
            label: "Total Investido", 
            value: `R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
            unit: "REAL", 
            icon: <ArrowUpRight size={20} />, 
            color: "text-emerald-400",
            accent: "emerald"
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, idx) => (
                <motion.div 
                    key={idx} 
                    variants={item}
                    className="p-6 rounded-[2rem] bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all shadow-2xl"
                >
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-${kpi.accent}-500/5 blur-[40px] -mr-12 -mt-12 group-hover:bg-${kpi.accent}-500/10 transition-all`} />
                    
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className={`h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center ${kpi.color}`}>
                            {kpi.icon}
                        </div>
                    </div>
                    
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">{kpi.label}</p>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-2xl font-black text-white tracking-tighter tabular-nums">{kpi.value}</h4>
                            <span className="text-[9px] text-white/20 font-bold uppercase">{kpi.unit}</span>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
};
