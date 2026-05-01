'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
    Trophy, XCircle, Zap, Activity, Pause, Play, 
    MessageSquare, Calendar, UserCheck, AlertTriangle,
    Wifi, TrendingUp, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * DASHBOARD CIRÚRGICO (Fase B)
 * 
 * Foco: War Room, Realtime e Controle da IA.
 */

interface ActivityItem {
    id: string;
    type: 'message' | 'status' | 'followup' | 'sale';
    text: string;
    timestamp: string;
    userName: string;
}

interface WarRoomKpis {
    wonToday: number;
    lostToday: number;
    queue: number;
    criticalSla: number;
}

interface SystemSettings {
    ai_paused: boolean;
}

export default function Dashboard() {
    const supabase = useMemo(() => createClient(), []);
    const [kpis, setKpis] = useState<WarRoomKpis>({ wonToday: 0, lostToday: 0, queue: 0, criticalSla: 0 });
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [aiPaused, setAiPaused] = useState(false);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(false);

    const fetchKpis = useCallback(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Ganhamos Hoje
        const { count: wonToday } = await supabase
            .from('leads_unified')
            .select('uid', { count: 'exact', head: true })
            .eq('status', 'vendido')
            .gte('updated_at', today.toISOString());

        // 2. Perdemos Hoje
        const { count: lostToday } = await supabase
            .from('leads_unified')
            .select('uid', { count: 'exact', head: true })
            .in('status', ['perdido', 'lost', 'lost_by_inactivity'])
            .gte('updated_at', today.toISOString());

        // 3. Fila (Ativos)
        const { count: queue } = await supabase
            .from('leads_unified_active')
            .select('uid', { count: 'exact', head: true });

        // 4. SLA Crítico (Score >= 80)
        const { count: criticalSla } = await supabase
            .from('leads_unified_active')
            .select('uid', { count: 'exact', head: true })
            .gte('ai_score', 80);

        setKpis({
            wonToday: wonToday || 0,
            lostToday: lostToday || 0,
            queue: queue || 0,
            criticalSla: criticalSla || 0
        });
    }, [supabase]);

    const fetchSettings = useCallback(async () => {
        const { data } = await supabase
            .from('system_settings')
            .select('ai_paused')
            .eq('id', 'global')
            .maybeSingle();
        if (data) setAiPaused(data.ai_paused);
    }, [supabase]);

    const fetchActivity = useCallback(async () => {
        // Busca mensagens recentes como proxy de atividade
        const { data: msgs } = await supabase
            .from('whatsapp_messages')
            .select(`
                id,
                message_text,
                created_at,
                direction,
                leads_manos_crm!lead_id ( name ),
                leads_compra!lead_compra_id ( nome )
            `)
            .order('created_at', { ascending: false })
            .limit(15);

        if (msgs) {
            const items: ActivityItem[] = msgs.map((m: any) => {
                const leadName = m.leads_manos_crm?.name || m.leads_compra?.nome || 'Lead';
                return {
                    id: m.id.toString(),
                    type: 'message',
                    text: m.direction === 'inbound' 
                        ? `Cliente ${leadName} enviou mensagem` 
                        : `Consultor respondeu ${leadName}`,
                    timestamp: m.created_at,
                    userName: leadName
                };
            });
            setActivities(items);
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        (async () => {
            await Promise.all([fetchKpis(), fetchSettings(), fetchActivity()]);
            if (alive) setLoading(false);
        })();

        // REALTIME SUBSCRIPTIONS
        const channel = supabase.channel('dashboard_war_room')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_manos_crm' }, fetchKpis)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_compra' }, fetchKpis)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, () => {
                fetchKpis();
                fetchActivity();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_settings' }, fetchSettings)
            .subscribe((status) => {
                setLive(status === 'SUBSCRIBED');
            });

        return () => { 
            alive = false;
            supabase.removeChannel(channel);
        };
    }, [supabase, fetchKpis, fetchSettings, fetchActivity]);

    async function toggleAi() {
        const next = !aiPaused;
        setAiPaused(next); // Optimistic
        await supabase
            .from('system_settings')
            .update({ ai_paused: next, updated_at: new Date().toISOString() })
            .eq('id', 'global');
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Activity className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
            {/* TOP HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-2">
                        War Room <span className="text-sm font-normal text-zinc-500">v4.0</span>
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'}`} />
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Monitoramento em Tempo Real</span>
                    </div>
                </div>

                {/* AI CONTROL PANEL */}
                <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${aiPaused ? 'bg-red-950/20 border-red-900/50' : 'bg-emerald-950/20 border-emerald-900/50'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${aiPaused ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                            {aiPaused ? <Pause size={20} /> : <Zap size={20} />}
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Inteligência SDR</div>
                            <div className={`text-sm font-bold ${aiPaused ? 'text-red-400' : 'text-emerald-400'}`}>
                                {aiPaused ? 'IA PAUSADA GERAL' : 'IA OPERANDO 24/7'}
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={toggleAi}
                        className={`px-4 py-2 rounded-xl font-black text-xs transition-all active:scale-95 ${aiPaused ? 'bg-red-500 text-white shadow-lg shadow-red-900/40' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                        {aiPaused ? 'REATIVAR IA' : 'PAUSAR IA'}
                    </button>
                </div>
            </div>

            {/* WAR ROOM KPIS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard 
                    label="Ganhamos Hoje" 
                    value={kpis.wonToday} 
                    icon={<Trophy className="w-6 h-6 text-emerald-400" />} 
                    color="text-emerald-400" 
                    bg="bg-emerald-500/5"
                    border="border-emerald-500/20"
                />
                <KpiCard 
                    label="Perdemos Hoje" 
                    value={kpis.lostToday} 
                    icon={<XCircle className="w-6 h-6 text-red-400" />} 
                    color="text-red-400" 
                    bg="bg-red-500/5"
                    border="border-red-500/20"
                />
                <KpiCard 
                    label="Leads na Fila" 
                    value={kpis.queue} 
                    icon={<Users className="w-6 h-6 text-blue-400" />} 
                    color="text-blue-400" 
                    bg="bg-blue-500/5"
                    border="border-blue-500/20"
                />
                <KpiCard 
                    label="SLA Crítico" 
                    value={kpis.criticalSla} 
                    icon={<AlertTriangle className="w-6 h-6 text-orange-400" />} 
                    color="text-orange-400" 
                    bg="bg-orange-500/5"
                    border="border-orange-500/20"
                    pulse={kpis.criticalSla > 0}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* ACTIVITY FEED */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-500" />
                            Feed de Atividade
                        </h2>
                        <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-1 rounded font-bold">LIVE</span>
                    </div>
                    
                    <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {activities.length === 0 ? (
                                <div className="p-8 text-center text-zinc-600 border-2 border-dashed border-zinc-900 rounded-3xl">
                                    Aguardando atividades...
                                </div>
                            ) : (
                                activities.map((act) => (
                                    <motion.div 
                                        key={act.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-center gap-4 group hover:border-zinc-600 transition-colors"
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${act.type === 'message' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                            {act.type === 'message' ? <MessageSquare size={18} /> : <UserCheck size={18} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-zinc-100 truncate">{act.text}</div>
                                            <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter mt-0.5">
                                                {act.userName} • {new Date(act.timestamp).toLocaleTimeString('pt-BR')}
                                            </div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                                                <Wifi size={14} />
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* SIDEBAR / QUICK LINKS */}
                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-2xl shadow-blue-900/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-white font-black text-lg mb-2">Bora Vender?</h3>
                            <p className="text-blue-100 text-sm mb-6 leading-relaxed">Você tem {kpis.queue} leads esperando na fila. O SLA crítico é de {kpis.criticalSla} leads.</p>
                            <a href="/inbox" className="block w-full bg-white text-blue-600 text-center py-3 rounded-xl font-black shadow-lg hover:scale-105 transition-transform active:scale-95">
                                ABRIR INBOX AGORA
                            </a>
                        </div>
                        <Activity className="absolute -bottom-8 -right-8 w-40 h-40 text-white/10 rotate-12" />
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
                        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Resumo do Dia</h4>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl">
                                <span className="text-sm text-zinc-400">Conversão de Fila</span>
                                <span className="text-sm font-bold text-white">
                                    {kpis.queue > 0 ? ((kpis.wonToday / (kpis.wonToday + kpis.lostToday + kpis.queue)) * 100).toFixed(1) : 0}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KpiCard({ label, value, icon, color, bg, border, pulse }: { 
    label: string; 
    value: number; 
    icon: React.ReactNode; 
    color: string; 
    bg: string;
    border: string;
    pulse?: boolean;
}) {
    return (
        <div className={`p-6 rounded-3xl border ${bg} ${border} transition-all relative overflow-hidden group`}>
            <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
                {icon}
            </div>
            <div className={`text-4xl font-black ${color} flex items-baseline gap-1`}>
                {value}
                <span className="text-xs font-normal text-zinc-600">leads</span>
            </div>
            
            {pulse && (
                <div className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </div>
            )}

            <div className="absolute -bottom-4 -right-4 opacity-0 group-hover:opacity-5 transition-opacity">
                {icon}
            </div>
        </div>
    );
}
