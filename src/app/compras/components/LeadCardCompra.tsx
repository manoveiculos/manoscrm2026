'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
    Car, 
    Calendar, 
    Gauge, 
    DollarSign, 
    TrendingUp, 
    Phone,
    User,
    Tag,
    Clock,
    CheckCircle2,
    AlertCircle,
    MessageCircle
} from 'lucide-react';
import { LeadCompra } from '@/lib/types/compra';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';

interface LeadCardCompraProps {
    lead: LeadCompra;
    onClick: () => void;
}

export const LeadCardCompra = ({ lead, onClick }: LeadCardCompraProps) => {
    const margin = (lead.valor_fipe || 0) - (lead.valor_cliente || 0);
    const marginPercent = lead.valor_fipe ? (margin / lead.valor_fipe) * 100 : 0;
    
    const formatCurrency = (val?: number) => {
        if (!val) return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={onClick}
            className="group relative bg-[#141418] border border-white/[0.06] hover:border-red-500/30 rounded-2xl p-5 cursor-pointer transition-all shadow-lg overflow-hidden"
        >
            {/* Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Header: Lead Name & Badge */}
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex flex-col min-w-0">
                    <h3 className="text-[15px] font-black text-white truncate group-hover:text-red-400 transition-colors uppercase tracking-tight leading-none">
                        {lead.nome}
                    </h3>
                    {lead.telefone && (
                        <span className="text-[11px] font-bold text-white/40 mt-1">
                            {formatPhoneBR(lead.telefone)}
                        </span>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1">
                            <Tag size={10} /> {lead.origem || 'Facebook Leads'}
                        </span>
                    </div>
                </div>
                {lead.aceita_abaixo_fipe && (
                    <div className="shrink-0 animate-pulse">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider">
                            Abaixo FIPE
                        </div>
                    </div>
                )}
            </div>

            {/* Car Details */}
            <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none">Veículo</span>
                    <span className="text-[11px] font-bold text-white/90 truncate flex items-center gap-1.5">
                        <Car size={12} className="text-white/30" />
                        {lead.modelo || lead.veiculo_original}
                    </span>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none">Ano / KM</span>
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                            <Calendar size={12} className="text-white/30" />
                            {lead.ano || '---'}
                        </span>
                        <span className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                            <Gauge size={12} className="text-white/30" />
                            {lead.km ? `${(lead.km / 1000).toFixed(0)}k` : '---'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Financial Analysis */}
            <div className="bg-black/20 border border-white/[0.04] rounded-xl p-4 space-y-3 relative z-10">
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Valor Cliente</span>
                    <span className="text-xs font-black text-white">{formatCurrency(lead.valor_cliente)}</span>
                </div>
                <div className="flex justify-between items-center opacity-70">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Valor FIPE</span>
                    <span className="text-xs font-bold text-white/70">{formatCurrency(lead.valor_fipe)}</span>
                </div>
                
                <div className="h-px bg-white/5" />

                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                        <TrendingUp size={12} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Margem Estimada</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-black text-emerald-400 leading-none">{formatCurrency(margin)}</span>
                        <span className="text-[9px] font-bold text-emerald-500/50 mt-1">{marginPercent.toFixed(1)}% de margem</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-5 flex items-center justify-between pt-4 border-t border-white/[0.04] relative z-10">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                        <Clock size={10} className="text-white/40" />
                    </div>
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                        Criado há {Math.floor((Date.now() - new Date(lead.criado_em).getTime()) / (1000 * 60 * 60 * 24))} dias
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {lead.telefone && (
                        <a 
                            href={`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-white/30 hover:text-emerald-400 transition-colors bg-white/5 p-2 rounded-lg border border-white/10" 
                            title="Conversar no WhatsApp"
                        >
                            <MessageCircle size={14} />
                        </a>
                    )}
                    <button 
                        className="bg-red-600/10 hover:bg-red-600/20 text-red-400 p-2 rounded-lg border border-red-500/20 transition-all"
                        onClick={(e) => {
                            e.stopPropagation();
                            // Ação de check/concluir lead
                        }}
                    >
                        <CheckCircle2 size={14} />
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
