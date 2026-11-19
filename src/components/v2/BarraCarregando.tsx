'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Avisa que o CRM está carregando quando uma tela demora para abrir.
 * Clicou num link interno → aparece uma barra no topo na hora; se passar de 0,7 s, aparece também
 * "Carregando…". Some sozinha quando a tela nova abre (o endereço muda) ou, no máximo, em 15 s.
 */
export function BarraCarregando() {
    const pathname = usePathname();
    // Endereço em que o clique aconteceu. Enquanto o endereço atual for o mesmo, a tela nova ainda não abriu.
    const [clicouEm, setClicouEm] = useState<string | null>(null);
    const [demorou, setDemorou] = useState(false);
    // Abriu uma tela nova (inclusive pelo botão "voltar" do navegador): zera o aviso. Atualizar o estado durante a
    // renderização, comparando com o endereço anterior, é o padrão do React para isso (sem efeito em cascata).
    const [anterior, setAnterior] = useState(pathname);
    if (anterior !== pathname) { setAnterior(pathname); setClicouEm(null); setDemorou(false); }
    const ativo = clicouEm !== null && clicouEm === pathname;

    useEffect(() => {
        const aoClicar = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = (e.target as HTMLElement | null)?.closest?.('a');
            if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
            const href = a.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            let url: URL;
            try { url = new URL(a.href, window.location.href); } catch { return; }
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname) return;   // mesma tela (só muda parâmetro): não é carregamento
            setDemorou(false);
            setClicouEm(window.location.pathname);
        };
        document.addEventListener('click', aoClicar, true);
        return () => document.removeEventListener('click', aoClicar, true);
    }, []);

    // "Carregando…" só se demorar; trava de segurança de 15 s (se a navegação nunca terminar, a barra não fica presa)
    useEffect(() => {
        if (!ativo) return;
        const t1 = setTimeout(() => setDemorou(true), 700);
        const t2 = setTimeout(() => setClicouEm(null), 15_000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [ativo]);

    if (!ativo) return null;
    return (
        <>
            <div className="fixed top-0 left-0 right-0 h-[3px] z-[300] overflow-hidden bg-red-950/40" role="progressbar" aria-label="Carregando">
                <div className="h-full w-1/3 bg-red-500 animate-[barra-carregando_1.1s_ease-in-out_infinite]" />
            </div>
            {demorou && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 rounded-full bg-zinc-900/95 border border-white/10 px-4 py-2 text-xs font-semibold text-white shadow-lg" role="status">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" /> Carregando…
                </div>
            )}
            <style>{`@keyframes barra-carregando { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
        </>
    );
}
