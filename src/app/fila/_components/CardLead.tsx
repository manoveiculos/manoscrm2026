'use client';

import Link from 'next/link';
import { CalendarPlus, Car, Flag, MessageCircle, Phone, Undo2 } from 'lucide-react';
import { SeloQualificacao } from '@/components/qualificacao/SeloQualificacao';
import { tempoDesde, type CardFila } from '@/lib/fila/montarFila';

export interface Pendente {
    rotulo: string;
    ate: number;
    erro?: string | null;
}

const COR_MOTIVO: Record<CardFila['secao'], string> = {
    quente_sem_resposta: 'bg-red-600/20 text-red-200 border-red-500/40',
    visitas: 'bg-purple-600/20 text-purple-200 border-purple-500/40',
    cliente_voltou: 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40',
    followup_vencido: 'bg-amber-600/20 text-amber-200 border-amber-500/40',
    em_conversa: 'bg-white/[0.06] text-white/70 border-white/10',
    recuperavel: 'bg-emerald-600/20 text-emerald-200 border-emerald-500/40',
    em_aberto: 'bg-white/[0.06] text-white/60 border-white/10',
};

/** Número para o discador: só dígitos, com DDI 55 quando faltar. */
export function telParaDiscar(tel: string | null | undefined): string | null {
    const d = String(tel || '').split('@')[0].replace(/\D/g, '');
    if (d.length < 10) return null;
    return d.startsWith('55') && d.length >= 12 ? `+${d}` : `+55${d}`;
}

/** "(47) 99999-8888" para exibir (número completo — decisão 3 do Alexandre). */
export function telFormatado(tel: string | null | undefined): string | null {
    let d = String(tel || '').split('@')[0].replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d || null;
}

export function CardLead({ card, agora, relogio, pendente, destacado, onLigar, onAgendar, onResultado, onDesfazer }: {
    card: CardFila;
    /** Relógio de exibição ("há 32 min"). */
    agora: number;
    /** Tempo real, para a contagem do "Desfazer". */
    relogio: number;
    pendente: Pendente | null;
    destacado?: boolean;
    onLigar: (c: CardFila) => void;
    onAgendar: (c: CardFila) => void;
    onResultado: (c: CardFila) => void;
    onDesfazer: (c: CardFila) => void;
}) {
    const tel = telParaDiscar(card.telefone);
    const msg = card.ultimaMensagem;
    // Abre a conversa do WhatsApp da loja; sem conversa, a tela leva ao perfil do lead.
    const hrefConversa = card.uid ? `/conversas?lead=${encodeURIComponent(card.uid)}` : '/agenda';
    const restante = pendente ? Math.max(0, Math.ceil((pendente.ate - relogio) / 1000)) : 0;

    return (
        <article
            id={card.uid ? `card-${card.uid}` : undefined}
            className={`relative rounded-2xl border bg-[#0F0F14] p-4 transition ${destacado ? 'border-red-500/60 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]' : 'border-white/[0.08]'}`}
        >
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-[15px] font-black text-white leading-tight truncate">{card.nome}</h3>
                    <p className="text-[12px] text-white/55 mt-0.5 flex items-center gap-1.5 min-w-0">
                        <Car size={12} className="shrink-0" />
                        <span className="truncate">{card.carro || 'Carro não informado'}</span>
                    </p>
                    {card.telefone && <p className="text-[12px] text-white/45 mt-0.5 tabular-nums">{telFormatado(card.telefone)}</p>}
                </div>
                {card.selo && <SeloQualificacao selo={card.selo} motivo={card.seloMotivo || undefined} compact />}
            </header>

            <p className={`mt-3 inline-flex max-w-full items-center rounded-xl border px-2.5 py-1 text-[11px] font-bold leading-snug ${COR_MOTIVO[card.secao]}`}>
                <span className="line-clamp-2">{card.motivo}</span>
            </p>

            {card.carroCompativel && (
                <p className="mt-2 text-[12px] text-emerald-200/90">
                    <span className="font-bold">No estoque:</span> {card.carroCompativel}
                </p>
            )}

            <div className="mt-3 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2">
                {msg ? (
                    <>
                        <p className="text-[12px] text-white/75 leading-snug line-clamp-2">
                            <span className={`font-bold ${msg.autor === 'cliente' ? 'text-white' : 'text-violet-300'}`}>
                                {msg.autor === 'cliente' ? 'Cliente' : 'Laura (IA)'}:
                            </span>{' '}
                            {msg.texto}
                        </p>
                        <p className="text-[10px] text-white/35 mt-1">há {tempoDesde(msg.em, agora)}</p>
                    </>
                ) : (
                    <p className="text-[12px] text-white/35">Sem conversa registrada no CRM.</p>
                )}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
                <Link
                    href={hrefConversa}
                    className="min-h-[56px] rounded-xl bg-white/[0.05] border border-white/[0.08] flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-white/80 active:scale-95 transition"
                >
                    <MessageCircle size={18} />
                    {card.uid ? 'Conversa' : 'Agenda'}
                </Link>
                {tel ? (
                    <a
                        href={`tel:${tel}`}
                        onClick={() => onLigar(card)}
                        className="min-h-[56px] rounded-xl bg-white/[0.05] border border-white/[0.08] flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-white/80 active:scale-95 transition"
                    >
                        <Phone size={18} />
                        Ligar
                    </a>
                ) : (
                    <span className="min-h-[56px] rounded-xl border border-white/[0.05] flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-white/25" aria-disabled="true" title="Telefone não consta">
                        <Phone size={18} />
                        Ligar
                    </span>
                )}
                <button
                    type="button"
                    onClick={() => onAgendar(card)}
                    disabled={!card.uid}
                    className="min-h-[56px] rounded-xl bg-white/[0.05] border border-white/[0.08] flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-white/80 active:scale-95 transition disabled:opacity-25"
                >
                    <CalendarPlus size={18} />
                    Agendar
                </button>
                <button
                    type="button"
                    onClick={() => onResultado(card)}
                    disabled={!card.podeResultado}
                    className="min-h-[56px] rounded-xl bg-red-600 flex flex-col items-center justify-center gap-1 text-[11px] font-black text-white active:scale-95 transition disabled:opacity-25 disabled:bg-white/[0.05]"
                >
                    <Flag size={18} />
                    Resultado
                </button>
            </div>

            {pendente && (
                <div className="absolute inset-0 rounded-2xl bg-[#0F0F14]/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 px-6 text-center">
                    {pendente.erro ? (
                        <>
                            <p className="text-sm font-bold text-red-300">Não foi gravado: {pendente.erro}</p>
                            <button type="button" onClick={() => onDesfazer(card)} className="min-h-[48px] px-5 rounded-xl border border-white/15 text-sm font-bold text-white">
                                Fechar
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-black text-white">{pendente.rotulo}</p>
                            <p className="text-[11px] text-white/50">{restante > 0 ? `Grava em ${restante} s` : 'Gravando…'}</p>
                            {restante > 0 && (
                                <button type="button" onClick={() => onDesfazer(card)} className="min-h-[48px] px-6 rounded-xl bg-white text-black text-sm font-black flex items-center gap-2 active:scale-95">
                                    <Undo2 size={16} /> Desfazer
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </article>
    );
}
