'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
    Trophy, XCircle, Zap, Activity, Pause, Play, 
    MessageSquare, Calendar, UserCheck, AlertTriangle,
    Wifi, TrendingUp, Users, DollarSign, ShieldAlert, Hourglass, Trash2, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Imports de cobrança para o dashboard da Camila
import { BillingRecord, DashboardStats } from '@/types';
import { fetchBillingRecords, calculateStats } from '@/app/admin/cobranca/services/api';
import DashboardMetrics from '@/app/admin/cobranca/components/DashboardMetrics';
import AnaliseIaPanel from '@/app/admin/cobranca/components/AnaliseIaPanel';

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
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [lastKnownLeads, setLastKnownLeads] = useState<Set<string>>(new Set());

    // Controle de Acesso e Perfil Camila
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const isCamila = useMemo(() => {
        return userEmail === 'camila.renatta@hotmail.com' || userEmail === 'camilarenatta@hotmail.com';
    }, [userEmail]);

    // Estados de cobrança (usados se for Camila)
    const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
    const [billingStats, setBillingStats] = useState<DashboardStats>({
        totalAReceber: 0,
        valorRecebido: 0,
        inadimplencia: 0,
        porcentagemInadimplencia: 0
    });
    const [billingLoading, setBillingLoading] = useState(true);
    
    // Status da Fila Anti-Spam (usados se for Camila)
    const [billingQueueStatus, setBillingQueueStatus] = useState<any>({
        active: true,
        intervalSeconds: 180,
        secondsRemaining: 180,
        queueSize: 0,
        allowedStartHour: '08:00',
        allowedEndHour: '18:00',
        isWithinAllowedHours: true
    });
    
    // Toast para operações de cobrança na home
    const [billingToast, setBillingToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
    const showBillingToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
        setBillingToast({ message, type });
    }, []);

    // Dismiss automático do toast de cobrança
    useEffect(() => {
        if (billingToast) {
            const timer = setTimeout(() => setBillingToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [billingToast]);

    // Carregamento de cobranças se for a Camila
    useEffect(() => {
        if (!isCamila) return;
        
        let alive = true;
        
        const loadBillingData = async () => {
            try {
                const data = await fetchBillingRecords();
                if (alive) {
                    setBillingRecords(data);
                    setBillingStats(calculateStats(data));
                }
            } catch (err) {
                console.error('Erro ao buscar registros de cobrança:', err);
            } finally {
                if (alive) setBillingLoading(false);
            }
        };

        const loadQueueStatus = async () => {
            try {
                const res = await fetch('/api/billing/queue-status');
                if (res.ok && alive) {
                    const data = await res.json();
                    setBillingQueueStatus(data);
                }
            } catch (e) {
                // Silencioso
            }
        };

        loadBillingData();
        loadQueueStatus();

        // Polling para a fila anti-spam
        const interval = setInterval(() => {
            loadQueueStatus();
        }, 2000);

        return () => {
            alive = false;
            clearInterval(interval);
        };
    }, [isCamila]);

    // Ações do painel simplificado da fila de cobrança
    const handleToggleQueue = async () => {
        try {
            const res = await fetch('/api/billing/queue/toggle', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                showBillingToast(data.active ? 'Fila Anti-Spam ATIVA' : 'Fila Anti-Spam PAUSADA', 'info');
                const statusRes = await fetch('/api/billing/queue-status');
                if (statusRes.ok) {
                    const dataStatus = await statusRes.json();
                    setBillingQueueStatus(dataStatus);
                }
            }
        } catch (err) {
            showBillingToast('Ação indisponível', 'error');
        }
    };

    const handleForceDispatch = async () => {
        try {
            const res = await fetch('/api/billing/queue/force-dispatch', { method: 'POST' });
            if (res.ok) {
                showBillingToast('Disparo imediato efetuado!', 'success');
                const statusRes = await fetch('/api/billing/queue-status');
                if (statusRes.ok) {
                    const dataStatus = await statusRes.json();
                    setBillingQueueStatus(dataStatus);
                }
            } else {
                const data = await res.json();
                showBillingToast(data.error || 'Erro ao forçar disparo', 'error');
            }
        } catch (err) {
            showBillingToast('Erro ao forçar avanço', 'error');
        }
    };

    const getFormatTimeRemaining = (secs: number) => {
        if (secs <= 0) return 'Disparando...';
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${String(s).padStart(2, '0')}s`;
    };

    const fetchKpis = useCallback(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: sess } = await supabase.auth.getSession();
        const user = sess?.session?.user;
        if (!user) return;

        const userId = user.id;
        const email = user.email || null;
        setConsultantId(userId);
        setUserEmail(email);

        // Se for a Camila, aborta a busca de KPIs de Vendas / SDR
        const isCamilaUser = email === 'camila.renatta@hotmail.com' || email === 'camilarenatta@hotmail.com';
        if (isCamilaUser) {
            setLoading(false);
            return;
        }

        // 1. Ganhamos Hoje (Indiv.)
        const { count: wonToday } = await supabase
            .from('leads_unified')
            .select('uid', { count: 'exact', head: true })
            .eq('assigned_consultant_id', userId)
            .eq('status', 'vendido')
            .gte('updated_at', today.toISOString());

        // 2. Perdemos Hoje (Indiv.)
        const { count: lostToday } = await supabase
            .from('leads_unified')
            .select('uid', { count: 'exact', head: true })
            .eq('assigned_consultant_id', userId)
            .in('status', ['perdido', 'lost', 'lost_by_inactivity'])
            .gte('updated_at', today.toISOString());

        // 3. Fila (Ativos Indiv.)
        const { count: queue, data: queueLeads } = await supabase
            .from('leads_unified_active')
            .select('uid', { count: 'exact' })
            .eq('assigned_consultant_id', userId);

        // 4. SLA Crítico (Score >= 80 Indiv.)
        const { count: criticalSla } = await supabase
            .from('leads_unified_active')
            .select('uid', { count: 'exact', head: true })
            .eq('assigned_consultant_id', userId)
            .gte('ai_score', 80);

        setKpis({
            wonToday: wonToday || 0,
            lostToday: lostToday || 0,
            queue: queue || 0,
            criticalSla: criticalSla || 0
        });

        // Som de Notificação V3:
        // Identifica se entrou algum lead NOVO na fila que não conhecíamos nesta sessão.
        if (queueLeads) {
            const currentUids = new Set<string>(queueLeads.map((l: any) => l.uid as string));
            if (lastKnownLeads.size > 0) {
                const hasNew = queueLeads.some((l: any) => !lastKnownLeads.has(l.uid));
                if (hasNew && document.visibilityState === 'visible') {
                    const audio = new Audio('/ding.mp3');
                    audio.play().catch(() => {});
                }
            }
            setLastKnownLeads(currentUids);
        }
    }, [supabase, lastKnownLeads]);

    const fetchSettings = useCallback(async () => {
        const { data } = await supabase
            .from('system_settings')
            .select('ai_paused')
            .eq('id', 'global')
            .maybeSingle();
        if (data) setAiPaused(data.ai_paused);
    }, [supabase]);

    const fetchActivity = useCallback(async () => {
        // 1. Mensagens Recentes
        const { data: msgs } = await supabase
            .from('whatsapp_messages')
            .select(`
                id, message_text, created_at, direction,
                leads_manos_crm!lead_id ( name ),
                leads_compra!lead_compra_id ( nome )
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        // 2. Interações de IA (First Contact / Followup)
        const { data: aiActs } = await supabase
            .from('interactions_manos_crm')
            .select(`id, type, notes, created_at, lead_id`)
            .in('type', ['ai_first_contact', 'ai_followup'])
            .order('created_at', { ascending: false })
            .limit(10);

        // 3. Alertas de SLA
        const { data: slaActs } = await supabase
            .from('sla_escalations')
            // sla_escalations não tem created_at (a coluna é triggered_at). Aliasamos
            // pra manter o resto do código lendo `created_at` sem mudança.
            .select(`id, level, notes, created_at:triggered_at, lead_id`)
            .order('triggered_at', { ascending: false })
            .limit(10);

        const items: ActivityItem[] = [];

        if (msgs) {
            msgs.forEach((m: any) => {
                const leadName = m.leads_manos_crm?.name || m.leads_compra?.nome || 'Lead';
                items.push({
                    id: `msg-${m.id}`,
                    type: 'message',
                    text: m.direction === 'inbound' 
                        ? `Cliente ${leadName} enviou mensagem` 
                        : `Consultor respondeu ${leadName}`,
                    timestamp: m.created_at,
                    userName: leadName
                });
            });
        }

        if (aiActs) {
            aiActs.forEach((a: any) => {
                items.push({
                    id: `ai-${a.id}`,
                    type: 'followup',
                    text: a.type === 'ai_first_contact' ? `🤖 IA iniciou contato` : `🤖 IA enviou follow-up`,
                    timestamp: a.created_at,
                    userName: 'IA SDR'
                });
            });
        }

        if (slaActs) {
            slaActs.forEach((s: any) => {
                items.push({
                    id: `sla-${s.id}`,
                    type: 'status',
                    text: `⚠️ Alerta SLA Nível ${s.level}`,
                    timestamp: s.created_at,
                    userName: 'Sistema'
                });
            });
        }

        // Ordena tudo por tempo e pega top 15
        setActivities(items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15));
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        let channel: any = null;

        const init = async () => {
            const { data: sess } = await supabase.auth.getSession();
            const email = sess?.session?.user?.email || null;
            if (alive) {
                setUserEmail(email);
            }
            
            const isCamilaUser = email === 'camila.renatta@hotmail.com' || email === 'camilarenatta@hotmail.com';
            if (isCamilaUser) {
                if (alive) setLoading(false);
                return;
            }

            await Promise.all([fetchKpis(), fetchSettings(), fetchActivity()]);
            if (alive) {
                setLoading(false);

                // Subscreve apenas se NÃO for a Camila
                channel = supabase.channel('dashboard_war_room')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_manos_crm' }, fetchKpis)
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_compra' }, fetchKpis)
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, () => {
                        fetchKpis();
                        fetchActivity();
                    })
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions_manos_crm' }, fetchActivity)
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sla_escalations' }, fetchActivity)
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_settings' }, fetchSettings)
                    .subscribe((status: any) => {
                        setLive(status === 'SUBSCRIBED');
                    });
            }
        };

        init();

        return () => { 
            alive = false;
            if (channel) {
                supabase.removeChannel(channel);
            }
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

    if (isCamila) {
        if (billingLoading) {
            return (
                <div className="flex items-center justify-center min-h-[60vh] w-full">
                    <Activity className="w-8 h-8 text-violet-500 animate-spin" />
                </div>
            );
        }

        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 relative">
                {/* Cabeçalho */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-2">
                            Cockpit de Cobrança <span className="text-sm font-normal text-zinc-500">v1.5</span>
                        </h1>
                        <p className="text-sm text-zinc-400 mt-1">
                            Olá, Camila! Bem-vinda ao seu centro de controle de inadimplência e inteligência de cobrança.
                        </p>
                    </div>

                    <a 
                        href="/admin/cobranca" 
                        className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white font-black text-xs rounded-xl shadow-lg shadow-violet-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
                    >
                        <DollarSign className="w-4 h-4" />
                        Acessar Gestão Completa
                    </a>
                </div>

                {/* Métricas Financeiras */}
                <DashboardMetrics stats={billingStats} />

                {/* Grid Duplo: Briefing IA + Status do Robô */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Briefing IA */}
                    <div className="lg:col-span-2 space-y-4 font-sans">
                        <AnaliseIaPanel records={billingRecords} showToast={showBillingToast} />
                    </div>

                    {/* Widgets da Direita */}
                    <div className="space-y-6">
                        {/* Robô status card */}
                        <div className="bg-[#0C0C0F] border border-white/[0.06] p-6 rounded-3xl space-y-4 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/[0.02] rounded-bl-full pointer-events-none" />
                            
                            <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
                                <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                    <ShieldAlert className="w-5 h-5" />
                                </span>
                                <div>
                                    <h3 className="text-sm font-black text-white">Status do Robô</h3>
                                    <p className="text-[10px] text-zinc-550 uppercase tracking-widest font-bold">Fila Anti-Ban n8n</p>
                                </div>
                            </div>

                            <div className="space-y-4 font-sans text-xs">
                                <div className="flex justify-between items-center bg-zinc-950/40 p-3 rounded-xl border border-zinc-850">
                                    <span className="text-zinc-450 font-bold">Protetor Anti-Spam:</span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${
                                        billingQueueStatus.active 
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' 
                                            : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                                    }`}>
                                        {billingQueueStatus.active ? 'Ativo' : 'Pausado'}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-zinc-950/40 p-3 rounded-xl border border-zinc-850">
                                    <span className="text-zinc-450 font-bold">Próximo Disparo em:</span>
                                    <span className="font-mono text-zinc-200 font-extrabold flex items-center gap-1">
                                        <Hourglass className={`w-3.5 h-3.5 text-violet-400 ${billingQueueStatus.queueSize > 0 && billingQueueStatus.active && billingQueueStatus.isWithinAllowedHours ? 'animate-spin' : ''}`} />
                                        {billingQueueStatus.queueSize > 0 
                                            ? (!billingQueueStatus.isWithinAllowedHours
                                                ? `Fora da janela`
                                                : getFormatTimeRemaining(billingQueueStatus.secondsRemaining))
                                            : 'Fila Vazia'
                                        }
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-zinc-950/40 p-3 rounded-xl border border-zinc-850">
                                    <span className="text-zinc-450 font-bold">Contatos na Fila:</span>
                                    <span className="font-mono text-white font-black">
                                        <span className="text-violet-400 font-extrabold">{billingQueueStatus.queueSize}</span> cobranças
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    <button
                                        onClick={handleToggleQueue}
                                        className={`px-3 py-2 rounded-xl font-black text-center text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-md cursor-pointer ${
                                            billingQueueStatus.active 
                                                ? 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300' 
                                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        }`}
                                    >
                                        {billingQueueStatus.active ? (
                                            <><Pause className="w-3 h-3 text-zinc-400" /> Pausar Fila</>
                                        ) : (
                                            <><Play className="w-3 h-3 text-white fill-white" /> Retomar Fila</>
                                        )}
                                    </button>

                                    <button
                                        onClick={handleForceDispatch}
                                        disabled={billingQueueStatus.queueSize === 0}
                                        className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/60 text-zinc-300 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 transition-all cursor-pointer text-center"
                                        title="Dispara o topo da fila imediatamente"
                                    >
                                        Forçar Topo
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Dica rápida card */}
                        <div className="bg-gradient-to-br from-violet-600/10 to-indigo-700/5 border border-violet-500/20 p-6 rounded-3xl shadow-xl relative overflow-hidden">
                            <h3 className="text-white font-black text-sm mb-1.5 font-sans">Espaço da Camila</h3>
                            <p className="text-zinc-300 text-xs leading-relaxed mb-4 font-sans">
                                Use o briefing da IA à esquerda para economizar tempo. Você pode clicar em "Enviar Agora" para enviar a mensagem formatada direto ao WhatsApp do cliente usando a sua conta conectada.
                            </p>
                            <a 
                                href="/admin/cobranca" 
                                className="block w-full bg-white text-violet-600 text-center py-2.5 rounded-xl text-xs font-black shadow-lg hover:scale-105 transition-transform active:scale-95 cursor-pointer font-sans"
                            >
                                VER TODAS AS CONTAS
                            </a>
                        </div>
                    </div>
                </div>

                {/* Toasts de cobrança */}
                <AnimatePresence>
                    {billingToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl text-xs font-bold text-white max-w-sm"
                        >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                                billingToast.type === 'success' ? 'bg-green-500' :
                                billingToast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                            }`} />
                            <span className="flex-1 font-sans">{billingToast.message}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
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
