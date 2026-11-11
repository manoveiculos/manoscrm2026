'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Power } from 'lucide-react';
import type { AgenteVisao, CentralAgentes, EstadoAgente } from '@/lib/agentes/estado';
import { ARCOS } from '@/lib/agentes/catalogo';
import { COR_ESTADO, ROTULO_ESTADO, dolar, horaBRT, quandoFoi } from '../icones';
import { Avatar } from './Avatar';
import { Telao, type LinhaFeed, type Takeover } from './Telao';
import { ANEL, ENTRADA, H, HUB, MESAS, SALA_DIRECAO, TELAO, W, centro, type EventoCena, type PainelTelao } from './cena';

const CSS = `
.sv{transform-box:fill-box;transform-origin:center}
@keyframes respira{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}
@keyframes pisca{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
@keyframes digita{0%,100%{transform:scaleX(.25)}50%{transform:scaleX(1)}}
@keyframes tremer{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
@keyframes acena{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(16deg)}}
@keyframes pulso{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes pulsoForte{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes giro{to{transform:rotate(360deg)}}
@keyframes cai{0%{transform:translateY(-30px) rotate(0)}100%{transform:translateY(330px) rotate(540deg)}}
@keyframes balanca{0%,100%{transform:rotate(-8deg) scale(1)}50%{transform:rotate(8deg) scale(1.12)}}
@keyframes fluxo{to{stroke-dashoffset:-24}}
@keyframes fala{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.55)}}
.respira{animation:respira 3.4s ease-in-out infinite}
.pisca{animation:pisca 5s infinite}
.pulso{animation:pulso 1.4s ease-in-out infinite}
.pulso-forte{animation:pulsoForte .9s ease-in-out infinite}
.acena{animation:acena .8s ease-in-out infinite}
.balanca{display:inline-block;animation:balanca .7s ease-in-out infinite}
.fala{animation:fala .45s ease-in-out infinite}
.av-erro{animation:tremer .25s linear infinite}
.digita{animation:digita .9s ease-in-out infinite;transform-origin:left center}
.fluxo{animation:fluxo 1.1s linear infinite}
@media (prefers-reduced-motion:reduce){.respira,.pisca,.pulso,.pulso-forte,.acena,.balanca,.fala,.av-erro,.digita,.fluxo{animation:none!important}}
`;

const DUR_TAKEOVER = 5200;
const DUR_ATIVO = 6000;
const DUR_FALA = 4200;

interface Pacote { id: string; de: { x: number; y: number }; para: { x: number; y: number }; rotulo: string; cor: string }
type Ativo = { estado: EstadoAgente; ate: number };

export interface EscritorioProps {
    dados: CentralAgentes;
    /** null = números do telão ainda não existem na API (sem inventar: o telão mostra só o que é real). */
    painel: PainelTelao | null;
    /** Eventos novos (id único) — cada um é tocado uma vez. */
    eventos: EventoCena[];
    agora: number;
    /** Etiqueta do cabeçalho próprio (prévia). */
    rotuloModo?: string;
    /** false = a página já tem cabeçalho (tela real). */
    cabecalho?: boolean;
    /** Modo TV: ocupa a tela toda (sem a barra de baixo da página). */
    tv?: boolean;
    onFila?: () => void;
    onAbrirAgente?: (a: AgenteVisao) => void;
}

