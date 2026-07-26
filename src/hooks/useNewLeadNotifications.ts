'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface NewLeadNotification {
    id: string;          // uid da view (ex.: "leads_distribuicao_crm_26:123")
    name: string;
    source: string;
    vehicle_interest: string;
    created_at: string;
}

interface SeenState {
    ids: string[];
    updatedAt: string;
}

interface UseNewLeadNotificationsResult {
    unseenCount: number;
    leads: NewLeadNotification[];
    loading: boolean;
    markAllSeen: () => void;
    markSeen: (leadId: string) => void;
}

const SEEN_KEY_PREFIX = 'lead_notif_seen_';
const FETCH_WINDOW_HOURS = 48;
const POLL_MS = 45_000;

function getSeenState(key: string): SeenState {
    try {
        const raw = localStorage.getItem(`${SEEN_KEY_PREFIX}${key}`);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { ids: [], updatedAt: new Date().toISOString() };
}

function saveSeenState(key: string, state: SeenState) {
    localStorage.setItem(`${SEEN_KEY_PREFIX}${key}`, JSON.stringify(state));
}

/**
 * Sininho da FILA DE PESCA (Fase 1).
 *
 * Com pesca pura, todo lead entra SEM dono. O sininho mostra a pesca — leads
 * ainda não capturados (assigned_consultant_id NULL e atendimento_iniciado_em
 * NULL) — para TODOS os vendedores, de TODAS as fontes (WhatsApp/dist, manos,
 * compra) via a view unificada `leads_unified_active` (que já exclui status
 * finais). Quem clica "Iniciar Atendimento" no /inbox tira o lead da pesca.
 *
 * Antes: lia só `leads_manos_crm` e filtrava por assigned = eu — o que, sob
 * pesca, mostraria NADA e ignorava todo lead de WhatsApp.
 */
export function useNewLeadNotifications(_role?: string | null): UseNewLeadNotificationsResult {
    const [leads, setLeads] = useState<NewLeadNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [seenKey, setSeenKey] = useState<string>('anon');
    const [seenIds, setSeenIds] = useState<string[]>([]);
    const prevLeadIdsRef = useRef<Set<string>>(new Set());

    // ── Resolve uma chave estável pro estado "visto" (por usuário) ────────
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }: any) => {
            const key = session?.user?.id || 'anon';
            setSeenKey(key);
            setSeenIds(getSeenState(key).ids);
        }).catch(() => { /* mantém 'anon' */ });
    }, []);

    // ── Busca a fila de pesca (leads sem dono / não iniciados) ────────────
    const fetchLeads = useCallback(async () => {
        const since = new Date();
        since.setHours(since.getHours() - FETCH_WINDOW_HOURS);

        const { data, error } = await supabase
            .from('leads_unified_active')
            .select('uid, name, source, vehicle_interest, created_at')
            .is('assigned_consultant_id', null)
            .is('atendimento_iniciado_em', null)
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: false })
            .limit(30);

        if (!error && data) {
            const newLeads: NewLeadNotification[] = (data as any[]).map((l) => ({
                id: l.uid,
                name: l.name,
                source: l.source,
                vehicle_interest: l.vehicle_interest,
                created_at: l.created_at,
            }));

            // Toca som se chegou lead realmente novo desde a última leitura.
            const currentIds = new Set(newLeads.map(l => l.id));
            const prevIds = prevLeadIdsRef.current;
            if (prevIds.size > 0 && newLeads.some(l => !prevIds.has(l.id))) {
                playNotificationSound();
            }
            prevLeadIdsRef.current = currentIds;

            setLeads(newLeads);
        }
        setLoading(false);
    }, []);

    // ── Realtime nas 3 tabelas de entrada + polling de segurança ──────────
    useEffect(() => {
        fetchLeads();

        const channel = supabase
            .channel('pesca-new-leads')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads_distribuicao_crm_26' }, () => fetchLeads())
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads_manos_crm' }, () => fetchLeads())
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads_compra' }, () => fetchLeads())
            .subscribe();

        // Fallback: realtime pode não estar habilitado em todas as tabelas.
        const poll = setInterval(fetchLeads, POLL_MS);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(poll);
        };
    }, [fetchLeads]);

    // ── Sync do "visto" entre abas ────────────────────────────────────────
    useEffect(() => {
        const key = `${SEEN_KEY_PREFIX}${seenKey}`;
        const handler = (e: StorageEvent) => {
            if (e.key === key && e.newValue) {
                try {
                    const parsed: SeenState = JSON.parse(e.newValue);
                    setSeenIds(parsed.ids);
                } catch { /* ignore */ }
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, [seenKey]);

    const markAllSeen = useCallback(() => {
        const allIds = leads.map(l => l.id);
        const merged = Array.from(new Set([...seenIds, ...allIds]));
        setSeenIds(merged);
        saveSeenState(seenKey, { ids: merged, updatedAt: new Date().toISOString() });
    }, [leads, seenIds, seenKey]);

    const markSeen = useCallback((leadId: string) => {
        if (seenIds.includes(leadId)) return;
        const updated = [...seenIds, leadId];
        setSeenIds(updated);
        saveSeenState(seenKey, { ids: updated, updatedAt: new Date().toISOString() });
    }, [seenIds, seenKey]);

    const unseenCount = leads.filter(l => !seenIds.includes(l.id)).length;

    return { unseenCount, leads, loading, markAllSeen, markSeen };
}

// ── Som de notificação sutil ─────────────────────────────────────────────
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch { /* silently ignore if audio not available */ }
}
