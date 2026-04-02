'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface NewLeadNotification {
    id: string;
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

function getSeenState(consultantId: string): SeenState {
    try {
        const raw = localStorage.getItem(`${SEEN_KEY_PREFIX}${consultantId}`);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { ids: [], updatedAt: new Date().toISOString() };
}

function saveSeenState(consultantId: string, state: SeenState) {
    localStorage.setItem(`${SEEN_KEY_PREFIX}${consultantId}`, JSON.stringify(state));
}

/**
 * Hook que monitora novos leads atribuídos ao consultor via Supabase Realtime.
 * Exibe notificação no sininho da sidebar.
 */
export function useNewLeadNotifications(role?: string | null): UseNewLeadNotificationsResult {
    const [leads, setLeads] = useState<NewLeadNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [seenIds, setSeenIds] = useState<string[]>([]);
    const prevLeadIdsRef = useRef<Set<string>>(new Set());

    // ── Resolve o ID do consultor logado ──────────────────────────────────
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
                    if (data?.id) {
                        setConsultantId(data.id);
                        const seen = getSeenState(data.id);
                        setSeenIds(seen.ids);
                    } else {
                        setLoading(false);
                    }
                });
        });
    }, []);

    // ── Busca leads novos recentes ───────────────────────────────────────
    const fetchLeads = useCallback(async (cid: string) => {
        const since = new Date();
        since.setHours(since.getHours() - FETCH_WINDOW_HOURS);

        let query = supabase
            .from('leads_manos_crm')
            .select('id, name, source, vehicle_interest, created_at')
            .in('status', ['new', 'received', 'entrada'])
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: false })
            .limit(20);

        // Admin vê todos, consultor vê só os seus
        if (role !== 'admin') {
            query = query.eq('assigned_consultant_id', cid);
        }

        const { data, error } = await query;

        if (!error && data) {
            const newLeads = data as NewLeadNotification[];

            // Detecta leads realmente novos para som/notificação
            const currentIds = new Set(newLeads.map(l => l.id));
            const prevIds = prevLeadIdsRef.current;
            if (prevIds.size > 0) {
                const brandNew = newLeads.filter(l => !prevIds.has(l.id));
                if (brandNew.length > 0) {
                    playNotificationSound();
                }
            }
            prevLeadIdsRef.current = currentIds;

            setLeads(newLeads);
        }
        setLoading(false);
    }, [role]);

    // ── Realtime: re-busca ao receber INSERT ─────────────────────────────
    useEffect(() => {
        if (!consultantId) return;

        fetchLeads(consultantId);

        const channelFilter = role === 'admin'
            ? { event: 'INSERT' as const, schema: 'public', table: 'leads_manos_crm' }
            : { event: 'INSERT' as const, schema: 'public', table: 'leads_manos_crm', filter: `assigned_consultant_id=eq.${consultantId}` };

        const channel = supabase
            .channel(`new-leads-${consultantId}`)
            .on('postgres_changes', channelFilter, () => fetchLeads(consultantId))
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [consultantId, fetchLeads]);

    // ── Sync localStorage entre abas ─────────────────────────────────────
    useEffect(() => {
        if (!consultantId) return;
        const key = `${SEEN_KEY_PREFIX}${consultantId}`;

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
    }, [consultantId]);

    // ── Marcar como visto ────────────────────────────────────────────────
    const markAllSeen = useCallback(() => {
        if (!consultantId) return;
        const allIds = leads.map(l => l.id);
        const merged = Array.from(new Set([...seenIds, ...allIds]));
        setSeenIds(merged);
        saveSeenState(consultantId, { ids: merged, updatedAt: new Date().toISOString() });
    }, [consultantId, leads, seenIds]);

    const markSeen = useCallback((leadId: string) => {
        if (!consultantId) return;
        if (seenIds.includes(leadId)) return;
        const updated = [...seenIds, leadId];
        setSeenIds(updated);
        saveSeenState(consultantId, { ids: updated, updatedAt: new Date().toISOString() });
    }, [consultantId, seenIds]);

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