function Mesa({ a, estado, fala, agora, onAbrir }: { a: AgenteVisao; estado: EstadoAgente; fala?: string; agora: number; onAbrir?: (a: AgenteVisao) => void }) {
    const c = MESAS[a.id];
    if (!c) return null;
    const trabalhando = estado === 'trabalhando';
    const borda = estado === 'erro' || estado === 'aguardando' ? '#ef4444' : trabalhando ? '#10b98199' : a.modo === 'ensaio' ? '#fbbf2499' : '#ffffff1c';
    return (
        <div className="absolute" style={{ left: c.x, top: c.y, width: c.w, height: c.h }}>
            <AnimatePresence>
                {fala && (
                    <motion.div key={fala} initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
                        className="absolute z-30 left-[70px] -top-[34px] max-w-[250px] rounded-xl rounded-bl-sm px-3 py-1.5 text-[14px] font-semibold leading-tight text-[#111] shadow-lg"
                        style={{ background: estado === 'erro' ? '#fecaca' : '#f4f4f5' }}>
                        {fala}
                    </motion.div>
                )}
            </AnimatePresence>
            <button type="button" onClick={() => onAbrir?.(a)} className="relative w-full h-full rounded-2xl text-left overflow-hidden transition-transform hover:scale-[1.02]"
                style={{ background: 'linear-gradient(150deg,#16161e,#0c0c11)', border: `1.5px ${a.modo === 'ensaio' ? 'dashed' : 'solid'} ${borda}`, boxShadow: trabalhando ? '0 0 26px -6px #10b981aa' : estado === 'erro' ? '0 0 26px -4px #ef4444aa' : '0 10px 24px -14px #000', opacity: estado === 'desligado' ? 0.55 : 1, filter: estado === 'desligado' ? 'grayscale(1)' : undefined }}>
                {/* tampo da mesa */}
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-[38px]" style={{ background: 'linear-gradient(180deg,#1f1f29,#14141b)', borderTop: '1px solid #ffffff12' }} />
                <div className="absolute left-2 top-[18px]">
                    <div className="relative">
                        {trabalhando && <span aria-hidden className="absolute -inset-[3px] rounded-full border-2 border-emerald-400 border-t-transparent border-l-transparent" style={{ animation: 'giro 1.1s linear infinite' }} />}
                        <Avatar id={a.id} estado={estado} ensaio={a.modo === 'ensaio'} />
                    </div>
                </div>
                <div className="absolute left-[88px] right-3 top-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[16px] font-black text-white leading-none">{a.nome}</span>
                        {a.etiqueta && <span className="rounded px-1 text-[10px] font-black tracking-wider bg-amber-500/20 text-amber-200 border border-amber-500/40">{a.etiqueta}</span>}
                    </div>
                    <span className={`inline-block mt-1.5 rounded-full border px-2 py-px text-[11px] font-bold ${COR_ESTADO[estado]}`}>{ROTULO_ESTADO[estado]}</span>
                </div>
                {/* monitor */}
                <div aria-hidden className="absolute right-3 top-[48px] z-10 w-[58px] h-[32px] rounded-md border border-white/15 px-1.5 flex flex-col justify-center gap-[4px]" style={{ background: trabalhando ? '#06281f' : '#0a0a0f', boxShadow: trabalhando ? '0 0 16px -2px #10b981' : undefined }}>
                    {[0, 1, 2].map(k => (
                        <span key={k} className={`block h-[3px] rounded-full ${trabalhando ? 'digita' : ''}`} style={{ width: '100%', background: estado === 'desligado' ? '#27272a' : trabalhando ? '#34d399' : estado === 'erro' ? '#ef4444' : '#ffffff25', animationDelay: `${k * 0.23}s`, transform: trabalhando ? undefined : `scaleX(${0.9 - k * 0.2})`, transformOrigin: 'left center' }} />
                    ))}
                </div>
                <div className="absolute left-3 right-[78px] bottom-[7px] text-[11px] text-white/45 truncate">
                    {quandoFoi(a.ultimaAcaoEm, agora)} · {a.execucoes24h} em 24 h{a.custoHojeUsd != null ? ` · ${dolar(a.custoHojeUsd)}` : ''}
                </div>
                {a.aguardandoVoce > 0 && (
                    <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-[12px] font-black text-white flex items-center justify-center pulso">{a.aguardandoVoce}</span>
                )}
            </button>
        </div>
    );
}

