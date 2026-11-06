'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { MOTIVOS_PERDA, MIN_TEXTO_OUTRO, type MotivoPerda } from '@/constants/lossReasons';
import type { CardFila } from '@/lib/fila/montarFila';
import { Sheet } from './Sheet';
import type { Resultado } from './tipos';

/** "85.900", "85900,00", "R$ 85.900" → 85900. Mesma regra do /api/lead/finish. */
export function valorEmReais(v: string): number {
    const s = v.replace(/[^\d,.]/g, '');
    if (!s) return 0;
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

const VALOR_MINIMO = 1000;

/**
 * Resultado do lead em 2 toques:
 *   Perdido: [Resultado] → [motivo]            (só "Outro" pede o detalhe)
 *   Vendido: [Resultado] → digita o valor → [Confirmar venda]
 * Valor da venda e motivo da perda são obrigatórios.
 */
export function SheetResultado({ card, onFechar, onEscolher }: {
    card: CardFila | null;
    onFechar: () => void;
    onEscolher: (card: CardFila, r: Resultado) => void;
}) {
    const [valor, setValor] = useState('');
    const [veiculo, setVeiculo] = useState('');
    const [outro, setOutro] = useState<MotivoPerda | null>(null);
    const [detalhe, setDetalhe] = useState('');

    useEffect(() => {
        setValor('');
        setVeiculo(card?.carro || '');
        setOutro(null);
        setDetalhe('');
    }, [card]);

    if (!card) return <Sheet aberto={false} titulo="" onFechar={onFechar}>{null}</Sheet>;

    const n = valorEmReais(valor);
    const vendaOk = n >= VALOR_MINIMO && veiculo.trim().length >= 2;

    const escolherMotivo = (m: MotivoPerda) => {
        if (m.exigeTexto) { setOutro(m); return; }
        onEscolher(card, { tipo: 'perda', motivo: m.v, rotulo: m.l });
    };

    return (
        <Sheet aberto titulo={`Resultado — ${card.nome}`} subtitulo={card.carro} onFechar={onFechar}>
            {/* Vendido */}
            <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
                <p className="text-xs font-black uppercase tracking-widest text-emerald-300 mb-3 flex items-center gap-2">
                    <Trophy size={14} /> Vendido
                </p>
                <label className="block text-[11px] font-bold text-white/60 mb-1" htmlFor="fila-valor">Valor da venda (obrigatório)</label>
                <div className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/10 px-3 focus-within:border-emerald-400/60">
                    <span className="text-white/50 font-bold">R$</span>
                    <input
                        id="fila-valor"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="85.900"
                        value={valor}
                        onChange={e => setValor(e.target.value)}
                        className="flex-1 bg-transparent py-3 text-lg font-black text-white outline-none placeholder:text-white/20"
                    />
                </div>
                {valor && n > 0 && n < VALOR_MINIMO && (
                    <p className="text-[11px] text-amber-300 mt-1">Digite o valor cheio (ex.: 85900).</p>
                )}
                <label className="block text-[11px] font-bold text-white/60 mt-3 mb-1" htmlFor="fila-veiculo">Veículo vendido</label>
                <input
                    id="fila-veiculo"
                    value={veiculo}
                    onChange={e => setVeiculo(e.target.value)}
                    placeholder="Ex.: Onix 2020 LT"
                    className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400/60"
                />
                <button
                    type="button"
                    disabled={!vendaOk}
                    onClick={() => onEscolher(card, { tipo: 'venda', valor: n, veiculo: veiculo.trim() })}
                    className="mt-3 w-full min-h-[52px] rounded-xl bg-emerald-600 text-white font-black text-sm disabled:opacity-30 active:scale-[0.98] transition"
                >
                    Confirmar venda{n >= VALOR_MINIMO ? ` · R$ ${n.toLocaleString('pt-BR')}` : ''}
                </button>
            </section>

            {/* Perdido */}
            <section className="mt-4 mb-2">
                <p className="text-xs font-black uppercase tracking-widest text-red-300 mb-3">Perdido — toque no motivo</p>
                {!outro ? (
                    <div className="grid grid-cols-2 gap-2">
                        {MOTIVOS_PERDA.map(m => (
                            <button
                                key={m.v}
                                type="button"
                                onClick={() => escolherMotivo(m)}
                                className="min-h-[56px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-[13px] font-bold text-white/85 active:bg-red-600/30 active:border-red-500/50 transition"
                            >
                                {m.l}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="block text-[11px] font-bold text-white/60" htmlFor="fila-outro">O que aconteceu? (mín. {MIN_TEXTO_OUTRO} letras)</label>
                        <textarea
                            id="fila-outro"
                            autoFocus
                            rows={3}
                            value={detalhe}
                            onChange={e => setDetalhe(e.target.value)}
                            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-red-400/60"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setOutro(null)} className="min-h-[48px] rounded-xl border border-white/10 text-sm font-bold text-white/60">Voltar</button>
                            <button
                                type="button"
                                disabled={detalhe.trim().length < MIN_TEXTO_OUTRO}
                                onClick={() => onEscolher(card, { tipo: 'perda', motivo: outro.v, rotulo: outro.l, detalhe: detalhe.trim() })}
                                className="min-h-[48px] rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-30"
                            >
                                Confirmar perda
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </Sheet>
    );
}
