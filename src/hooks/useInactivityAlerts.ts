'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface InactivityAlert {
    id: string;
    kind: 'warning_8h' | 'auto_lost_24h' | string;
    created_at: string;
    lead_uid: string;
    lead_table: string;
    name: string;
    vehicle_interest: string | null;
    status: string | null;
    ultima_interacao_humana: string | null;
    hours_inactive: number | null;
    consultor_id: string | null;
    consultor_name: string | null;
}

interface UseInactivityAlertsResult {
    alerts: InactivityAlert[];
    count: number;
    warningCount: number;
    lostCount: number;
    loading: boolean;
    acknowledge: (alertId: string, action: 'will_respond' | 'return_to_queue') => Promise<void>;
    refetch: () => void;
}

const POLL_MS = 60_000;

/**
 * Lê os `inactivity_alerts` pendentes (a tabela que o monitor de inatividade
 * enchia sem nenhuma tela consumir) e alimenta o sino de Pressão de Cobrança.
 * Espelha o padrão do useNewLeadNotifications: sessão → consultor → fetch +
 * realtime + som ao chegar alerta novo.
 */
export function useInactivityAlerts(role?: string | null): UseInactivityAlertsResult {
    const [alerts, setAlerts] = useState<InactivityAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const prevIdsRef = useRef<Set<string>>(new Set());

    // ── Resolve o consultor logado (admin não precisa de cid) ───────────────
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }: any) => {
            const user = session?.user;
            if (!user) { setLoading(false); setReady(true); return; }
            supabase
                .from('consultants_manos_crm')
                .select('id')
                .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
                .maybeSingle()
                .then(({ data }: any) => {
                    if (data?.id) setConsultantId(data.id);
                    setReady(true);
                });
        }).catch((err: any) => {
            if (!(err?.name === 'AbortError' || err?.message?.includes('steal'))) {
                console.error('[useInactivityAlerts] sessão:', err);
            }
            setLoading(false);
            setReady(true);
        });
    }, []);

    const fetchAlerts = useCallback(async () => {
        const isAdmin = role === 'admin';
        if (!isAdmin && !consultantId) { setLoading(false); return; }

        const params = new URLSearchParams();
        if (consultantId) params.set('cid', consultantId);
        if (role) params.set('role', role);

        try {
            const res = await fetch(`/api/alerts/inactivity?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) { setLoading(false); return; }
            const json = await res.json();
            const next: InactivityAlert[] = json.alerts || [];

            // Som só quando chega alerta REALMENTE novo (não no primeiro load).
            const currentIds = new Set(next.map(a => a.id));
            const prev = prevIdsRef.current;
            if (prev.size > 0 && next.some(a => !prev.has(a.id))) {
                playPressureSound();
            }
            prevIdsRef.current = currentIds;

            setAlerts(next);
        } catch (e) {
            console.error('[useInactivityAlerts] fetch:', e);
        } finally {
            setLoading(false);
        }
    }, [role, consultantId]);

    // ── Fetch inicial + polling + realtime ──────────────────────────────────
    useEffect(() => {
        if (!ready) return;
        fetchAlerts();

        const interval = setInterval(fetchAlerts, POLL_MS);

        const channel = supabase
            .channel('inactivity-alerts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inactivity_alerts' }, () => fetchAlerts())
            .subscribe();

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [ready, fetchAlerts]);

    const acknowledge = useCallback(async (alertId: string, action: 'will_respond' | 'return_to_queue') => {
        // Otimista: tira o alerta da lista na hora.
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        prevIdsRef.current.delete(alertId);
        try {
            await fetch('/api/alerts/inactivity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alert_id: alertId, action }),
            });
        } catch (e) {
            console.error('[useInactivityAlerts] acknowledge:', e);
            fetchAlerts(); // rollback via re-sync
        }
    }, [fetchAlerts]);

    const warningCount = alerts.filter(a => a.kind === 'warning_8h').length;
    const lostCount = alerts.filter(a => a.kind === 'auto_lost_24h').length;

    return {
        alerts,
        count: alerts.length,
        warningCount,
        lostCount,
        loading,
        acknowledge,
        refetch: fetchAlerts,
    };
}

// Som de cobrança — duas notas graves/urgentes (mais "sério" que o de novo lead).
function playPressureSound() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch { /* ignore */ }
}
