'use client';

// App instalável (PWA) — mesmo modelo do GarimpoCar.
//  - RegistrarApp: registra o service worker (só em produção) e guarda o
//    convite de instalação do Chrome (beforeinstallprompt), que chega cedo,
//    antes de qualquer tela pedir.
//  - BannerInstalarApp: "Instalar o app" no Android/Chrome; no iPhone, o passo
//    a passo do Safari (que não tem convite automático).

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share, X } from 'lucide-react';

interface ConviteInstalacao extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ── Estado global do convite (fora do React: o evento chega antes das telas) ──
let convite: ConviteInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(f => f());
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

export function RegistrarApp() {
    useEffect(() => {
        const aoConvite = (e: Event) => {
            e.preventDefault(); // nós mostramos o botão no lugar certo (Minha Fila)
            convite = e as ConviteInstalacao;
            avisar();
        };
        const aoInstalar = () => { convite = null; avisar(); };
        window.addEventListener('beforeinstallprompt', aoConvite);
        window.addEventListener('appinstalled', aoInstalar);

        // Em desenvolvimento o service worker atrapalha o recarregamento do código.
        if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/', updateViaCache: 'none' })
                .catch((err) => console.warn('[app] service worker não registrou:', err?.message));
        }
        return () => {
            window.removeEventListener('beforeinstallprompt', aoConvite);
            window.removeEventListener('appinstalled', aoInstalar);
        };
    }, []);
    return null;
}

type Plataforma = 'android' | 'ios' | null;

function detectar(): { instalado: boolean; ios: boolean } {
    if (typeof window === 'undefined') return { instalado: false, ios: false };
    const instalado = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    return { instalado, ios };
}

export function useInstalarApp() {
    const temConvite = useSyncExternalStore(assinar, () => convite !== null, () => false);
    const [ambiente, setAmbiente] = useState({ instalado: false, ios: false });
    useEffect(() => { setAmbiente(detectar()); }, []);

    const plataforma: Plataforma = ambiente.instalado ? null : temConvite ? 'android' : ambiente.ios ? 'ios' : null;
    const instalar = async () => {
        if (!convite) return false;
        await convite.prompt();
        const { outcome } = await convite.userChoice;
        convite = null;
        avisar();
        return outcome === 'accepted';
    };
    return { plataforma, instalado: ambiente.instalado, instalar };
}

const CHAVE_FECHADO = 'app_banner_fechado_em';
const REAPARECE_DIAS = 7;

/** Convite para instalar o app. Some quando instalado ou fechado (volta em 7 dias). */
export function BannerInstalarApp({ forcar }: { forcar?: Plataforma } = {}) {
    const { plataforma: detectada, instalar } = useInstalarApp();
    const plataforma = forcar ?? detectada;
    const [fechado, setFechado] = useState(true);

    useEffect(() => {
        if (forcar) { setFechado(false); return; }
        try {
            const t = Number(localStorage.getItem(CHAVE_FECHADO) || 0);
            setFechado(!!t && Date.now() - t < REAPARECE_DIAS * 86_400_000);
        } catch { setFechado(false); }
    }, [forcar]);

    if (!plataforma || fechado) return null;

    const fechar = () => {
        setFechado(true);
        try { localStorage.setItem(CHAVE_FECHADO, String(Date.now())); } catch { /* sem storage: só some agora */ }
    };

    return (
        <section className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex gap-3 items-start" aria-label="Instalar o app">
            <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black text-white leading-tight">Manos CRM no seu celular</p>
                {plataforma === 'android' ? (
                    <>
                        <p className="text-[12px] text-white/55 mt-0.5">Abre direto na Minha Fila, em tela cheia, sem procurar o site.</p>
                        <button
                            type="button"
                            onClick={async () => { if (await instalar()) fechar(); }}
                            className="mt-3 min-h-[44px] px-4 rounded-xl bg-red-600 text-white text-[13px] font-black flex items-center gap-2 active:scale-95"
                        >
                            <Download size={16} /> Instalar o app
                        </button>
                    </>
                ) : (
                    <p className="text-[12px] text-white/60 mt-1 leading-snug">
                        No Safari, toque em <Share size={13} className="inline -mt-0.5" aria-label="Compartilhar" /> <b className="text-white/85">Compartilhar</b> e
                        depois em <b className="text-white/85">Adicionar à Tela de Início</b>.
                    </p>
                )}
            </div>
            <button type="button" onClick={fechar} aria-label="Agora não" className="h-10 w-10 -mr-2 -mt-2 shrink-0 rounded-xl flex items-center justify-center text-white/40 active:scale-95">
                <X size={18} />
            </button>
        </section>
    );
}
