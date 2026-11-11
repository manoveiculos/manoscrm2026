'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Crown, ExternalLink, Inbox, LayoutGrid, MessageSquareWarning, Power, Tv, XCircle } from 'lucide-react';
import { Sheet } from '@/app/fila/_components/Sheet';
import { ARCOS } from '@/lib/agentes/catalogo';
import type { AgenteVisao, CentralAgentes, ItemDecisao, ModoAgente } from '@/lib/agentes/estado';
import type { EventoCena } from '@/lib/agentes/eventos';
import { EscritorioView } from './escritorio/EscritorioView';
import { COR_ESTADO, ICONES, corEstado, dolar, horaBRT, quandoFoi, rotuloEstado } from './icones';
import { fraseOciosa } from '@/lib/agentes/ocioso';

type Resposta = { ok: boolean; error?: string };

export interface CentralProps {
    dados: CentralAgentes;
    conexao: 'ao_vivo' | 'reconectando' | 'previa';
    agora: number;
    /** Prévia: nada grava (botões desligados). */
    somenteLeitura?: boolean;
    /** Eventos novos para o escritório animar (vêm do diff de leituras da página). */
    eventos?: EventoCena[];
    /** Modo TV (?tv=1): só o escritório, tela cheia, sem cliques. */
    tv?: boolean;
    onEntrarTv?: () => void;
    onSairTv?: () => void;
    onModo?: (agenteId: string, modo: ModoAgente) => Promise<Resposta>;
    onDecidir?: (runId: string, acao: 'approve' | 'reject', motivo?: string) => Promise<Resposta>;
}

const ATIVO_MS = 2 * 60_000;

/** Fluxo real recente (para a linha pulsar): trabalhando ou ação há menos de 2 min. */
const temFluxo = (a: AgenteVisao, agora: number) =>
    a.estado === 'trabalhando' || (!!a.ultimaAcaoEm && agora - new Date(a.ultimaAcaoEm).getTime() < ATIVO_MS);

// ── Anel do agente (estado visual) ─────────────────────────────────────────
function Anel({ a, tamanho = 'md' }: { a: AgenteVisao; tamanho?: 'md' | 'lg' }) {
    const Icone = ICONES[a.icone] || ICONES.Bot;
    const dim = tamanho === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
    const borda =
        a.estado === 'desligado' ? 'border-zinc-600 grayscale opacity-60'
        : a.estado === 'erro' ? 'border-red-500 border-2'
        : a.estado === 'aguardando' ? 'border-red-500/80 border-2'
        : a.modo === 'ensaio' ? 'border-amber-400/80 border-2 border-dashed'
        : a.estado === 'trabalhando' ? 'border-emerald-500/40'
        : 'border-white/10';
    return (
        <span className={`relative shrink-0 ${dim} rounded-full bg-[#15151b] border ${borda} flex items-center justify-center`}>
            {a.estado === 'trabalhando' && (
                <span aria-hidden className="absolute -inset-1 rounded-full border-2 border-emerald-400 border-t-transparent border-l-transparent motion-safe:animate-spin" />
            )}
            <Icone size={tamanho === 'lg' ? 24 : 19} className={a.estado === 'desligado' ? 'text-zinc-500' : a.estado === 'erro' ? 'text-red-300' : 'text-white/80'} />
            {a.aguardandoVoce > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-black text-white flex items-center justify-center">
                    {a.aguardandoVoce}
                </span>
            )}
        </span>
    );
}

