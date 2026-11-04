'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, PhoneCall } from 'lucide-react';
import type { CardFila } from '@/lib/fila/montarFila';
import { Sheet } from './Sheet';

type Modo = 'retorno' | 'visita';

interface Atalho { rotulo: string; quando: Date }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Dia útil a partir de `base` + `dias` (domingo pula para segunda). */
function diaUtil(base: Date, dias: number, hora: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + dias);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    d.setHours(hora, 0, 0, 0);
    return d;
}

function rotuloDia(d: Date, agora: Date): string {
    const dif = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(agora).setHours(0, 0, 0, 0)) / 86_400_000);
    const h = `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
    if (dif === 0) return `Hoje ${h}`;
    if (dif === 1) return `Amanhã ${h}`;
    return `${DIAS[d.getDay()]} ${h}`;
}

export function atalhosRetorno(agora: Date): Atalho[] {
    const lista: Atalho[] = [];
    const em2h = new Date(agora.getTime() + 2 * 3_600_000);
    em2h.setMinutes(em2h.getMinutes() < 30 ? 0 : 30, 0, 0);
    lista.push({ rotulo: 'Em 2 horas', quando: em2h });
    const amanha9 = diaUtil(agora, 1, 9);
    lista.push({ rotulo: rotuloDia(amanha9, agora), quando: amanha9 });
    const amanha14 = diaUtil(agora, 1, 14);
    lista.push({ rotulo: rotuloDia(amanha14, agora), quando: amanha14 });
    const em3 = diaUtil(agora, 3, 9);
    lista.push({ rotulo: `Em 3 dias (${rotuloDia(em3, agora)})`, quando: em3 });
    return lista;
}

export function atalhosVisita(agora: Date): Atalho[] {
    const lista: Atalho[] = [];
    if (agora.getHours() < 15 && agora.getDay() !== 0) {
        const hoje17 = new Date(agora); hoje17.setHours(17, 0, 0, 0);
        lista.push({ rotulo: rotuloDia(hoje17, agora), quando: hoje17 });
    }
    const amanha10 = diaUtil(agora, 1, 10);
    lista.push({ rotulo: rotuloDia(amanha10, agora), quando: amanha10 });
    const amanha15 = diaUtil(agora, 1, 15);
    lista.push({ rotulo: rotuloDia(amanha15, agora), quando: amanha15 });
    // Próximo sábado de manhã
    const sab = new Date(agora);
    sab.setDate(sab.getDate() + ((6 - sab.getDay() + 7) % 7 || 7));
    sab.setHours(9, 0, 0, 0);
    if (!lista.some(a => a.quando.getTime() === sab.getTime())) lista.push({ rotulo: rotuloDia(sab, agora), quando: sab });
    return lista.slice(0, 4);
}

const paraInput = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Agendar em 2 toques: [Agendar] → [atalho]. "Outro horário" abre o campo
 * de data. Retorno = próximo contato (o lead sai da fila até lá); Visita =
 * agenda da loja (mesma rota da tela Agenda, com lembretes).
 */
export function SheetAgendar({ card, onFechar, onEscolher }: {
    card: CardFila | null;
    onFechar: () => void;
    onEscolher: (card: CardFila, modo: Modo, quando: Date) => void;
}) {
    const [modo, setModo] = useState<Modo>('retorno');
    const [livre, setLivre] = useState('');
    const [agora, setAgora] = useState(() => new Date());

    useEffect(() => {
        setModo('retorno');
        setLivre('');
        setAgora(new Date());
    }, [card]);

    if (!card) return <Sheet aberto={false} titulo="" onFechar={onFechar}>{null}</Sheet>;

    const atalhos = modo === 'retorno' ? atalhosRetorno(agora) : atalhosVisita(agora);
    const livreData = livre ? new Date(livre) : null;
    const livreOk = !!livreData && !Number.isNaN(livreData.getTime()) && livreData.getTime() > Date.now();

    return (
        <Sheet aberto titulo={`Agendar — ${card.nome}`} subtitulo={card.carro} onFechar={onFechar}>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1 mb-4" role="tablist">
                {([
                    { id: 'retorno', rotulo: 'Retornar contato', icon: PhoneCall },
                    { id: 'visita', rotulo: 'Visita na loja', icon: CalendarClock },
                ] as const).map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={modo === t.id}
                        onClick={() => setModo(t.id)}
                        className={`min-h-[48px] rounded-xl text-[13px] font-black flex items-center justify-center gap-2 transition ${modo === t.id ? 'bg-red-600 text-white' : 'text-white/50'}`}
                    >
                        <t.icon size={16} /> {t.rotulo}
                    </button>
                ))}
            </div>

            <p className="text-[11px] text-white/45 mb-2">
                {modo === 'retorno'
                    ? 'O lead sai da sua fila e volta no horário marcado.'
                    : 'Entra na Agenda da loja e o lembrete sai na véspera e no dia.'}
            </p>

            <div className="grid grid-cols-2 gap-2">
                {atalhos.map(a => (
                    <button
                        key={a.rotulo}
                        type="button"
                        onClick={() => onEscolher(card, modo, a.quando)}
                        className="min-h-[56px] rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] font-bold text-white/85 active:bg-red-600/30 active:border-red-500/50 transition"
                    >
                        {a.rotulo}
                    </button>
                ))}
            </div>

            <div className="mt-4 mb-2">
                <label htmlFor="fila-quando" className="block text-[11px] font-bold text-white/60 mb-1">Outro horário</label>
                <div className="flex gap-2">
                    <input
                        id="fila-quando"
                        type="datetime-local"
                        value={livre}
                        min={paraInput(new Date())}
                        onChange={e => setLivre(e.target.value)}
                        className="flex-1 min-w-0 rounded-xl bg-black/30 border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-red-400/60 [color-scheme:dark]"
                    />
                    <button
                        type="button"
                        disabled={!livreOk}
                        onClick={() => livreData && onEscolher(card, modo, livreData)}
                        className="min-h-[48px] px-4 rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-30"
                    >
                        Salvar
                    </button>
                </div>
            </div>
        </Sheet>
    );
}
