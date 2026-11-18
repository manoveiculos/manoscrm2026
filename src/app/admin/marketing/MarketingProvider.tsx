'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Megaphone, Play, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ExecuteModal } from './ExecuteModal';
import { Lightbox } from './Lightbox';
import { SquadDetailModal } from './SquadDetailModal';
import { ABAS, FeedData, KpiRow, RunRow, SquadKey, timeAgo } from './utils';

/**
 * Casca do /admin/marketing: cabeçalho, abas e os dados compartilhados por todas as abas
 * (feed, decisão de aprovação, janelas de histórico, de imagens e de execução manual).
 * Uma única busca + um único canal em tempo real, mesmo trocando de aba.
 */

interface Ctx {
    data: FeedData | null;
    loading: boolean;
    busyId: string | null;
    refetch: () => void;
    decide: (runId: string, action: 'approve' | 'reject') => Promise<void>;
    abrirSquad: (k: SquadKey) => void;
    abrirImagens: (l: { images: string[]; index: number; title: string }) => void;
    kpiBySquad: Partial<Record<SquadKey, KpiRow>>;
    ultimaPorSquad: Partial<Record<SquadKey, RunRow>>;
}

const MarketingCtx = createContext<Ctx | null>(null);

export function useMarketing(): Ctx {
    const c = useContext(MarketingCtx);
    if (!c) throw new Error('useMarketing precisa estar dentro do MarketingProvider');
    return c;
}

export function MarketingProvider({ children }: { children: ReactNode }) {
    const supabase = useMemo(() => createClient(), []);
    const pathname = usePathname();
    const [data, setData] = useState<FeedData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [showExecute, setShowExecute] = useState(false);
    const [selectedSquad, setSelectedSquad] = useState<SquadKey | null>(null);
    const [lightbox, setLightbox] = useState<{ images: string[]; index: number; title: string } | null>(null);
    const lastFetchRef = useRef(0);

    const fetchFeed = useCallback(async () => {
        const now = Date.now();
        if (now - lastFetchRef.current < 1500) return;
        lastFetchRef.current = now;
        try {
            const res = await fetch('/api/admin/marketing-feed', { cache: 'no-store' });
            if (!res.ok) return;
            setData(await res.json());
        } catch {
            // sem rede: mantém o que já está na tela
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();
        const t = setInterval(fetchFeed, 30000);
        return () => clearInterval(t);
    }, [fetchFeed]);

    useEffect(() => {
        const channel = supabase.channel('admin-marketing-feed');
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_agent_runs' }, () => fetchFeed());
        channel.subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, fetchFeed]);

    const decide = useCallback(async (runId: string, action: 'approve' | 'reject') => {
        setBusyId(runId);
        try {
            const res = await fetch('/api/admin/marketing-feed/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId, action }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || 'Erro ao registrar decisão.');
            }
            lastFetchRef.current = 0;
            await fetchFeed();
        } finally {
            setBusyId(null);
        }
    }, [fetchFeed]);

    const kpiBySquad = useMemo(() => {
        const m: Partial<Record<SquadKey, KpiRow>> = {};
        for (const row of data?.kpis || []) if (row?.squad) m[row.squad] = row;
        return m;
    }, [data]);

    // recentRuns vem do mais novo para o mais antigo.
    const ultimaPorSquad = useMemo(() => {
        const m: Partial<Record<SquadKey, RunRow>> = {};
        for (const r of data?.recentRuns || []) if (!m[r.squad]) m[r.squad] = r;
        return m;
    }, [data]);

    const totalRuns7d = (data?.kpis || []).reduce((s, k) => s + (k.runs_7d || 0), 0);

    const refetch = useCallback(() => { lastFetchRef.current = 0; void fetchFeed(); }, [fetchFeed]);

    const ctx: Ctx = {
        data, loading, busyId, refetch, decide, kpiBySquad, ultimaPorSquad,
        abrirSquad: setSelectedSquad,
        abrirImagens: setLightbox,
    };

    return (
        <MarketingCtx.Provider value={ctx}>
            <div className="min-h-screen bg-zinc-950 text-zinc-100">
                <div className="max-w-[1600px] mx-auto p-3 md:p-5">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                                <Megaphone className="w-7 h-7 text-red-500" />
                                Time de Marketing
                            </h1>
                            <p className="text-sm text-zinc-400 mt-1">
                                {totalRuns7d} execuções nos últimos 7 dias
                                {data?.generated_at && <span className="text-zinc-500"> · atualizado {timeAgo(data.generated_at)}</span>}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <button onClick={refetch} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors text-zinc-300">
                                <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                            </button>
                            <button onClick={() => setShowExecute(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors">
                                <Play className="w-3.5 h-3.5" /> Executar
                            </button>
                        </div>
                    </div>

                    <nav aria-label="Abas do Time de Marketing" className="flex gap-1 mb-5 overflow-x-auto border-b border-white/[0.08]">
                        {ABAS.map((a) => {
                            const ativa = a.href === '/admin/marketing' ? pathname === a.href : pathname === a.href || pathname.startsWith(`${a.href}/`);
                            return (
                                <Link
                                    key={a.id}
                                    href={a.href}
                                    aria-current={ativa ? 'page' : undefined}
                                    className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${ativa ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                                >
                                    {a.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {children}

                    {showExecute && <ExecuteModal onClose={() => setShowExecute(false)} onDone={refetch} />}
                    {selectedSquad && (
                        <SquadDetailModal
                            squad={selectedSquad}
                            busyId={busyId}
                            onClose={() => setSelectedSquad(null)}
                            onDecide={(runId, action) => decide(runId, action)}
                        />
                    )}
                    {lightbox && (
                        <Lightbox
                            images={lightbox.images}
                            index={lightbox.index}
                            title={lightbox.title}
                            onClose={() => setLightbox(null)}
                            onNavigate={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
                        />
                    )}
                </div>
            </div>
        </MarketingCtx.Provider>
    );
}
