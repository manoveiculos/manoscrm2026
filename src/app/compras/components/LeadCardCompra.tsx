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
    MessageCircle,
    Brain,
    Flame,
    Snowflake,
    Zap,
    Trash2,
    MapPin
} from 'lucide-react';
import { LeadCompra } from '@/lib/types/compra';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';

interface LeadCardCompraProps {
    lead: LeadCompra;
    isDuplicate?: boolean;
    onClick: () => void;
}

export const LeadCardCompra = ({ lead, isDuplicate, onClick }: LeadCardCompraProps) => {
    const margin = (lead.valor_fipe || 0) - (lead.valor_negociado || lead.valor_cliente || 0);
    const marginPercent = lead.valor_fipe ? (margin / lead.valor_fipe) * 100 : 0;
    
    const formatCurrency = (val?: number) => {
        if (!val) return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-red-500 border-red-500/50 bg-red-500/10';
        if (score >= 40) return 'text-orange-500 border-orange-500/50 bg-orange-500/10';
        return 'text-blue-500 border-blue-500/50 bg-blue-500/10';
    };

    const getScoreIcon = (score: number) => {
        if (score >= 80) return <Flame size={10} className="text-red-500" />;
        if (score >= 40) return <Zap size={10} className="text-orange-500" />;
        return <Snowflake size={10} className="text-blue-500" />;
    };

    const aiScore = lead.ai_score || 0;
    const hasAI = typeof lead.ai_score === 'number' || lead.ai_summary;
    const firstPhoto = lead.fotos?.[0]?.url;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={onClick}
            className="group relative bg-[#141418] border border-white/[0.06] hover:border-red-500/30 rounded-2xl cursor-pointer transition-all shadow-xl overflow-hidden flex flex-col h-full"
        >
            {/* 1. Mini Photo / Placeholder Banner */}
            <div className="relative h-32 w-full overflow-hidden bg-white/5">
                {firstPhoto ? (
                    <img 
                        src={firstPhoto} 
                        alt={lead.modelo} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center opacity-20 group-hover:opacity-30 transition-opacity">
                        <Car size={32} className="text-white mb-1" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-white">Sem Foto</span>
                    </div>
                )}
                
                {/* Overlay Badges em cima da foto */}
                <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-10">
                    {lead.prioridade === 1 && (
                        <span className="flex items-center gap-1 bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest shadow-lg">
                            <Flame size={10} /> Quente
                        </span>
                    )}
                    {isDuplicate && (
                        <span className="flex items-center gap-1 bg-yellow-500 text-black text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest shadow-lg">
                            <AlertCircle size={10} /> Duplicado
                        </span>
                    )}
                </div>

                {lead.aceita_abaixo_fipe && (
                    <div className="absolute top-2 right-2 z-10">
                        <span className="bg-emerald-500 text-white text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest shadow-lg">
                            Abaixo FIPE
                        </span>
                    </div>
                )}

                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#141418] to-transparent" />
            </div>

            <div className="p-4 flex flex-col flex-grow">
                {/* 2. Header Info */}
                <div className="mb-3">
                    <div className="flex justify-between items-start gap-2">
                        <h3 className="text-sm font-black text-white leading-tight uppercase tracking-tight line-clamp-1 group-hover:text-red-400 transition-colors">
                            {lead.nome || 'Lead Sem Nome'}
                        </h3>
                        {hasAI && (
                            <div className={`shrink-0 flex items-center justify-center w-5 h-5 rounded-full border ${getScoreColor(aiScore)}`}>
                                {getScoreIcon(aiScore)}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-2">
                            <Phone size={10} className="text-white/20" />
                            <span className="text-[10px] font-bold text-white/40">
                                {lead.telefone ? formatPhoneBR(lead.telefone) : '---'}
                            </span>
                        </div>
                        {lead.cidade && (
                            <div className="flex items-center gap-1 opacity-60">
                                <MapPin size={9} className="text-red-500" />
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{lead.cidade}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Car Specs (Compact) */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Car size={12} className="text-red-500/50 shrink-0" />
                        <span className="text-[10px] font-bold text-white/80 truncate">{lead.modelo || lead.veiculo_original || '---'}</span>
                    </div>
                    <div className="flex items-center gap-3 justify-end">
                        <div className="flex items-center gap-1 shrink-0">
                            <Calendar size={10} className="text-white/20" />
                            <span className="text-[10px] font-bold text-white/60">{lead.ano || '--'}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <Gauge size={10} className="text-white/20" />
                            <span className="text-[10px] font-bold text-white/60">{lead.km ? `${(lead.km / 1000).toFixed(0)}k` : '--'}</span>
                        </div>
                    </div>
                </div>

                {/* 4. Financial Highlight */}
                <div className="mt-auto bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Margem Estimada</span>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${margin >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                            {marginPercent.toFixed(1)}%
                        </span>
                    </div>
                    <div className="flex justify-between items-end gap-1 px-1">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-bold text-white/30 uppercase leading-none mb-1">Valor FIPE</span>
                            <span className="text-[10px] font-bold text-white/60 leading-none">{formatCurrency(lead.valor_fipe)}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[12px] font-black text-emerald-400 leading-none">
                                + {formatCurrency(margin)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 5. Footer Actions */}
                <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-white/20" />
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider">
                            {Math.floor((Date.now() - new Date(lead.criado_em).getTime()) / (1000 * 60 * 60 * 24))}d atrás
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {lead.telefone && (
                            <a 
                                href={`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    // Registro silencioso do touch
                                    try {
                                        await fetch('/api/leads/touch', {
                                            method: 'POST',
                                            body: JSON.stringify({ leadId: lead.id })
                                        });
                                    } catch (err) {
                                        console.warn('Failed to record touch:', err);
                                    }
                                }}
                                className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-emerald-400 transition-colors bg-white/5 hover:bg-emerald-500/10 rounded-lg border border-white/10" 
                                title="WhatsApp"
                            >
                                <MessageCircle size={12} />
                            </a>
                        )}
                        <button 
                            className="w-7 h-7 flex items-center justify-center bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg border border-red-500/20 transition-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                // Ação de fechar/concluir
                            }}
                        >
                            <CheckCircle2 size={12} />
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Background Glow on Hover */}
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-red-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </motion.div>
    );
};
