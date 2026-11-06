'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, ImageOff, MapPin, Mic, Pause, Play, UserRound, X } from 'lucide-react';
import {
    formatarBytes, formatarDuracao, telefoneExibicao, telefoneKeyDe,
    type MensagemView,
} from '@/lib/whatsapp/conversasView';

export type UrlMidia = (mensagemId: string, download?: boolean) => string;

export const urlMidiaPadrao: UrlMidia = (id, download) => `/api/wa/midia/${id}${download ? '?download=1' : ''}`;

/** Mídia que já saiu do bucket (30 dias) ou nunca chegou. */
export function MidiaIndisponivel({ m }: { m: MensagemView }) {
    const texto = m.midiaExpirada
        ? 'Mídia expirada (30 dias)'
        : m.midiaErro === 'acima_do_limite'
            ? 'Arquivo grande demais: não foi guardado'
            : 'Mídia ainda não disponível';
    return (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-white/55">
            <ImageOff size={14} className="shrink-0" /> {texto}
            {m.midiaBytes ? <span className="text-white/35">· {formatarBytes(m.midiaBytes)}</span> : null}
        </div>
    );
}

export function MidiaImagem({ m, url, figurinha = false }: { m: MensagemView; url: UrlMidia; figurinha?: boolean }) {
    const [aberta, setAberta] = useState(false);
    const [falhou, setFalhou] = useState(false);
    if (!m.temMidia || falhou) return <MidiaIndisponivel m={falhou ? { ...m, temMidia: false } : m} />;
    const src = url(m.id);
    return (
        <>
            <button
                type="button"
                onClick={() => !figurinha && setAberta(true)}
                // espaço reservado antes de a foto carregar: a conversa não "pula" e continua no fim
                className={`block overflow-hidden rounded-xl bg-black/30 ${figurinha ? 'w-28 h-28' : 'w-[260px] max-w-full aspect-[4/3]'}`}
                aria-label={figurinha ? 'Figurinha' : 'Ampliar foto'}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt={m.legenda || (figurinha ? 'Figurinha' : 'Foto enviada pelo cliente')}
                    loading="lazy"
                    onError={() => setFalhou(true)}
                    className={figurinha ? 'w-full h-full object-contain' : 'w-full h-full object-cover'}
                />
            </button>
            {aberta && <Lightbox src={src} legenda={m.legenda} onFechar={() => setAberta(false)} />}
        </>
    );
}

function Lightbox({ src, legenda, onFechar }: { src: string; legenda: string | null; onFechar: () => void }) {
    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onFechar]);
    return (
        <div className="fixed inset-0 z-[130] bg-black/95 flex flex-col" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={onFechar}>
            <div className="flex justify-end p-3">
                <button type="button" onClick={onFechar} aria-label="Fechar" className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center text-white">
                    <X size={20} />
                </button>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center px-3" onClick={(e) => e.stopPropagation()}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={legenda || 'Foto'} className="max-h-full max-w-full object-contain" />
            </div>
            {legenda && <p className="p-4 text-center text-sm text-white/80">{legenda}</p>}
        </div>
    );
}

const VELOCIDADES = [1, 1.5, 2];

export function MidiaAudio({ m, url }: { m: MensagemView; url: UrlMidia }) {
    const ref = useRef<HTMLAudioElement | null>(null);
    const [tocando, setTocando] = useState(false);
    const [velocidade, setVelocidade] = useState(1);
    const [posicao, setPosicao] = useState(0);
    const [duracao, setDuracao] = useState<number | null>(m.duracaoS);
    const [naoToca, setNaoToca] = useState(false);

    useEffect(() => { if (ref.current) ref.current.playbackRate = velocidade; }, [velocidade]);

    // play() precisa sair do próprio toque (Safari no iPhone). preload="none":
    // o arquivo só é pedido — e o acesso só vai para o log — quando a pessoa toca.
    const alternar = () => {
        const a = ref.current;
        if (!a) return;
        if (a.paused) {
            a.playbackRate = velocidade;
            a.play().catch((e: unknown) => {
                if ((e as { name?: string })?.name !== 'AbortError') setNaoToca(true);
            });
        } else {
            a.pause();
        }
    };

    const total = duracao || 0;
    return (
        <div className="w-full max-w-[300px] space-y-2">
            {m.temMidia ? (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={alternar}
                        aria-label={tocando ? 'Pausar áudio' : 'Ouvir áudio'}
                        className="h-11 w-11 shrink-0 rounded-full bg-white text-black flex items-center justify-center active:scale-95"
                    >
                        {tocando ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                            <div className="h-full bg-white/70" style={{ width: total ? `${Math.min(100, (posicao / total) * 100)}%` : '0%' }} />
                        </div>
                        <p className="mt-1 text-[11px] text-white/50 tabular-nums">
                            {formatarDuracao(posicao)} / {formatarDuracao(total) || '–:––'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setVelocidade(v => VELOCIDADES[(VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length])}
                        aria-label="Velocidade do áudio"
                        className="h-9 min-w-[44px] shrink-0 rounded-lg bg-white/10 px-2 text-[12px] font-black text-white"
                    >
                        {String(velocidade).replace('.', ',')}×
                    </button>
                    <audio
                        ref={ref}
                        src={url(m.id)}
                        preload="none"
                        onPlay={() => setTocando(true)}
                        onPause={() => setTocando(false)}
                        onEnded={() => { setTocando(false); setPosicao(0); }}
                        onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)}
                        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuracao(e.currentTarget.duration); }}
                        onError={() => setNaoToca(true)}
                    />
                </div>
            ) : (
                <MidiaIndisponivel m={m} />
            )}
            {naoToca && m.temMidia && (
                <p className="text-[11px] text-amber-200/80">
                    Este aparelho não tocou o áudio do WhatsApp.{' '}
                    <a href={url(m.id, true)} className="underline">Baixar o áudio</a>
                    {m.transcricao ? ' ou leia a transcrição abaixo.' : '.'}
                </p>
            )}
            {m.transcricao ? (
                <div className="rounded-xl bg-black/25 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-white/40 flex items-center gap-1 mb-0.5">
                        <Mic size={11} /> Transcrição
                    </p>
                    <p className="text-[13px] text-white/90 whitespace-pre-wrap break-words">{m.transcricao}</p>
                    {m.analiseAudio?.objecao && (
                        <p className="mt-1 text-[11px] text-amber-200/80">Objeção: {m.analiseAudio.objecao}</p>
                    )}
                </div>
            ) : (
                <p className="text-[11px] text-white/40">{m.midiaExpirada ? 'Sem transcrição.' : 'Transcrição em andamento…'}</p>
            )}
        </div>
    );
}

