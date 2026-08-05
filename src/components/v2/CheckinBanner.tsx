'use client';

import { useEffect, useState } from 'react';

/**
 * Banner de check-in diário. Só quem faz check-in entra na roleta de distribuição
 * (motor round-robin + SLA). Sem check-in, o vendedor não recebe leads.
 */
export function CheckinBanner() {
    const [disponivel, setDisponivel] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const r = await fetch('/api/lead/checkin', { cache: 'no-store' });
            const j = await r.json();
            if (j?.success) setDisponivel(!!j.disponivel);
        } catch { /* ignora */ }
    };
    useEffect(() => { load(); }, []);

    const toggle = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const r = await fetch('/api/lead/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disponivel: !disponivel }),
            });
            const j = await r.json();
            if (j?.success) setDisponivel(!!j.disponivel);
        } catch { /* ignora */ } finally { setSaving(false); }
    };

    if (disponivel === null) return null; // ainda carregando / não é vendedor

    return (
        <div className={`mb-3 rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 ${disponivel ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/30'}`}>
            <div className="min-w-0">
                <div className={`text-[13px] font-black ${disponivel ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {disponivel ? '✅ Você está disponível hoje' : '⚠️ Você não fez check-in hoje'}
                </div>
                <div className="text-[11px] text-white/40 mt-0.5">
                    {disponivel ? 'Você está na roleta e vai receber leads.' : 'Sem check-in você NÃO recebe leads novos. Faça o check-in ao começar o dia.'}
                </div>
            </div>
            <button
                onClick={toggle}
                disabled={saving}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-all disabled:opacity-50 ${disponivel ? 'bg-white/5 text-white/60 hover:bg-white/10' : 'bg-emerald-500 text-black hover:bg-emerald-400'}`}
            >
                {saving ? '...' : disponivel ? 'Encerrar dia' : 'Fazer check-in'}
            </button>
        </div>
    );
}