export function EscritorioView({ dados, painel, eventos, agora, rotuloModo, cabecalho = true, tv = false, onFila, onAbrirAgente }: EscritorioProps) {
    const [tick, setTick] = useState(() => Date.now());
    const [ativos, setAtivos] = useState<Record<string, Ativo>>({});
    const [falas, setFalas] = useState<Record<string, { texto: string; ate: number }>>({});
    const [pacotes, setPacotes] = useState<Pacote[]>([]);
    const [linhas, setLinhas] = useState<LinhaFeed[]>([]);
    const [fila, setFila] = useState<Takeover[]>([]);
    const [takeover, setTakeover] = useState<Takeover | null>(null);
    const [visitante, setVisitante] = useState<{ id: string; nome: string } | null>(null);
    const [luzExtra, setLuzExtra] = useState(0);
    const vistos = useRef<Set<string>>(new Set());

    // Relógio da cena (expira falas e estados temporários). Pausa com a aba oculta.
    useEffect(() => {
        const t = setInterval(() => { if (document.visibilityState === 'visible') setTick(Date.now()); }, 400);
        return () => clearInterval(t);
    }, []);

    const nomeDe = useMemo(() => new Map(dados.agentes.map(a => [a.id, a.nome])), [dados.agentes]);

    const ativar = useCallback((id: string, estado: EstadoAgente, ms = DUR_ATIVO) => {
        setAtivos(v => ({ ...v, [id]: { estado, ate: Date.now() + ms } }));
    }, []);
    const falar = useCallback((id: string, texto: string) => {
        setFalas(v => ({ ...v, [id]: { texto, ate: Date.now() + DUR_FALA } }));
    }, []);
    const linha = useCallback((agente: string, texto: string, tom: LinhaFeed['tom']) => {
        setLinhas(v => [{ id: `${Date.now()}-${Math.random()}`, hora: horaBRT(new Date().toISOString()), agente, texto, tom }, ...v].slice(0, 12));
    }, []);

    // Toca cada evento novo uma única vez.
    useEffect(() => {
        for (const ev of eventos) {
            if (vistos.current.has(ev.id)) continue;
            vistos.current.add(ev.id);
            if (ev.tipo === 'lead_distribuido') {
                const pid = `p-${ev.id}`;
                const quem = [ev.nome, ev.carro].filter(Boolean).join(' · ');
                setPacotes(v => [...v, { id: pid, de: centro(ev.de), para: centro(ev.para), rotulo: quem || 'lead novo', cor: '#fbbf24' }]);
                ativar(ev.de, 'trabalhando', 3000);
                setTimeout(() => { ativar(ev.para, 'trabalhando', 5000); falar(ev.para, ev.nome ? `Lead novo: ${ev.nome}` : 'Lead novo!'); }, 1500);
                linha(nomeDe.get(ev.de) || ev.de, `lead${ev.nome ? ' ' + ev.nome : ''} → ${nomeDe.get(ev.para) || ev.para}`, 'novo');
            } else if (ev.tipo === 'fala') {
                ativar(ev.agenteId, 'trabalhando', 4000);
                falar(ev.agenteId, ev.texto);
                linha(nomeDe.get(ev.agenteId) || ev.agenteId, ev.texto, 'rodando');
            } else if (ev.tipo === 'lead_quente') {
                const vid = ev.id;
                setVisitante({ id: vid, nome: ev.nome || 'Lead' });
                setTimeout(() => setVisitante(v => (v?.id === vid ? null : v)), 5200);
                setLuzExtra(Date.now() + 9000);
                setFila(v => [...v, { tipo: 'lead_quente', titulo: 'LEAD AQUECENDO!', sub: ev.texto ?? `${ev.nome} · ${ev.carro} — cliente chegando na loja` }]);
                linha('Supervisor', ev.texto ?? `lead quente: ${ev.nome} · ${ev.carro}`, 'espera');
            } else if (ev.tipo === 'venda') {
                ativar(ev.agenteId, 'trabalhando', 6000);
                falar(ev.agenteId, '🎉 Vendi!');
                setFila(v => [...v, { tipo: 'venda', titulo: 'VENDA EFETUADA! PARABÉNS!', sub: [nomeDe.get(ev.agenteId), ev.nome, ev.carro].filter(Boolean).join(' · ') }]);
                linha(nomeDe.get(ev.agenteId) || ev.agenteId, ev.nome ? `vendeu ${ev.carro} para ${ev.nome}` : 'registrou uma venda', 'rodando');
            } else if (ev.tipo === 'aprovacao') {
                ativar(ev.agenteId, 'aguardando', 12000);
                setPacotes(v => [...v, { id: `p-${ev.id}`, de: centro(ev.agenteId), para: HUB, rotulo: 'aprovação', cor: '#f87171' }]);
                setFila(v => [...v, { tipo: 'aprovacao', titulo: 'ESPERANDO VOCÊ', sub: `${nomeDe.get(ev.agenteId) || ''} — ${ev.titulo}` }]);
                linha(nomeDe.get(ev.agenteId) || ev.agenteId, ev.titulo, 'espera');
            } else if (ev.tipo === 'erro') {
                ativar(ev.agenteId, 'erro', 7000);
                falar(ev.agenteId, ev.texto);
                linha(nomeDe.get(ev.agenteId) || ev.agenteId, ev.texto, 'erro');
            }
        }
    }, [eventos, ativar, falar, linha, nomeDe]);

    // Fila do telão: um aviso por vez. (Dois efeitos: um avança a fila, outro expira o aviso —
    // com um só, a limpeza do efeito cancelava o próprio temporizador e o aviso ficava preso.)
    useEffect(() => {
        if (takeover || fila.length === 0) return;
        const [prox, ...resto] = fila;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- avanço de fila disparado por mudança de estado
        setTakeover(prox);
        setFila(resto);
    }, [fila, takeover]);
    useEffect(() => {
        if (!takeover) return;
        const t = setTimeout(() => setTakeover(null), DUR_TAKEOVER);
        return () => clearTimeout(t);
    }, [takeover]);

    // Feed do telão: ações locais por cima do feed real.
    const linhasTelao: LinhaFeed[] = useMemo(() => {
        const reais: LinhaFeed[] = dados.feed.slice(0, 10).map((f, i) => ({
            id: `r-${f.agenteId}-${f.em}-${i}`, hora: horaBRT(f.em), agente: f.agenteNome, texto: f.frase, repeticoes: f.repeticoes,
            tom: f.status === 'erro' ? 'erro' : f.status === 'aguardando' ? 'espera' : f.status === 'rodando' ? 'rodando' : 'ok',
        }));
        return [...linhas, ...reais];
    }, [linhas, dados.feed]);

    // Escala do palco: cabe na largura e na altura da janela.
    const caixa = useRef<HTMLDivElement>(null);
    const [escala, setEscala] = useState(0.6);
    useLayoutEffect(() => {
        const ajustar = () => {
            const w = caixa.current?.clientWidth ?? window.innerWidth;
            setEscala(Math.max(0.3, Math.min(w / W, (window.innerHeight - (tv ? 60 : cabecalho ? 70 : 230)) / H)));
        };
        ajustar();
        window.addEventListener('resize', ajustar);
        return () => window.removeEventListener('resize', ajustar);
    }, [cabecalho, tv]);

    const estadoVisual = (a: AgenteVisao): EstadoAgente => {
        const o = ativos[a.id];
        return o && o.ate > tick ? o.estado : a.estado;
    };
    const luz = dados.maestro.luzAcesa || luzExtra > tick;
    const fluxoAtivo = (id: string) => estadoVisual(dados.agentes.find(x => x.id === id)!) === 'trabalhando';
    const m = dados.maestro;

    return (
        <div ref={caixa} className="w-full flex flex-col items-center select-none">
            <style>{CSS}</style>
            {cabecalho && <header className="w-full flex items-center justify-between px-2 pb-2 text-white" style={{ maxWidth: W * escala }}>
                <div className="flex items-center gap-3">
                    <h1 className="text-[22px] font-black leading-none">Central dos Agentes</h1>
                    <span className="flex items-center gap-1.5 text-[12px] text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400 pulso" />ao vivo</span>
                    {rotuloModo && <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">{rotuloModo}</span>}
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                    <span className="flex items-center gap-1.5 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 font-black text-emerald-200"><Power size={13} /> IA geral {m.iaGeral === 'desligado' ? 'DESLIGADA' : 'LIGADA'}</span>
                    <span className="text-white/60">hoje: <b className="text-white">{dolar(m.custoHojeUsd)}</b> de IA</span>
                </div>
            </header>}

            <div style={{ width: W * escala, height: H * escala }} className="relative">
                <div style={{ width: W, height: H, transform: `scale(${escala})`, transformOrigin: 'top left' }} className="absolute left-0 top-0 overflow-hidden rounded-[28px]">
                    {/* piso */}
                    <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(70% 60% at 50% 70%,#141420,#07070b 75%)' }} />
                    <div aria-hidden className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '50px 50px', maskImage: 'radial-gradient(70% 70% at 50% 65%,#000,transparent)' }} />

                    {/* entrada da loja */}
                    <div className="absolute rounded-3xl border border-white/10 overflow-hidden" style={{ left: ENTRADA.x, top: ENTRADA.y, width: ENTRADA.w, height: ENTRADA.h, background: 'linear-gradient(160deg,#10131c,#0a0b10)' }}>
                        <span className="absolute left-4 top-3 text-[12px] font-black tracking-[0.3em] text-white/40">ENTRADA DA LOJA</span>
                        <div className="absolute right-6 top-10 bottom-0 w-[96px] rounded-t-xl border-x-2 border-t-2 border-sky-300/30" style={{ background: 'linear-gradient(180deg,#38bdf81f,#38bdf808)' }}>
                            <span className="absolute inset-x-0 top-2 text-center text-[10px] tracking-widest text-sky-200/60">MANOS</span>
                        </div>
                        <div className="absolute left-0 right-0 bottom-0 h-[56px]" style={{ background: 'linear-gradient(180deg,transparent,#ffffff0a)' }} />
                        <AnimatePresence>
                            {visitante && (
                                <motion.div key={visitante.id} className="absolute bottom-6" initial={{ left: -50, opacity: 0 }} animate={{ left: [-50, 150, 232], opacity: [0, 1, 1] }} exit={{ opacity: 0 }} transition={{ duration: 4.6, ease: 'easeInOut' }}>
                                    <svg width="46" height="96" viewBox="0 0 46 96"><circle cx="23" cy="14" r="11" fill="#e0b08a" /><path d="M10 28 Q23 22 36 28 L38 70 L8 70Z" fill="#111827" /><rect x="10" y="70" width="10" height="24" rx="3" fill="#1f2937" /><rect x="26" y="70" width="10" height="24" rx="3" fill="#1f2937" /></svg>
                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-600 px-2.5 py-0.5 text-[13px] font-black text-white">{visitante.nome}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* sala da direção */}
                    <div className="absolute rounded-3xl border border-sky-300/20 overflow-hidden" style={{ left: SALA_DIRECAO.x, top: SALA_DIRECAO.y, width: SALA_DIRECAO.w, height: SALA_DIRECAO.h, background: 'linear-gradient(160deg,#0e1a26aa,#0a0c12)' }}>
                        <span className="absolute left-4 top-3 text-[12px] font-black tracking-[0.3em] text-sky-200/45">DIREÇÃO</span>
                        <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(115deg,transparent 40%,#ffffff0d 48%,transparent 56%)' }} />
                    </div>

                    {/* faixas dos setores */}
                    {ARCOS.filter(x => x.id !== 'direcao').map(x => (
                        <span key={x.id} className="absolute text-[12px] font-black tracking-[0.3em] text-white/35" style={{ left: x.id === 'atendimento' ? 40 : 1086, top: 322 }}>{x.nome.toUpperCase()}</span>
                    ))}

                    {/* ligações entre agentes e o centro */}
                    <svg className="absolute inset-0" width={W} height={H} aria-hidden>
                        <ellipse cx={ANEL.cx} cy={ANEL.cy} rx={ANEL.rx} ry={ANEL.ry} fill="#0f0f16" stroke="#ffffff1f" strokeWidth="2" />
                        <ellipse cx={ANEL.cx} cy={ANEL.cy} rx={ANEL.rx - 26} ry={ANEL.ry - 18} fill="none" stroke="#ffffff10" strokeWidth="1.5" strokeDasharray="4 8" />
                        {dados.agentes.map(a => {
                            const p = centro(a.id);
                            const on = fluxoAtivo(a.id);
                            const alvoX = p.x < HUB.x ? ANEL.cx - ANEL.rx + 6 : ANEL.cx + ANEL.rx - 6;
                            return <path key={a.id} d={`M${p.x < HUB.x ? p.x + 116 : p.x - 116} ${p.y} Q${(p.x + alvoX) / 2} ${p.y + 40} ${alvoX} ${HUB.y}`} fill="none" stroke={on ? '#34d399' : '#ffffff12'} strokeWidth={on ? 2.4 : 1.4} strokeDasharray={on ? '8 8' : undefined} className={on ? 'fluxo' : ''} opacity={on ? 0.85 : 1} />;
                        })}
                    </svg>

                    {/* telão */}
                    <div className="absolute" style={{ left: TELAO.x, top: TELAO.y, width: TELAO.w, height: TELAO.h }}>
                        <Telao dados={dados} painel={painel} linhas={linhasTelao} takeover={takeover} />
                    </div>
                    <div aria-hidden className="absolute rounded-full" style={{ left: TELAO.x + 40, top: TELAO.y + TELAO.h + 4, width: TELAO.w - 80, height: 18, background: 'radial-gradient(closest-side,#dc262655,transparent)' }} />

                    {/* maestro no centro */}
                    <div className="absolute flex flex-col items-center" style={{ left: HUB.x - 130, top: HUB.y - 96, width: 260 }}>
                        <div className="relative">
                            {luz && <span aria-hidden className="absolute -inset-3 rounded-full ring-4 ring-red-500/50 pulso" />}
                            <div className="relative h-[108px] w-[108px] rounded-full flex flex-col items-center justify-center" style={{ background: 'radial-gradient(circle at 30% 25%,#7f1d1d,#1a0a0c 70%)', border: `2.5px solid ${luz ? '#ef4444' : '#ffffff26'}`, boxShadow: luz ? '0 0 40px -4px #ef4444aa' : undefined }}>
                                <Crown size={20} className="text-amber-300" />
                                <span className="text-[44px] leading-none font-black text-white">A</span>
                            </div>
                        </div>
                        <p className="mt-2 text-[18px] font-black leading-none text-white">Alexandre</p>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 font-bold">Maestro</p>
                        <div className="mt-2 flex gap-1.5 flex-wrap justify-center">
                            <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[12px] font-bold text-white/80">{m.aprovacoes} aprovações</span>
                            <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[12px] font-bold text-white/80">{m.conversasSemDono} sem dono</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${m.alertas ? 'bg-red-600/30 text-red-200' : 'bg-white/[0.07] text-white/80'}`}>{m.alertas} alertas</span>
                        </div>
                        {onFila && <button type="button" onClick={onFila} className={`mt-2 px-4 py-1.5 rounded-xl text-[13px] font-black ${luz ? 'bg-red-600 text-white' : 'bg-white/10 text-white/80'}`}>Abrir fila de decisões</button>}
                    </div>

                    {/* mesas */}
                    {dados.agentes.map(a => {
                        const f = falas[a.id];
                        return <Mesa key={a.id} a={a} estado={estadoVisual(a)} fala={f && f.ate > tick ? f.texto : undefined} agora={agora} onAbrir={onAbrirAgente} />;
                    })}

                    {/* pacotes de lead viajando */}
                    <AnimatePresence>
                        {pacotes.map(p => (
                            <motion.div key={p.id} className="absolute z-40 pointer-events-none" style={{ left: 0, top: 0 }}
                                initial={{ x: p.de.x, y: p.de.y, opacity: 0, scale: 0.6 }}
                                animate={{ x: [p.de.x, (p.de.x + p.para.x) / 2, p.para.x], y: [p.de.y, Math.min(p.de.y, p.para.y) - 70, p.para.y], opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.7] }}
                                transition={{ duration: 1.7, ease: 'easeInOut' }}
                                onAnimationComplete={() => setPacotes(v => v.filter(x => x.id !== p.id))}>
                                <span className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] font-black text-[#1a1203]" style={{ background: p.cor, boxShadow: `0 0 22px 4px ${p.cor}aa` }}>✉ {p.rotulo}</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