export function MidiaVideo({ m, url }: { m: MensagemView; url: UrlMidia }) {
    const [pedido, setPedido] = useState(false);
    if (!m.temMidia) return <MidiaIndisponivel m={m} />;
    if (!pedido) {
        return (
            <button
                type="button"
                onClick={() => setPedido(true)}
                className="w-full max-w-[280px] aspect-video rounded-xl bg-black/40 border border-white/10 flex flex-col items-center justify-center gap-1 text-white/80"
            >
                <Play size={28} />
                <span className="text-[12px]">Ver vídeo{m.duracaoS ? ` · ${formatarDuracao(m.duracaoS)}` : ''}{m.midiaBytes ? ` · ${formatarBytes(m.midiaBytes)}` : ''}</span>
            </button>
        );
    }
    return <video src={url(m.id)} controls autoPlay playsInline className="w-full max-w-[280px] rounded-xl bg-black" />;
}

export function MidiaDocumento({ m, url }: { m: MensagemView; url: UrlMidia }) {
    const nome = m.midiaNome || 'Documento';
    return (
        <div className="w-full max-w-[300px] rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
                <FileText size={22} className="shrink-0 text-white/70" />
                <div className="min-w-0">
                    <p className="text-[13px] font-bold text-white truncate">{nome}</p>
                    <p className="text-[11px] text-white/45">{[m.midiaMime?.split('/')[1]?.toUpperCase(), formatarBytes(m.midiaBytes)].filter(Boolean).join(' · ')}</p>
                </div>
            </div>
            {m.temMidia ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <a href={url(m.id)} target="_blank" rel="noopener noreferrer" className="min-h-[40px] rounded-lg bg-white/10 flex items-center justify-center text-[12px] font-bold text-white">Abrir</a>
                    <a href={url(m.id, true)} className="min-h-[40px] rounded-lg bg-white/10 flex items-center justify-center gap-1 text-[12px] font-bold text-white"><Download size={14} /> Baixar</a>
                </div>
            ) : (
                <div className="mt-2"><MidiaIndisponivel m={m} /></div>
            )}
        </div>
    );
}

export function Localizacao({ m }: { m: MensagemView }) {
    const l = m.localizacao;
    const link = l?.lat != null && l?.lng != null ? `https://www.google.com/maps?q=${l.lat},${l.lng}` : null;
    return (
        <div className="flex items-start gap-2">
            <MapPin size={18} className="shrink-0 mt-0.5 text-red-300" />
            <div className="min-w-0">
                <p className="text-[13px] text-white">{l?.nome || 'Localização'}</p>
                {l?.endereco && <p className="text-[12px] text-white/55">{l.endereco}</p>}
                {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-sky-300 underline">Abrir no mapa</a>}
            </div>
        </div>
    );
}

export function Contatos({ m }: { m: MensagemView }) {
    const lista = m.contatos?.length ? m.contatos : [{ nome: m.texto, telefones: [] as string[] }];
    return (
        <div className="space-y-2">
            {lista.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                    <UserRound size={18} className="shrink-0 mt-0.5 text-white/70" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-white">{c.nome || 'Contato'}</p>
                        {c.telefones.map(t => (
                            <a key={t} href={`tel:+${t}`} className="block text-[12px] text-sky-300 underline">{telefoneExibicao(telefoneKeyDe(t))}</a>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
