'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Clock, Calendar, X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface AlertData {
    id: string;
    type: string;
    lead_id: string;
    title: string;
    message: string;
    priority: number;
}

export const GlobalAlertsV2 = () => {
    const [alerts, setAlerts] = useState<AlertData[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        async function fetchAlerts() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('name')
                    .eq('auth_id', user.id)
                    .single();

                if (consultant) {
                    const res = await fetch(`/api/v2/pulse-alerts?consultantName=${encodeURIComponent(consultant.name)}`);
                    const json = await res.json();
                    if (json.success && json.alerts?.length > 0) {
                        setAlerts(json.alerts);
                    }
                }
            } catch (error) {
                console.error("Erro ao buscar alertas globais:", error);
            }
        }

        fetchAlerts();
        const interval = setInterval(fetchAlerts, 5 * 60 * 1000); // 5 minutos
        return () => clearInterval(interval);
    }, []);

    // Rotação dos alertas visíveis
    useEffect(() => {
        if (alerts.length <= 1) return;
        const rotate = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % alerts.length);
        }, 12000); // Rotação a cada 12s se houver mais de um alerta
        return () => clearInterval(rotate);
    }, [alerts.length]);

    if (alerts.length === 0) return null;

    const currentAlert = alerts[currentIndex];
    
    // Icone baseado no tipo
    const getIcon = () => {
        if (currentAlert.title.includes('Quente')) return <Flame size={18} className="text-red-500 animate-pulse" />;
        if (currentAlert.title.includes('Novo')) return <Clock size={18} className="text-blue-500" />;
        if (currentAlert.title.includes('Agendamento')) return <Calendar size={18} className="text-amber-500" />;
        return <AlertTriangle size={18} className="text-white/60" />;
    };

    const getBorderColor = () => {
        if (currentAlert.type === 'danger') return 'border-red-500/50 shadow-red-500/20';
        if (currentAlert.type === 'warning') return 'border-blue-500/50 shadow-blue-500/20';
        if (currentAlert.type === 'info') return 'border-amber-500/50 shadow-amber-500/20';
        return 'border-white/10';
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none flex justify-center pt-4 px-4">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentAlert.id}
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0, scale: 0.95 }}
                    className={`pointer-events-auto flex items-center justify-between gap-4 glass-card border ${getBorderColor()} shadow-xl rounded-2xl p-4 w-full max-w-2xl bg-black/80 backdrop-blur-md`}
                >
                    <div className="flex items-center gap-4 flex-1">
                        <div className="shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10">
                            {getIcon()}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#ef4444] mb-0.5">
                                {currentAlert.title}
                            </span>
                            <span className="text-sm font-medium text-white/90">
                                {currentAlert.message}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0">
                        <Link 
                            href={`/v2/pipeline?id=${currentAlert.lead_id}`}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 transition-all rounded-lg text-xs font-bold uppercase tracking-wider text-white"
                            onClick={() => {
                                // Diminuir o alerta que acabou de ser clicado
                                setAlerts(prev => prev.filter(a => a.id !== currentAlert.id));
                            }}
                        >
                            Ver Lead
                        </Link>
                        <button 
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                            onClick={() => {
                                setAlerts(prev => prev.filter(a => a.id !== currentAlert.id));
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
