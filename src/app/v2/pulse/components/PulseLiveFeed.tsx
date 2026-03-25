'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Bell, Sparkles, User, Zap } from 'lucide-react';

interface PulseEvent {
    id: string;
    type: 'analysis' | 'status' | 'message';
    message: string;
    timestamp: Date;
    leadName: string;
}

export const PulseLiveFeed: React.FC<{ leads: any[] }> = ({ leads }) => {
    const [events, setEvents] = useState<PulseEvent[]>([]);

    useEffect(() => {
        // Build initial events from lead data
        const initialEvents: PulseEvent[] = leads
            .filter(l => l.ai_reason || l.status !== 'new')
            .slice(0, 5)
            .map(l => ({
                id: `init-${l.id}`,
                type: l.status === 'negotiation' || l.status === 'proposed' ? 'analysis' : 'status',
                message: l.ai_reason ? l.ai_reason.split('|')[0].substring(0, 60) + '...' : `Lead ${l.status === 'contacted' ? 'foi contatado' : 'em movimentação'}`,
                timestamp: new Date(),
                leadName: l.name.split(' ')[0]
            }));
        
        setEvents(initialEvents);

        // Real-time listener for interactions could be added here if needed.
        // For now, we strictly use real data from the 'leads' prop.
    }, [leads]);

    return (
        <div className="premium-glass p-6 rounded-[2rem] border-white/5 bg-white/[0.01] h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                        <Activity size={18} className="animate-pulse" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Live Pulse</span>
                </div>
            </div>

            <div className="space-y-4 flex-1">
                <AnimatePresence initial={false}>
                    {events.map((event) => (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-red-500/20 transition-all group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="mt-1">
                                    {event.type === 'analysis' ? (
                                        <Sparkles size={14} className="text-amber-500" />
                                    ) : (
                                        <Zap size={14} className="text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-white group-hover:text-red-500 transition-colors uppercase">{event.leadName}</span>
                                        <span className="text-[9px] text-white/20 font-bold uppercase">{event.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-[11px] text-white/40 leading-relaxed group-hover:text-white/60 transition-colors">
                                        {event.message}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            
            <div className="mt-6 pt-6 border-t border-white/5">
                <p className="text-[9px] font-black text-white/10 uppercase tracking-[0.5em] text-center">Intelligence Engine Sync: Active</p>
            </div>
        </div>
    );
};
