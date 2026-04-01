'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AIAlert {
    id: string;
    lead_id: string | null;
    type: 'ai_auto' | 'ai_alert_compra';
    note: string;
    priority: string | null;
    created_at: string;
}

interface UseAIAlertsResult {
    count: number;
    alerts: AIAlert[];
    loading: boolean;
}

/**
 * Hook que monitora alertas IA pendentes via Supabase Realtime.
 * Escuta INSERT e UPDATE na tabela follow_ups para o consultor logado,
 * filtrando type = 'ai_auto' | 'ai_alert_compra' e status = 'pending'.
 */
export function useAIAlerts(): UseAIAlertsResult {
    const [count, setCount] = useState(0);
    const [alerts, setAlerts] = useState<AIAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [consultantId, setConsultantId] = useState<string | null>(null);

    // ── Resolve o ID do consultor logado ──────────────────────────────────────
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) { 
                setLoading(false); 
                return; 
            }

            supabase
                .from('consultants_manos_crm')
                .select('id')
                .eq('auth_id', user.id)
                .maybeSingle()
                .then(({ data }) => {
                    if (data?.id) setConsultantId(data.id);
                    else setLoading(false);
                });
        });
    }, []);

    // ── Busca contagem/alertas no banco ───────────────────────────────────────
    const fetchAlerts = useCallback(async (cid: string) => {
        const { data, error } = await supabase
            .from('follow_ups')
            .select('id, lead_id, type, note, priority, created_at')
            .eq('user_id', cid)
            .eq('status', 'pending')
            .in('type', ['ai_auto', 'ai_alert_compra'])
            .order('created_at', { ascending: false });

        if (!error && data) {
            setAlerts(data as AIAlert[]);
            setCount(data.length);
        }
        setLoading(false);
    }, []);

    // ── Realtime: re-busca ao receber INSERT ou UPDATE ─────────────────────────
    useEffect(() => {
        if (!consultantId) return;

        fetchAlerts(consultantId);

        const channel = supabase
            .channel(`ai-alerts-${consultantId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'follow_ups',
                    filter: `user_id=eq.${consultantId}`,
                },
                () => fetchAlerts(consultantId)
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [consultantId, fetchAlerts]);

    return { count, alerts, loading };
}
