'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, CalendarCheck2, Lightbulb, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { CardFila, Fila } from '@/lib/fila/montarFila';
import { CardLead, type Pendente } from './CardLead';
import { SheetAgendar } from './SheetAgendar';
import { SheetResultado } from './SheetResultado';
import { chaveCard, type FilaApi, type Resultado } from './tipos';

/** Tempo para desfazer o resultado antes de gravar. */
const DESFAZER_MS = 5000;

type PendenteInterno = Pendente & { card: CardFila; r: Resultado; timer: ReturnType<typeof setTimeout> | null };

interface Props {
    fila: Fila | null;
    dica: string | null;
    nome: string | null;
    aviso?: string | null;
    carregando: boolean;
    erro?: string | null;
    atualizadoEm: number | null;
    api: FilaApi;
    onAtualizar: () => void;
    /** Depois de gravar o resultado (a página abre a roleta na venda). */
    onResultadoGravado?: (card: CardFila, r: Resultado) => void;
    /** Relógio fixo (prévia/print). */
    agoraFixo?: number;
}

const fmtHora = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function FilaView({ fila, dica, nome, aviso, carregando, erro, atualizadoEm, api, onAtualizar, onResultadoGravado, agoraFixo }: Props) {
    const [agora, setAgora] = useState(() => agoraFixo ?? Date.now());
    const [cardAgendar, setCardAgendar] = useState<CardFila | null>(null);
    const [cardResultado, setCardResultado] = useState<CardFila | null>(null);
    const [pendentes, setPendentes] = useState<Record<string, PendenteInterno>>({});
    const [removidos, setRemovidos] = useState<Set<string>>(new Set());
    const [destaque, setDestaque] = useState<string | null>(null);
    const [aviso2, setAviso2] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null);
    const pendentesRef = useRef(pendentes);
    pendentesRef.current = pendentes;

    // Dois relógios: `agora` para "há 32 min" (fixo na prévia) e `relogio`
    // para a contagem do "Desfazer" (sempre o tempo real).
    const [relogio, setRelogio] = useState(() => Date.now());
    const temPendente = Object.keys(pendentes).length > 0;
    useEffect(() => {
        if (agoraFixo) return;
        const t = setInterval(() => setAgora(Date.now()), 30_000);
        return () => clearInterval(t);
    }, [agoraFixo]);
    useEffect(() => {
        if (!temPendente) return;
        setRelogio(Date.now());
        const t = setInterval(() => setRelogio(Date.now()), 500);
        return () => clearInterval(t);
    }, [temPendente]);

    useEffect(() => {
        if (!aviso2) return;
        const t = setTimeout(() => setAviso2(null), 4000);
        return () => clearTimeout(t);
    }, [aviso2]);

    // Nova leitura da fila: o que já foi gravado sai de "removidos".
    useEffect(() => { setRemovidos(new Set()); }, [fila]);

    const gravar = useCallback(async (chave: string) => {
        const p = pendentesRef.current[chave];
        if (!p) return;
        if (p.timer) clearTimeout(p.timer);
        setPendentes(prev => ({ ...prev, [chave]: { ...p, timer: null, ate: 0 } }));
        const res = await api.registrarResultado(p.card, p.r);
        if (res.ok) {
            setPendentes(prev => { const n = { ...prev }; delete n[chave]; return n; });
            setRemovidos(prev => new Set(prev).add(chave));
            setAviso2({ texto: p.r.tipo === 'venda' ? 'Venda registrada. Parabéns!' : 'Perda registrada com o motivo.', tipo: 'ok' });
            onResultadoGravado?.(p.card, p.r);
        } else {
            setPendentes(prev => ({ ...prev, [chave]: { ...p, timer: null, ate: 0, erro: res.error || 'erro' } }));
        }
    }, [api, onResultadoGravado]);

    // Saiu da página com resultado na contagem: grava na hora (fetch keepalive).
    useEffect(() => {
        const flush = () => { for (const k of Object.keys(pendentesRef.current)) if (!pendentesRef.current[k].erro) gravar(k); };
        window.addEventListener('pagehide', flush);
        return () => window.removeEventListener('pagehide', flush);
    }, [gravar]);

    const escolherResultado = useCallback((card: CardFila, r: Resultado) => {
        setCardResultado(null);
        const chave = chaveCard(card);
        const rotulo = r.tipo === 'venda'
            ? `Vendido · R$ ${r.valor.toLocaleString('pt-BR')}`
            : `Perdido · ${r.rotulo}`;
        const timer = setTimeout(() => gravar(chave), DESFAZER_MS);
        setPendentes(prev => ({ ...prev, [chave]: { card, r, rotulo, ate: Date.now() + DESFAZER_MS, timer } }));
        setRelogio(Date.now());
    }, [gravar]);

    const desfazer = useCallback((card: CardFila) => {
        const chave = chaveCard(card);
        const p = pendentesRef.current[chave];
        if (p?.timer) clearTimeout(p.timer);
        setPendentes(prev => { const n = { ...prev }; delete n[chave]; return n; });
    }, []);

    const escolherAgenda = useCallback(async (card: CardFila, modo: 'retorno' | 'visita', quando: Date) => {
        setCardAgendar(null);
        const res = modo === 'retorno' ? await api.marcarRetorno(card, quando) : await api.marcarVisita(card, quando);
        if (res.ok) {
            const dia = quando.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
            setAviso2({ texto: `${modo === 'retorno' ? 'Retorno' : 'Visita'} marcado: ${dia} às ${fmtHora(quando)}.`, tipo: 'ok' });
            onAtualizar();
        } else {
            setAviso2({ texto: `Não foi salvo: ${res.error || 'erro'}`, tipo: 'erro' });
        }
    }, [api, onAtualizar]);

    const ligar = useCallback((card: CardFila) => {
        if (card.uid) api.registrarLigacao(card).catch(() => { /* informativo */ });
    }, [api]);

    const secoes = useMemo(() => (fila?.secoes || [])
        .map(s => ({ ...s, cards: s.cards.filter(c => !removidos.has(chaveCard(c))) }))
        .filter(s => s.cards.length > 0), [fila, removidos]);
    const total = secoes.reduce((n, s) => n + s.cards.length, 0);

    const irPara = (uid: string | null) => {
        if (!uid) return;
        setDestaque(uid);
        document.getElementById(`card-${uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setDestaque(null), 2500);
    };

    const primeiroNome = (nome || '').split(' ')[0];

    return (
        <div className="w-full max-w-2xl mx-auto md:px-6 md:py-8">
            {/* Cabeçalho */}
            <div className="flex items-end justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-black text-white tracking-tight">Minha Fila</h1>
                    <p className="text-[12px] text-white/45 mt-0.5">
                        {primeiroNome ? `${primeiroNome}, ` : ''}
                        {carregando && !fila ? 'carregando…' : `${total} ${total === 1 ? 'lead' : 'leads'} em ordem de prioridade`}
                        {atualizadoEm && !carregando ? ` · ${fmtHora(new Date(atualizadoEm))}` : ''}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onAtualizar}
                    aria-label="Atualizar a fila"
                    className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/60 active:scale-95"
                >
                    {carregando ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                </button>
            </div>

            {erro && (
                <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-600/10 px-4 py-3 text-sm text-red-200">
                    Não consegui carregar a fila: {erro}
                </div>
            )}
            {aviso && <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">{aviso}</div>}

            {/* Próximo passo */}
            {fila && (
                <section className="mb-3 rounded-2xl border border-red-500/35 bg-gradient-to-br from-red-600/15 to-transparent p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-300 flex items-center gap-1.5 mb-1.5">
                        <Sparkles size={12} /> Próximo passo
                    </p>
                    <p className="text-[15px] font-bold text-white leading-snug">
                        {fila.proximoPasso?.texto || 'Fila zerada. Confira Meus Leads ou fale com o gestor para receber leads.'}
                    </p>
                    {fila.proximoPasso?.uid && (
                        <button
                            type="button"
                            onClick={() => irPara(fila.proximoPasso!.uid)}
                            className="mt-3 min-h-[44px] px-4 rounded-xl bg-white text-black text-[13px] font-black flex items-center gap-2 active:scale-95"
                        >
                            <ArrowDown size={15} /> Ir para {fila.proximoPasso.nome.split(' ')[0]}
                        </button>
                    )}
                </section>
            )}

            {/* Dica da semana */}
            {dica && (
                <section className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 flex gap-3">
                    <Lightbulb size={16} className="text-amber-300 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-amber-50/80 leading-snug"><span className="font-black text-amber-200">Dica da semana:</span> {dica}</p>
                </section>
            )}

            {/* Seções */}
            {carregando && !fila && (
                <div className="space-y-3">
                    {[0, 1, 2].map(i => <div key={i} className="h-52 rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-pulse" />)}
                </div>
            )}

            {fila && total === 0 && !carregando && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-10 text-center">
                    <CalendarCheck2 size={28} className="mx-auto text-emerald-400 mb-3" />
                    <p className="text-white font-black">Nada pendente agora.</p>
                    <p className="text-[13px] text-white/50 mt-1">Todo lead seu tem resultado ou próximo contato marcado.</p>
                </div>
            )}

            <div className="space-y-7">
                {secoes.map(s => (
                    <section key={s.id} aria-labelledby={`sec-${s.id}`}>
                        <header className="mb-2.5 px-1">
                            <h2 id={`sec-${s.id}`} className="text-[13px] font-black text-white flex items-center gap-2">
                                <span aria-hidden>{s.emoji}</span> {s.titulo}
                                <span className="ml-auto rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/70">{s.cards.length}</span>
                            </h2>
                            <p className="text-[11px] text-white/40 mt-0.5">{s.descricao}</p>
                        </header>
                        <div className="space-y-3">
                            {s.cards.map(c => {
                                const chave = chaveCard(c);
                                const p = pendentes[chave];
                                return (
                                    <CardLead
                                        key={chave}
                                        card={c}
                                        agora={agora}
                                        relogio={relogio}
                                        pendente={p ? { rotulo: p.rotulo, ate: p.ate, erro: p.erro } : null}
                                        destacado={destaque === c.uid}
                                        onLigar={ligar}
                                        onAgendar={setCardAgendar}
                                        onResultado={setCardResultado}
                                        onDesfazer={desfazer}
                                    />
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>

            {fila && fila.agendadosDepois > 0 && (
                <p className="mt-8 mb-2 text-center text-[12px] text-white/40">
                    {fila.agendadosDepois} {fila.agendadosDepois === 1 ? 'lead tem' : 'leads têm'} próximo contato marcado e {fila.agendadosDepois === 1 ? 'volta' : 'voltam'} para a fila na data.
                </p>
            )}

            <SheetAgendar card={cardAgendar} onFechar={() => setCardAgendar(null)} onEscolher={escolherAgenda} />
            <SheetResultado card={cardResultado} onFechar={() => setCardResultado(null)} onEscolher={escolherResultado} />

            <AnimatePresence>
                {aviso2 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                        role="status"
                        className={`fixed left-4 right-4 bottom-24 md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-[130] rounded-2xl border px-4 py-3 text-[13px] font-bold shadow-2xl ${aviso2.tipo === 'ok' ? 'bg-emerald-950 border-emerald-500/40 text-emerald-100' : 'bg-red-950 border-red-500/40 text-red-100'}`}
                    >
                        {aviso2.texto}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
