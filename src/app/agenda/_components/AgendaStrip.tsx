'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, ArrowRight } from 'lucide-react';

/**
 * Faixa discreta de lembrete de visitas do dia. Some quando não há visita hoje.
 * Auto-contida (fetch próprio) pra não mexer no estado do Inbox.
 */
export default function AgendaStrip() {
    const [n, setN] = useState(0);

    useEffect(() => {
        let alive = true;
        fetch('/api/agenda?scope=me', { cache: 'no-store' })
            .then((r) => r.json())
            .then((j) => {
                if (!alive || !j.success) return;
                const hoje = new Date().toDateString();
                const count = (j.agendamentos || []).filter((a: any) =>
                    ['agendado', 'confirmado'].includes(a.status) && new Date(a.data_hora).toDateString() === hoje).length;
                setN(count);
            })
            .catch(() => { });
        return () => { alive = false; };
    }, []);

    if (n <= 0) return null;

    return (
        <a href="/agenda" className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-100 text-[13px] font-semibold hover:bg-red-500/15 transition-colors">
            <CalendarClock className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1">📅 Você tem {n} visita(s) hoje — abrir agenda</span>
            <ArrowRight className="w-4 h-4 text-red-400 shrink-0" />
        </a>
    );
}