function CardAgente({ a, agora, onAbrir, refCb }: { a: AgenteVisao; agora: number; onAbrir: (a: AgenteVisao) => void; refCb?: (el: HTMLButtonElement | null) => void }) {
    return (
        <button
            ref={refCb}
            type="button"
            onClick={() => onAbrir(a)}
            className="w-full text-left flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#0F0F14] px-3 py-2.5 hover:border-white/20 active:scale-[0.99] transition min-h-[64px]"
        >
            <Anel a={a} />
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-black text-white leading-none">{a.nome}</span>
                    {a.etiqueta && <span className="rounded px-1 py-px text-[9px] font-black tracking-wider bg-amber-500/20 text-amber-200 border border-amber-500/40">{a.etiqueta}</span>}
                    <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold ${corEstado(a.id, a.estado)}`}>{rotuloEstado(a.id, a.estado)}</span>
                </span>
                <span className="block text-[11px] text-white/60 truncate mt-1" title={a.frase}>{a.estado === 'ocioso' ? fraseOciosa(a.id, Math.floor(agora / 20000)) : a.frase}</span>
                <span className="block text-[10px] text-white/35 mt-0.5">
                    {quandoFoi(a.ultimaAcaoEm, agora)} · {a.execucoes24h} em 24 h{a.erros24h ? ` · ${a.erros24h} erro${a.erros24h > 1 ? 's' : ''}` : ''}{a.custoHojeUsd != null ? ` · ${dolar(a.custoHojeUsd)} hoje` : ''}
                </span>
            </span>
        </button>
    );
}

// ── Maestro (Alexandre no centro) ──────────────────────────────────────────
function Maestro({ dados, onFila, refCirculo, compacto = false }: { dados: CentralAgentes; onFila: () => void; refCirculo?: React.Ref<HTMLDivElement>; compacto?: boolean }) {
    const m = dados.maestro;
    return (
        <div className={`flex ${compacto ? 'flex-row items-center gap-4' : 'flex-col items-center gap-3'}`}>
            <div className="relative shrink-0">
                {m.luzAcesa && <span aria-hidden className="absolute -inset-2 rounded-full ring-4 ring-red-500/40 motion-safe:animate-pulse" />}
                <div ref={refCirculo} className={`relative ${compacto ? 'h-20 w-20' : 'h-32 w-32'} rounded-full bg-gradient-to-br from-red-600/40 via-[#1a0a0c] to-[#0C0C0F] border-2 ${m.luzAcesa ? 'border-red-500' : 'border-white/15'} flex flex-col items-center justify-center`}>
                    <Crown size={compacto ? 16 : 20} className="text-amber-300 mb-0.5" />
                    <span className={`${compacto ? 'text-2xl' : 'text-4xl'} font-black text-white leading-none`}>A</span>
                </div>
            </div>
            <div className={compacto ? 'min-w-0' : 'text-center'}>
                <p className="text-[15px] font-black text-white leading-tight">Alexandre</p>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-bold">Maestro</p>
                <div className={`mt-2 flex ${compacto ? '' : 'justify-center'} gap-1.5 flex-wrap`}>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-white/80">{m.aprovacoes} aprovações</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-white/80">{m.conversasSemDono} sem dono</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.alertas ? 'bg-red-600/25 text-red-200' : 'bg-white/[0.06] text-white/80'}`}>{m.alertas} alertas</span>
                </div>
                <button type="button" onClick={onFila} className={`mt-3 min-h-[40px] px-4 rounded-xl text-[12px] font-black ${m.luzAcesa ? 'bg-red-600 text-white' : 'bg-white/[0.08] text-white/80'} active:scale-95`}>
                    Abrir fila de decisões
                </button>
            </div>
        </div>
    );
}

// ── Interruptor geral ──────────────────────────────────────────────────────
function InterruptorGeral({ dados, somenteLeitura, onModo }: Pick<CentralProps, 'dados' | 'somenteLeitura' | 'onModo'>) {
    const [msg, setMsg] = useState<string | null>(null);
    const modo = dados.maestro.iaGeral;
    const ligada = modo !== 'desligado';
    const instalado = modo !== null;
    const alternar = async () => {
        if (!onModo || !instalado || somenteLeitura) return;
        const novo: ModoAgente = ligada ? 'desligado' : 'ligado';
        if (novo === 'desligado' && !confirm('Desligar TODA a IA? Laura (quando integrada), Copiloto, Reengajamento e os squads de marketing param.')) return;
        const r = await onModo('ia_geral', novo);
        setMsg(r.ok ? null : r.error || 'erro');
    };
    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={alternar}
                disabled={!instalado || somenteLeitura}
                title={!instalado ? 'Interruptor ainda não instalado: falta aplicar a migration agentes_config (seu aprovado).' : undefined}
                className={`min-h-[36px] px-3 rounded-xl border text-[12px] font-black flex items-center gap-2 disabled:opacity-60 ${
                    !instalado ? 'border-white/10 text-white/50' : ligada ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-red-500/60 bg-red-600/20 text-red-200'
                }`}
            >
                <Power size={14} /> IA geral {!instalado ? 'sem interruptor' : ligada ? 'LIGADA' : 'DESLIGADA'}
            </button>
            {msg && <span className="text-[11px] text-red-300">{msg}</span>}
        </div>
    );
}

// ── Feed ao vivo ───────────────────────────────────────────────────────────
function Feed({ dados }: { dados: CentralAgentes }) {
    return (
        <section aria-label="Ao vivo" className="rounded-2xl border border-white/[0.07] bg-[#0C0C10] p-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45 mb-3">Ao vivo</h2>
            {dados.feed.length === 0 && <p className="text-[12px] text-white/40">Nenhuma ação registrada nas últimas horas.</p>}
            <ol className="space-y-2.5">
                {dados.feed.map((f, i) => (
                    <li key={`${f.agenteId}-${f.em}-${i}`} className="flex gap-2.5 text-[12px] leading-snug">
                        <span className="tabular-nums text-white/35 shrink-0 w-10">{horaBRT(f.em)}</span>
                        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${f.status === 'erro' ? 'bg-red-500' : f.status === 'aguardando' ? 'bg-red-400' : f.status === 'rodando' ? 'bg-emerald-400' : 'bg-white/30'}`} />
                        <span className="min-w-0">
                            <span className="font-bold text-white/85">{f.agenteNome}</span>{' '}
                            <span className="text-white/60">{f.frase}</span>{f.repeticoes > 1 && <span className="ml-1 rounded bg-white/[0.08] px-1 text-[10px] font-bold text-white/70">×{f.repeticoes}</span>}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

// ── Gaveta do agente ───────────────────────────────────────────────────────
function GavetaAgente({ a, agora, dados, somenteLeitura, onModo, onFechar }: {
    a: AgenteVisao | null; agora: number; dados: CentralAgentes; somenteLeitura?: boolean;
    onModo?: CentralProps['onModo']; onFechar: () => void;
}) {
    const [msg, setMsg] = useState<string | null>(null);
    if (!a) return <Sheet aberto={false} titulo="" onFechar={onFechar}>{null}</Sheet>;
    const instalado = dados.maestro.iaGeral !== null;
    const ehLaura = a.id === 'laura';
    const trocar = async (modo: ModoAgente) => {
        if (!onModo) return;
        const r = await onModo(a.id, modo);
        setMsg(r.ok ? 'Salvo.' : r.error || 'erro');
    };
    return (
        <Sheet aberto titulo={a.nome} subtitulo={a.funcao} onFechar={() => { setMsg(null); onFechar(); }}>
            <div className="flex items-center gap-3 mb-4">
                <Anel a={a} tamanho="lg" />
                <div className="min-w-0">
                    <p className="text-[13px] font-bold text-white">{a.frase}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">{a.estado === 'ocioso' ? 'sem tarefa na fila' : rotuloEstado(a.id, a.estado)} · última ação {quandoFoi(a.ultimaAcaoEm, agora)}</p>
                </div>
            </div>
            {a.observacao && <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">{a.observacao}</p>}

            <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                    ['Execuções 24 h', String(a.execucoes24h)],
                    ['Erros 24 h', String(a.erros24h)],
                    ['Custo hoje', a.custoHojeUsd == null ? '—' : dolar(a.custoHojeUsd)],
                ].map(([r, v]) => (
                    <div key={r} className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                        <p className="text-[10px] text-white/45">{r}</p>
                        <p className="text-[15px] font-black text-white tabular-nums">{v}</p>
                    </div>
                ))}
            </div>

            <div className="mb-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-2">Interruptor</p>
                {ehLaura ? (
                    <p className="text-[12px] text-white/60">O modo da Laura é o botão da tela <Link href="/conversas" className="underline text-white/85">Conversas</Link> (desligada · ensaio · envia).</p>
                ) : !instalado ? (
                    <p className="text-[12px] text-white/50">Interruptor ainda não instalado — falta aplicar a migration <code>agentes_config</code> (precisa do seu aprovado).</p>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {(['ligado', 'ensaio', 'desligado'] as ModoAgente[]).map(m => (
                            <button
                                key={m}
                                type="button"
                                disabled={somenteLeitura}
                                onClick={() => trocar(m)}
                                className={`min-h-[44px] rounded-xl border text-[12px] font-black capitalize disabled:opacity-50 ${a.modo === m ? 'border-red-500 bg-red-600/25 text-white' : 'border-white/10 text-white/60'}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                )}
                {msg && <p className="text-[11px] mt-2 text-white/70">{msg}</p>}
            </div>

            <div className="mb-4">
                <button type="button" disabled className="w-full min-h-[44px] rounded-xl border border-white/10 text-[12px] font-bold text-white/40" title="Precisa da tabela growth_ordens (Growth Intelligence), ainda não aprovada.">
                    Falar com este agente (em breve — falta a tabela de ordens)
                </button>
            </div>

            <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-2">Últimas ações</p>
            {a.acoes.length === 0 && <p className="text-[12px] text-white/40 mb-4">Nenhum registro.</p>}
            <ol className="space-y-2 mb-4">
                {a.acoes.map((r, i) => (
                    <li key={`${r.em}-${i}`} className="flex gap-2 text-[12px]">
                        <span className="tabular-nums text-white/35 shrink-0 w-16">{new Date(r.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
                        <span className={`min-w-0 ${r.status === 'erro' ? 'text-red-300' : 'text-white/70'}`}>
                            {r.link ? <Link href={r.link} className="hover:underline">{r.frase}</Link> : r.frase}
                        </span>
                    </li>
                ))}
            </ol>
        </Sheet>
    );
}

// ── Fila de decisões ───────────────────────────────────────────────────────
function FilaDecisoes({ aberta, dados, somenteLeitura, onDecidir, onFechar }: {
    aberta: boolean; dados: CentralAgentes; somenteLeitura?: boolean; onDecidir?: CentralProps['onDecidir']; onFechar: () => void;
}) {
    const [feitos, setFeitos] = useState<Record<string, string>>({});
    const grupos: { tipo: ItemDecisao['tipo']; titulo: string; icone: typeof Inbox }[] = [
        { tipo: 'aprovacao', titulo: 'Aprovações', icone: CheckCircle2 },
        { tipo: 'alerta', titulo: 'Alertas críticos', icone: AlertTriangle },
        { tipo: 'conversa_sem_dono', titulo: 'Conversas sem dono', icone: MessageSquareWarning },
    ];
    const decidir = async (d: ItemDecisao, acao: 'approve' | 'reject', pedirMotivo = false) => {
        if (!onDecidir) return;
        let motivo: string | undefined;
        if (pedirMotivo) {
            const m = prompt('O que precisa ajustar?');
            if (!m) return;
            motivo = `Ajuste: ${m}`;
        }
        const r = await onDecidir(d.id, acao, motivo);
        setFeitos(f => ({ ...f, [d.id]: r.ok ? (acao === 'approve' ? 'Aprovado' : pedirMotivo ? 'Ajuste pedido' : 'Rejeitado') : `Erro: ${r.error || ''}` }));
    };
    return (
        <Sheet aberto={aberta} titulo="Fila de decisões" subtitulo="O que está esperando você agora" onFechar={onFechar}>
            {grupos.map(g => {
                const itens = dados.decisoes.filter(d => d.tipo === g.tipo);
                return (
                    <section key={g.tipo} className="mb-5">
                        <h3 className="text-[12px] font-black text-white flex items-center gap-2 mb-2"><g.icone size={14} /> {g.titulo} <span className="text-white/40">({itens.length})</span></h3>
                        {itens.length === 0 && <p className="text-[12px] text-white/40">Nada aqui.</p>}
                        <ul className="space-y-2">
                            {itens.map(d => (
                                <li key={d.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                                    <p className="text-[13px] font-bold text-white leading-snug">{d.titulo}</p>
                                    {d.detalhe && <p className="text-[11px] text-white/55 mt-1 line-clamp-2">{d.detalhe}</p>}
                                    <p className="text-[10px] text-white/35 mt-1">{new Date(d.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</p>
                                    {feitos[d.id] ? (
                                        <p className="mt-2 text-[12px] font-bold text-emerald-300">{feitos[d.id]}</p>
                                    ) : (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {d.tipo === 'aprovacao' && (
                                                <>
                                                    <button type="button" disabled={somenteLeitura} onClick={() => decidir(d, 'approve')} className="min-h-[40px] px-3 rounded-xl bg-emerald-600 text-white text-[12px] font-black disabled:opacity-40">Aprovar</button>
                                                    <button type="button" disabled={somenteLeitura} onClick={() => decidir(d, 'reject', true)} className="min-h-[40px] px-3 rounded-xl border border-white/15 text-white/80 text-[12px] font-bold disabled:opacity-40">Pedir ajuste</button>
                                                    <button type="button" disabled={somenteLeitura} onClick={() => decidir(d, 'reject')} className="min-h-[40px] px-3 rounded-xl border border-red-500/40 text-red-200 text-[12px] font-bold flex items-center gap-1 disabled:opacity-40"><XCircle size={13} /> Rejeitar</button>
                                                </>
                                            )}
                                            {d.link && (
                                                <Link href={d.link} className="min-h-[40px] px-3 rounded-xl border border-white/15 text-white/80 text-[12px] font-bold flex items-center gap-1">
                                                    <ExternalLink size={13} /> {d.tipo === 'conversa_sem_dono' ? 'Abrir / assumir' : 'Abrir'}
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
            <section className="mb-4">
                <h3 className="text-[12px] font-black text-white mb-2">Dar uma ordem a um agente</h3>
                <p className="text-[12px] text-white/45">Em breve: precisa da tabela de ordens (<code>growth_ordens</code>) da Growth Intelligence, que ainda não foi aprovada.</p>
            </section>
        </Sheet>
    );
}

// ── Constelação (desktop) ──────────────────────────────────────────────────
function Constelacao({ dados, agora, onAbrir, onFila }: { dados: CentralAgentes; agora: number; onAbrir: (a: AgenteVisao) => void; onFila: () => void }) {
    const caixa = useRef<HTMLDivElement | null>(null);
    const centro = useRef<HTMLDivElement | null>(null);
    const nos = useRef<Map<string, HTMLButtonElement>>(new Map());
    const [linhas, setLinhas] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number }[]>([]);

    const medir = useCallback(() => {
        const c = caixa.current?.getBoundingClientRect();
        const m = centro.current?.getBoundingClientRect();
        if (!c || !m) return;
        const cx = m.left + m.width / 2 - c.left;
        const cy = m.top + m.height / 2 - c.top;
        const ls: typeof linhas = [];
        for (const a of dados.agentes) {
            const el = nos.current.get(a.id);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            const x2 = a.arco === 'atendimento' ? r.right - c.left : a.arco === 'marketing' ? r.left - c.left : r.left + r.width / 2 - c.left;
            const y2 = a.arco === 'direcao' ? r.top - c.top : r.top + r.height / 2 - c.top;
            ls.push({ id: a.id, x1: cx, y1: cy, x2, y2 });
        }
        setLinhas(ls);
    }, [dados.agentes]);

    useLayoutEffect(() => {
        medir();
        const ro = new ResizeObserver(medir);
        if (caixa.current) ro.observe(caixa.current);
        return () => ro.disconnect();
    }, [medir]);

    const porArco = (arco: string) => dados.agentes.filter(a => a.arco === arco);
    const ref = (id: string) => (el: HTMLButtonElement | null) => { if (el) nos.current.set(id, el); else nos.current.delete(id); };
    const porId = new Map(dados.agentes.map(a => [a.id, a]));

    return (
        <div ref={caixa} className="relative">
            <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                {linhas.map(l => {
                    const a = porId.get(l.id)!;
                    const fluxo = temFluxo(a, agora);
                    const cor = a.estado === 'aguardando' || a.estado === 'erro' ? 'rgba(239,68,68,0.55)' : fluxo ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.07)';
                    return (
                        <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={cor} strokeWidth={fluxo ? 2 : 1}
                            strokeDasharray={a.modo === 'ensaio' ? '4 4' : undefined}
                            className={fluxo ? 'motion-safe:animate-pulse' : undefined} />
                    );
                })}
            </svg>
            <div className="relative grid grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)] gap-x-10 items-center">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">{ARCOS[0].nome}</p>
                    <div className="space-y-2">{porArco('atendimento').map(a => <CardAgente key={a.id} a={a} agora={agora} onAbrir={onAbrir} refCb={ref(a.id)} />)}</div>
                </div>
                <div className="flex flex-col items-center gap-10">
                    <Maestro dados={dados} onFila={onFila} refCirculo={centro} />
                    <div className="w-full">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2 text-center">{ARCOS[2].nome}</p>
                        {porArco('direcao').map(a => <CardAgente key={a.id} a={a} agora={agora} onAbrir={onAbrir} refCb={ref(a.id)} />)}
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2 text-right">{ARCOS[1].nome}</p>
                    <div className="space-y-2">{porArco('marketing').map(a => <CardAgente key={a.id} a={a} agora={agora} onAbrir={onAbrir} refCb={ref(a.id)} />)}</div>
                </div>
            </div>
        </div>
    );
}

// ── Tela ───────────────────────────────────────────────────────────────────
type Visao = 'escritorio' | 'constelacao';
const CHAVE_VISAO = 'agentes:visao';

export function CentralView({ dados, conexao, agora, somenteLeitura, eventos = [], tv = false, onEntrarTv, onSairTv, onModo, onDecidir }: CentralProps) {
    const [visao, setVisao] = useState<Visao>('constelacao');
    // Preferência guardada no navegador; sem preferência, o escritório é o padrão no desktop.
    useEffect(() => {
        try { setVisao(localStorage.getItem(CHAVE_VISAO) === 'constelacao' ? 'constelacao' : 'escritorio'); } catch { setVisao('escritorio'); }
    }, []);
    const trocarVisao = (v: Visao) => { setVisao(v); try { localStorage.setItem(CHAVE_VISAO, v); } catch { /* sem storage: só não lembra */ } };
    const [aberto, setAberto] = useState<string | null>(null);
    const [filaAberta, setFilaAberta] = useState(false);
    const agenteAberto = aberto ? dados.agentes.find(a => a.id === aberto) || null : null;
    const m = dados.maestro;

    if (tv) {
        return (
            <div className="fixed inset-0 z-[80] bg-[#03060b] overflow-hidden flex items-start justify-center px-3 pt-2" style={{ cursor: 'none' }}>
                <EscritorioView dados={dados} painel={dados.painel ?? null} eventos={eventos} agora={agora} tv />
                {onSairTv && <button type="button" onClick={onSairTv} className="fixed bottom-3 right-3 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/80 opacity-0 hover:opacity-100 focus:opacity-100" style={{ cursor: 'pointer' }}>Sair do modo TV</button>}
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1500px] mx-auto md:px-6 md:py-6">
            {/* Cabeçalho */}
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">Central dos Agentes</h1>
                <span className={`flex items-center gap-1.5 text-[12px] font-bold ${conexao === 'reconectando' ? 'text-amber-300' : 'text-emerald-300'}`}>
                    <span className={`h-2 w-2 rounded-full ${conexao === 'reconectando' ? 'bg-amber-400' : 'bg-emerald-400 motion-safe:animate-pulse'}`} />
                    {conexao === 'reconectando' ? 'reconectando…' : conexao === 'previa' ? 'prévia com dados reais (só leitura)' : 'ao vivo'}
                </span>
                <div className="hidden lg:flex items-center rounded-xl border border-white/10 overflow-hidden text-[12px] font-bold md:ml-auto">
                    <button type="button" onClick={() => trocarVisao('escritorio')} className={`flex items-center gap-1.5 px-3 py-1.5 ${visao === 'escritorio' ? 'bg-white/15 text-white' : 'text-white/55'}`}><Tv size={13} /> Escritório</button>
                    <button type="button" onClick={() => trocarVisao('constelacao')} className={`flex items-center gap-1.5 px-3 py-1.5 ${visao === 'constelacao' ? 'bg-white/15 text-white' : 'text-white/55'}`}><LayoutGrid size={13} /> Lista</button>
                    {onEntrarTv && <button type="button" onClick={onEntrarTv} className="flex items-center gap-1.5 px-3 py-1.5 border-l border-white/10 text-white/55 hover:text-white"><Tv size={13} /> Modo TV</button>}
                </div>
                <div className="flex items-center gap-3">
                    <InterruptorGeral dados={dados} somenteLeitura={somenteLeitura} onModo={onModo} />
                    <span className="text-[12px] text-white/55">hoje: <b className="text-white">{dolar(m.custoHojeUsd)}</b> de IA</span>
                </div>
            </header>

            {/* Celular: maestro no topo, listas, feed */}
            <div className="lg:hidden space-y-5">
                <div className="rounded-2xl border border-white/[0.08] bg-[#0F0F14] p-4">
                    <Maestro dados={dados} onFila={() => setFilaAberta(true)} compacto />
                </div>
                {ARCOS.map(arco => (
                    <section key={arco.id}>
                        <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45 mb-2">{arco.nome}</h2>
                        <div className="space-y-2">
                            {dados.agentes.filter(a => a.arco === arco.id).map(a => <CardAgente key={a.id} a={a} agora={agora} onAbrir={x => setAberto(x.id)} />)}
                        </div>
                    </section>
                ))}
                <Feed dados={dados} />
            </div>

            {/* Desktop: escritório animado (padrão) ou constelação + feed */}
            {visao === 'escritorio' ? (
                <div className="hidden lg:block">
                    <EscritorioView dados={dados} painel={dados.painel ?? null} eventos={eventos} agora={agora} cabecalho={false} onFila={() => setFilaAberta(true)} onAbrirAgente={a => setAberto(a.id)} />
                </div>
            ) : (
                <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_320px] gap-6">
                    <Constelacao dados={dados} agora={agora} onAbrir={a => setAberto(a.id)} onFila={() => setFilaAberta(true)} />
                    <div className="max-h-[78vh] overflow-y-auto pr-1"><Feed dados={dados} /></div>
                </div>
            )}

            {/* Barra da fila */}
            <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#0F0F14] px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-white/75">
                    <b className="text-white">Sua fila:</b> {m.aprovacoes} aprovações · {m.conversasSemDono} conversas sem dono · {m.alertas} {m.alertas === 1 ? 'alerta crítico' : 'alertas críticos'}
                </span>
                <button type="button" onClick={() => setFilaAberta(true)} className="ml-auto min-h-[40px] px-4 rounded-xl bg-red-600 text-white text-[12px] font-black active:scale-95">Abrir fila</button>
            </div>

            <GavetaAgente a={agenteAberto} agora={agora} dados={dados} somenteLeitura={somenteLeitura} onModo={onModo} onFechar={() => setAberto(null)} />
            <FilaDecisoes aberta={filaAberta} dados={dados} somenteLeitura={somenteLeitura} onDecidir={onDecidir} onFechar={() => setFilaAberta(false)} />
        </div>
    );
}
