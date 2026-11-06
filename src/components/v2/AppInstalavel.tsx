'use client';

// App instalável (PWA) — mesmo modelo do GarimpoCar.
//  - RegistrarApp: registra o service worker (só em produção) e guarda o
//    convite de instalação do Chrome (beforeinstallprompt), que chega cedo,
//    antes de qualquer tela pedir.
//  - BannerInstalarApp: "Instalar o app" no Android/Chrome; no iPhone, o passo
//    a passo do Safari (que não tem convite automático).

import { useEffect, useState, useSyncExternalStore } from 'react';
import { BellRing, Download, Loader2, Share, X } from 'lucide-react';

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

// ── Avisos no celular (web push) — 2ª etapa ──────────────────────────────────
// Aparece só quando: o servidor tem as chaves (GET /api/push/inscrever), o
// navegador aceita push, o service worker está ativo (produção) e — no iPhone —
// o app está instalado (o iOS só libera push no app da tela inicial).

type EstadoAvisos = 'carregando' | 'indisponivel' | 'desligado' | 'bloqueado' | 'ativando' | 'ligado' | 'erro';

const CHAVE_AVISOS_FECHADO = 'avisos_banner_fechado_em';

function chaveParaBytes(base64: string): Uint8Array {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const bruto = atob(b64);
    return Uint8Array.from(bruto, c => c.charCodeAt(0));
}

async function postar(url: string, body?: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) throw new Error(data?.error || `erro ${res.status}`);
    return data;
}

export function AtivarAvisos() {
    const [estado, setEstado] = useState<EstadoAvisos>('carregando');
    const [chave, setChave] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [fechado, setFechado] = useState(false);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const suporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
                const { instalado, ios } = detectar();
                if (!suporta || (ios && !instalado)) { if (vivo) setEstado('indisponivel'); return; }
                const reg = await navigator.serviceWorker.getRegistration();
                if (!reg) { if (vivo) setEstado('indisponivel'); return; }
                const res = await fetch('/api/push/inscrever', { cache: 'no-store' });
                const d = await res.json().catch(() => ({}));
                if (!d?.configurado || !d?.chavePublica) { if (vivo) setEstado('indisponivel'); return; }
                if (!vivo) return;
                setChave(d.chavePublica);
                if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }
                const atual = await reg.pushManager.getSubscription();
                if (atual) {
                    // Reata a inscrição ao login atual (celular trocado de vendedor).
                    postar('/api/push/inscrever', atual.toJSON()).catch(() => { /* tenta de novo na próxima abertura */ });
                    if (vivo) setEstado('ligado');
                    return;
                }
                try {
                    const t = Number(localStorage.getItem(CHAVE_AVISOS_FECHADO) || 0);
                    if (t && Date.now() - t < REAPARECE_DIAS * 86_400_000) setFechado(true);
                } catch { /* sem storage */ }
                if (vivo) setEstado('desligado');
            } catch {
                if (vivo) setEstado('indisponivel');
            }
        })();
        return () => { vivo = false; };
    }, []);

    const ativar = async () => {
        if (!chave) return;
        setEstado('ativando');
        setMsg(null);
        try {
            const permissao = await Notification.requestPermission();
            if (permissao !== 'granted') { setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado'); return; }
            const reg = await navigator.serviceWorker.ready;
            const inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) as BufferSource });
            await postar('/api/push/inscrever', inscricao.toJSON());
            await postar('/api/push/teste').catch(() => null);
            setEstado('ligado');
            setMsg('Pronto! Mandamos um aviso de teste para este celular.');
        } catch (e: any) {
            setEstado('erro');
            setMsg(`Não deu para ligar os avisos: ${e?.message || 'erro'}`);
        }
    };

    const fechar = () => {
        setFechado(true);
        try { localStorage.setItem(CHAVE_AVISOS_FECHADO, String(Date.now())); } catch { /* ignora */ }
    };

    if (estado === 'carregando' || estado === 'indisponivel') return null;
    if (estado === 'ligado') {
        return msg ? <p role="status" className="mb-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] font-bold text-emerald-100">{msg}</p> : null;
    }
    if (fechado && estado !== 'ativando' && estado !== 'erro') return null;

    return (
        <section className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex gap-3 items-start" aria-label="Avisos no celular">
            <div className="h-12 w-12 rounded-xl shrink-0 bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-300">
                <BellRing size={22} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black text-white leading-tight">Aviso no celular</p>
                {estado === 'bloqueado' ? (
                    <p className="text-[12px] text-white/60 mt-1 leading-snug">
                        Os avisos estão bloqueados. Libere as notificações do Manos CRM nas configurações do celular e abra o app de novo.
                    </p>
                ) : (
                    <>
                        <p className="text-[12px] text-white/55 mt-0.5">O CRM te chama quando um lead quente esperar ou tiver visita marcada.</p>
                        <button
                            type="button"
                            onClick={ativar}
                            disabled={estado === 'ativando'}
                            className="mt-3 min-h-[44px] px-4 rounded-xl bg-red-600 text-white text-[13px] font-black flex items-center gap-2 active:scale-95 disabled:opacity-60"
                        >
                            {estado === 'ativando' ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />} Ativar avisos
                        </button>
                        {msg && <p className="text-[12px] text-red-200 mt-2">{msg}</p>}
                    </>
                )}
            </div>
            <button type="button" onClick={fechar} aria-label="Agora não" className="h-10 w-10 -mr-2 -mt-2 shrink-0 rounded-xl flex items-center justify-center text-white/40 active:scale-95">
                <X size={18} />
            </button>
        </section>
    );
}
