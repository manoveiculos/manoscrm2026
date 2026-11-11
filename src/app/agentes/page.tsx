'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { CentralAgentes, ModoAgente } from '@/lib/agentes/estado';
import { CentralView } from './_components/CentralView';

/**
 * CENTRAL DOS AGENTES — todos os agentes trabalhando, com o Alexandre no meio.
 * Só admin. Dados: GET /api/agentes (registros reais; nada simulado).
 *
 * Tempo real: Realtime (postgres_changes) nas tabelas dos agentes dispara uma
 * nova leitura na hora; além disso a tela consulta a cada 10 s (várias dessas
 * tabelas ainda não estão na publicação do Realtime).
 */

const TABELAS_REALTIME = [
    'wa_mensagens', 'wa_ia_execucoes', 'marketing_agent_runs', 'consultant_active_chats',
    'cowork_alerts', 'wa_conversas', 'lead_distribuicao', 'cron_heartbeats', 'agentes_config',
];
const INTERVALO_MS = 10_000;

async function postar(url: string, body: unknown) {
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json().catch(() => ({}));
        return res.ok && d?.success !== false ? { ok: true } : { ok: false, error: d?.error || `erro ${res.status}` };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'sem conexão' };
    }
}

export default function CentralDosAgentesPage() {
    const supabase = useMemo(() => createClient(), []);
    const [dados, setDados] = useState<CentralAgentes | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [negado, setNegado] = useState(false);
    const [falhou, setFalhou] = useState(false);
    const [agora, setAgora] = useState(() => Date.now());
    const emCurso = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const carregar = useCallback(async () => {
        if (emCurso.current) return;
        emCurso.current = true;
        try {
            const res = await fetch('/api/agentes', { cache: 'no-store' });
            if (res.status === 403) { setNegado(true); return; }
            const d = await res.json().catch(() => ({}));
            if (!res.ok || !d?.success) throw new Error(d?.error || `erro ${res.status}`);
            setDados(d as CentralAgentes);
            setErro(null);
            setFalhou(false);
            setAgora(Date.now());
        } catch (e: any) {
            setFalhou(true);
            setErro(e?.message || 'erro');
        } finally {
            emCurso.current = false;
        }
    }, []);

    // Leitura inicial + a cada 10 s (só com a aba visível).
    useEffect(() => {
        carregar();
        const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, INTERVALO_MS);
        const vis = () => { if (document.visibilityState === 'visible') carregar(); };
        document.addEventListener('visibilitychange', vis);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
    }, [carregar]);

    // Realtime: qualquer mudança nas tabelas dos agentes → nova leitura em 1 s.
    // Um canal POR TABELA: se o Realtime recusar uma (ex.: agentes_config antes da
    // migration, ou tabela fora da publicação), as outras seguem funcionando — e a
    // consulta a cada 10 s cobre qualquer falha.
    useEffect(() => {
        if (negado) return;
        const agendar = () => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(carregar, 1000);
        };
        const canais = TABELAS_REALTIME.map(table => {
            const canal = supabase.channel(`central-agentes-${table}`);
            canal.on('postgres_changes' as any, { event: '*', schema: 'public', table }, agendar);
            canal.subscribe();
            return canal;
        });
        return () => {
            if (timer.current) clearTimeout(timer.current);
            canais.forEach(c => supabase.removeChannel(c));
        };
    }, [supabase, carregar, negado]);

    const onModo = useCallback(async (agenteId: string, modo: ModoAgente) => {
        const r = await postar('/api/agentes/config', { agente_id: agenteId, modo });
        if (r.ok) carregar();
        return r;
    }, [carregar]);

    const onDecidir = useCallback(async (runId: string, acao: 'approve' | 'reject', motivo?: string) => {
        const r = await postar('/api/admin/marketing-feed/approve', { runId, action: acao, reason: motivo });
        if (r.ok) carregar();
        return r;
    }, [carregar]);

    if (negado) {
        return (
            <div className="w-full max-w-md mx-auto mt-16 rounded-2xl border border-white/10 bg-[#0F0F14] p-6 text-center">
                <ShieldAlert className="mx-auto text-red-400 mb-3" />
                <p className="text-white font-black">Só o admin vê a Central dos Agentes.</p>
            </div>
        );
    }
    if (!dados) {
        return (
            <div className="w-full flex flex-col items-center justify-center gap-3 mt-24 text-white/50">
                {erro ? <p className="text-red-300 text-sm">Não consegui carregar: {erro}</p> : <Loader2 className="animate-spin" />}
            </div>
        );
    }
    return (
        <div className="w-full">
            <CentralView dados={dados} conexao={falhou ? 'reconectando' : 'ao_vivo'} agora={agora} onModo={onModo} onDecidir={onDecidir} />
        </div>
    );
}
