'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

const CHAVE_AVISO = 'manos_aviso_acessos_v1';
const INTERVALO_MS = 60_000;

function enviar(evento: 'heartbeat' | 'navegacao', rota: string) {
    try {
        void fetch('/api/acessos/ping', {
            method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evento, rota }),
        }).catch(() => {});
    } catch { /* sem rede: só não registra */ }
}

/**
 * Presença no CRM: um batimento por minuto com a aba visível + um registro a cada troca de tela
 * (só o caminho, nunca conteúdo). Mostra o aviso de transparência (LGPD) uma vez por navegador.
 * O servidor ignora quem é admin.
 */
export function PresencaTracker() {
    const pathname = usePathname() || '';
    const ultimaRota = useRef<string | null>(null);
    const [aviso, setAviso] = useState(false);

    useEffect(() => {
        try { if (!localStorage.getItem(CHAVE_AVISO)) setAviso(true); } catch { setAviso(true); }
    }, []);

    useEffect(() => {
        if (ultimaRota.current !== pathname) {
            ultimaRota.current = pathname;
            if (document.visibilityState === 'visible') enviar('navegacao', pathname);
        }
    }, [pathname]);

    useEffect(() => {
        const bate = () => { if (document.visibilityState === 'visible') enviar('heartbeat', ultimaRota.current || ''); };
        bate();
        const t = setInterval(bate, INTERVALO_MS);
        document.addEventListener('visibilitychange', bate);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', bate); };
    }, []);

    if (!aviso) return null;
    return (
        <div role="status" className="fixed bottom-3 left-3 right-3 md:left-auto md:right-4 md:max-w-sm z-[70] rounded-xl border border-white/15 bg-[#14141b] px-3 py-2.5 text-[12px] text-white/80 shadow-xl flex gap-2">
            <p className="flex-1">
                <b className="text-white">Aviso de transparência:</b> a Manos registra quando você entra e sai do CRM, por quanto tempo
                fica com ele aberto e as ações que faz (leads, conversas, etapas). Esses registros ficam só com a gestão.
            </p>
            <button type="button" aria-label="Entendi" onClick={() => { setAviso(false); try { localStorage.setItem(CHAVE_AVISO, '1'); } catch { /* ignora */ } }} className="shrink-0 h-7 w-7 grid place-items-center rounded-lg bg-white/10"><X size={14} /></button>
        </div>
    );
}
