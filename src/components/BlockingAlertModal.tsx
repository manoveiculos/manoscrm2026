'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * Modal bloqueante global. Inscreve em cowork_alerts via Supabase Realtime
 * e mostra alertas críticos (priority=1, blocking=true) destinados ao
 * vendedor logado. NÃO fecha sem ação — o vendedor precisa responder
 * o lead OU transferir.
 *
 * Renderizado pelo layout raiz para ser inescapável.
 */

interface Alert {
    id: string;
    title: string;
    message: string;
    lead_id: string | null;
    priority: number;
    blocking: boolean;
    acknowledged: boolean;
}

export default function BlockingAlertModal() {
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [alert, setAlert] = useState<Alert | null>(null);
    const [busy, setBusy] = useState(false);

    // Resolve consultor logado uma vez
    useEffect(() => {
        let alive = true;
        async function init() {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth?.user) return;
            const { data: cons } = await supabase
                .from('consultants_manos_crm')
                .select('id')
                .eq('user_id', auth.user.id)
                .maybeSingle();
            if (alive && cons?.id) setConsultantId(cons.id);
        }
        init();
        return () => { alive = false; };
    }, [supabase]);

    // Subscribe + initial fetch dos alertas críticos pendentes
    useEffect(() => {
        if (!consultantId) return;
        let alive = true;

        async function loadOpen() {
            const { data } = await supabase
                .from('cowork_alerts')
                .select('id, title, message, lead_id, priority, blocking, acknowledged')
                .eq('assigned_consultant_id', consultantId)
                .eq('blocking', true)
                .eq('acknowledged', false)
                .lte('priority', 2)
                .order('created_at', { ascending: false })
                .limit(1);
            if (alive && data?.[0]) setAlert(data[0] as Alert);
        }

        loadOpen();

        const channel = supabase
            .channel(`blocking-alerts-${consultantId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'cowork_alerts',
                    filter: `assigned_consultant_id=eq.${consultantId}`,
                },
                (payload: any) => {
                    const a = payload.new as Alert;
                    if (a?.blocking && !a.acknowledged && a.priority <= 2) {
                        setAlert(a);
                    }
                }
            )
            .subscribe();

        return () => {
            alive = false;
            supabase.removeChannel(channel);
        };
    }, [consultantId, supabase]);

    async function acknowledge(action: 'will_respond' | 'transfer') {
        if (!alert) return;
        setBusy(true);
        try {
            await fetch('/api/alerts/acknowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alert_id: alert.id, action }),
            });
            const target = alert.lead_id;
            setAlert(null);
            if (action === 'will_respond' && target) {
                router.push(`/lead/${target}`);
            }
        } finally {
            setBusy(false);
        }
    }

    if (!alert) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border-2 border-red-600 rounded-lg max-w-md w-full p-6 shadow-2xl animate-pulse-once">
                <div className="flex items-center gap-2 text-red-500 mb-3">
                    <AlertTriangle className="w-6 h-6" />
                    <span className="font-bold uppercase text-sm tracking-wider">Atenção urgente</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{alert.title}</h2>
                <p className="text-gray-300 text-sm mb-6 whitespace-pre-line">{alert.message}</p>

                <div className="space-y-2">
                    <button
                        disabled={busy}
                        onClick={() => acknowledge('will_respond')}
                        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white py-3 rounded-lg font-bold"
                    >
                        Vou responder agora
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => acknowledge('transfer')}
                        className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:bg-gray-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                    >
                        <ArrowRightLeft className="w-4 h-4" /> Transferir pra outro vendedor
                    </button>
                </div>

                <p className="text-[11px] text-gray-500 text-center mt-4">
                    Este alerta não fecha até você tomar uma ação. Suas vendas dependem disso.
                </p>
            </div>
        </div>
    );
}
