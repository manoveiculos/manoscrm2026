'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Pause, Play, Activity, DollarSign, ShieldAlert, Hourglass } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Imports de cobrança para o dashboard da Camila
import { BillingRecord, DashboardStats } from '@/types';
import { fetchBillingRecords, calculateStats } from '@/app/admin/cobranca/services/api';
import DashboardMetrics from '@/app/admin/cobranca/components/DashboardMetrics';
import AnaliseIaPanel from '@/app/admin/cobranca/components/AnaliseIaPanel';

// War Room (vendas) — painel role-aware: gerência vê a loja, consultor vê o dele.
import WarRoom from './_home/WarRoom';

const CAMILA_EMAILS = ['camila.renatta@hotmail.com', 'camilarenatta@hotmail.com'];

export default function Dashboard() {
    const supabase = useMemo(() => createClient(), []);
    const [ready, setReady] = useState(false);
    const [authId, setAuthId] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const isCamila = useMemo(() => !!userEmail && CAMILA_EMAILS.includes(userEmail), [userEmail]);

    // Estados de cobrança (usados se for Camila)
    const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
    const [billingStats, setBillingStats] = useState<DashboardStats>({
        totalAReceber: 0, valorRecebido: 0, inadimplencia: 0, porcentagemInadimplencia: 0,
    });
    const [billingLoading, setBillingLoading] = useState(true);
    const [billingQueueStatus, setBillingQueueStatus] = useState<any>({
        active: true, intervalSeconds: 180, secondsRemaining: 180, queueSize: 0,
        allowedStartHour: '08:00', allowedEndHour: '18:00', isWithinAllowedHours: true,
    });
    const [billingToast, setBillingToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
    const showBillingToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => setBillingToast({ message, type }), []);

    useEffect(() => {
        if (billingToast) {
            const timer = setTimeout(() => setBillingToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [billingToast]);

    // Resolve a identidade do usuário (email + authId) uma vez.
    useEffect(() => {
        (async () => {
            const { data: sess } = await supabase.auth.getSession();
            setAuthId(sess?.session?.user?.id || null);
            setUserEmail(sess?.session?.user?.email || null);
            setReady(true);
        })();
    }, [supabase]);

    // Carregamento de cobranças se for a Camila
    useEffect(() => {
        if (!isCamila) return;
        let alive = true;

        const loadBillingData = async () => {
            try {
                const data = await fetchBillingRecords();
                if (alive) { setBillingRecords(data); setBillingStats(calculateStats(data)); }
            } catch (err) {
                console.error('Erro ao buscar registros de cobrança:', err);
            } finally {
                if (alive) setBillingLoading(false);
            }
        };
        const loadQueueStatus = async () => {
            try {
                const res = await fetch('/api/billing/queue-status');
                if (res.ok && alive) setBillingQueueStatus(await res.json());
            } catch { /* Silencioso */ }
        };

        loadBillingData();
        loadQueueStatus();
        const interval = setInterval(loadQueueStatus, 2000);
        return () => { alive = false; clearInterval(interval); };
    }, [isCamila]);

    const handleToggleQueue = async () => {
        try {
            const res = await fetch('/api/billing/queue/toggle', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                showBillingToast(data.active ? 'Fila Anti-Spam ATIVA' : 'Fila Anti-Spam PAUSADA', 'info');
                const statusRes = await fetch('/api/billing/queue-status');
                if (statusRes.ok) setBillingQueueStatus(await statusRes.json());
            }
        } catch { showBillingToast('Ação indisponível', 'error'); }
    };

    const handleForceDispatch = async () => {
        try {
            const res = await fetch('/api/billing/queue/force-dispatch', { method: 'POST' });
            if (res.ok) {
                showBillingToast('Disparo imediato efetuado!', 'success');
                const statusRes = await fetch('/api/billing/queue-status');
                if (statusRes.ok) setBillingQueueStatus(await statusRes.json());
            } else {
                const data = await res.json();
                showBillingToast(data.error || 'Erro ao forçar disparo', 'error');
            }
        } catch { showBillingToast('Erro ao forçar avanço', 'error'); }
    };

    const getFormatTimeRemaining = (secs: number) => {
        if (secs <= 0) return 'Disparando...';
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${String(s).padStart(2, '0')}s`;
    };

    if (!ready) {
        return <div className="flex items-center justify-center min-h-[60vh]"><Activity className="w-8 h-8 text-blue-500 animate-spin" /></div>;
    }

    // ── Consultores / Gerência → War Room ──
    if (!isCamila) {
        return <WarRoom authId={authId} />;
    }

    // ── Camila → Cockpit de Cobrança ──
    if (billingLoading) {
        return <div className="flex items-center justify-center min-h-[60vh] w-full"><Activity className="w-8 h-8 text-violet-500 animate-spin" /></div>;
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

                <a href="/admin/cobranca" className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white font-black text-xs rounded-xl shadow-lg shadow-violet-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer">
                    <DollarSign className="w-4 h-4" />
                    Acessar Gestão Completa
                </a>
            </div>

            {/* Métricas Financeiras */}
            <DashboardMetrics stats={billingStats} />

            {/* Grid Duplo: Briefing IA + Status do Robô */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4 font-sans">
                    <AnaliseIaPanel records={billingRecords} showToast={showBillingToast} />
                </div>

                <div className="space-y-6">
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
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${billingQueueStatus.active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                                    {billingQueueStatus.active ? 'Ativo' : 'Pausado'}
                                </span>
                            </div>

                            <div className="flex justify-between items-center bg-zinc-950/40 p-3 rounded-xl border border-zinc-850">
                                <span className="text-zinc-450 font-bold">Próximo Disparo em:</span>
                                <span className="font-mono text-zinc-200 font-extrabold flex items-center gap-1">
                                    <Hourglass className={`w-3.5 h-3.5 text-violet-400 ${billingQueueStatus.queueSize > 0 && billingQueueStatus.active && billingQueueStatus.isWithinAllowedHours ? 'animate-spin' : ''}`} />
                                    {billingQueueStatus.queueSize > 0
                                        ? (!billingQueueStatus.isWithinAllowedHours ? `Fora da janela` : getFormatTimeRemaining(billingQueueStatus.secondsRemaining))
                                        : 'Fila Vazia'}
                                </span>
                            </div>

                            <div className="flex justify-between items-center bg-zinc-950/40 p-3 rounded-xl border border-zinc-850">
                                <span className="text-zinc-450 font-bold">Contatos na Fila:</span>
                                <span className="font-mono text-white font-black">
                                    <span className="text-violet-400 font-extrabold">{billingQueueStatus.queueSize}</span> cobranças
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button onClick={handleToggleQueue} className={`px-3 py-2 rounded-xl font-black text-center text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-md cursor-pointer ${billingQueueStatus.active ? 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                                    {billingQueueStatus.active ? (<><Pause className="w-3 h-3 text-zinc-400" /> Pausar Fila</>) : (<><Play className="w-3 h-3 text-white fill-white" /> Retomar Fila</>)}
                                </button>

                                <button onClick={handleForceDispatch} disabled={billingQueueStatus.queueSize === 0} className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/60 text-zinc-300 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 transition-all cursor-pointer text-center" title="Dispara o topo da fila imediatamente">
                                    Forçar Topo
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-violet-600/10 to-indigo-700/5 border border-violet-500/20 p-6 rounded-3xl shadow-xl relative overflow-hidden">
                        <h3 className="text-white font-black text-sm mb-1.5 font-sans">Espaço da Camila</h3>
                        <p className="text-zinc-300 text-xs leading-relaxed mb-4 font-sans">
                            Use o briefing da IA à esquerda para economizar tempo. Você pode clicar em "Enviar Agora" para enviar a mensagem formatada direto ao WhatsApp do cliente usando a sua conta conectada.
                        </p>
                        <a href="/admin/cobranca" className="block w-full bg-white text-violet-600 text-center py-2.5 rounded-xl text-xs font-black shadow-lg hover:scale-105 transition-transform active:scale-95 cursor-pointer font-sans">
                            VER TODAS AS CONTAS
                        </a>
                    </div>
                </div>
            </div>

            {/* Toasts de cobrança */}
            <AnimatePresence>
                {billingToast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl text-xs font-bold text-white max-w-sm">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${billingToast.type === 'success' ? 'bg-green-500' : billingToast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <span className="flex-1 font-sans">{billingToast.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
