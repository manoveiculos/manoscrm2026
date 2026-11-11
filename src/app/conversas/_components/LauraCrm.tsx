'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, CalendarCheck, Camera, Loader2, Power, RefreshCw, ShieldAlert, UserRoundCheck } from 'lucide-react';
import {
    ROTULO_FERRAMENTA, ROTULO_VIOLACAO, dolares, segundos,
    type ResumoEnsaio, type RodadaEnsaio,
} from '@/lib/whatsapp/ia/ensaioView';
import { quandoNaLista } from '@/lib/whatsapp/conversasView';

/**
 * Laura do CRM na tela Conversas (gestor/admin):
 *   BarraLauraCrm  — modo da IA (ensaio | desligada), botão do admin e números do dia;
 *   EnsaioDaConversa — lado a lado: o que foi enviado × o rascunho do CRM.
 * Os componentes *View só desenham; a prévia (/dev/conversas) usa dados fictícios.
 */

export interface DadosBarraIa {
    podeMudar: boolean;
    config: {
        modo: 'desligada' | 'ensaio' | 'envia';
        modoGravado: 'desligada' | 'ensaio' | 'envia';
        motivo: string | null;
        ativaNoServidor: boolean;
        envioLiberado?: boolean;
    };
    resumo: ResumoEnsaio | null;
}

export function BarraLauraCrmView({ dados, salvando, erro, onMudar, prontidao }: {
    dados: DadosBarraIa | null;
    salvando: boolean;
    erro: string | null;
    onMudar: (modo: 'ensaio' | 'desligada' | 'envia') => void;
    prontidao?: ReactNode;
}) {
    if (!dados) {
        return erro
            ? <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-white/50">Laura do CRM: {erro}</p>
            : null;
    }
    const { config, resumo, podeMudar } = dados;
    const ligada = config.modoGravado === 'ensaio' || config.modoGravado === 'envia';
    const efetivo = config.modo;
    return (
        <section aria-label="Laura do CRM" className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2">
                <Bot size={16} className="text-violet-200 shrink-0" />
                <p className="text-[13px] font-black text-white whitespace-nowrap">Laura do CRM</p>
                <span
                    title={efetivo === 'ensaio' ? 'Escreve o rascunho e não envia nada ao cliente' : undefined}
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${efetivo === 'desligada' ? 'bg-white/[0.08] text-white/55' : 'bg-violet-400/25 text-violet-100'}`}
                >
                    {efetivo === 'ensaio' ? 'Ensaio' : efetivo === 'envia' ? 'Enviando' : 'Desligada'}
                </span>
                {podeMudar && (
                    <button
                        type="button"
                        onClick={() => onMudar(ligada ? 'desligada' : 'ensaio')}
                        disabled={salvando}
                        aria-pressed={ligada}
                        className={`ml-auto shrink-0 whitespace-nowrap min-h-[36px] rounded-xl px-3 text-[12px] font-black flex items-center gap-1.5 active:scale-95 disabled:opacity-50 ${ligada ? 'bg-white/[0.08] text-white/80' : 'bg-violet-500 text-white'}`}
                    >
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                        {ligada ? 'Desligar' : 'Ligar ensaio'}
                    </button>
                )}
            </div>
            {podeMudar && config.modoGravado === 'ensaio' && config.envioLiberado && (
                <button
                    type="button"
                    disabled={salvando}
                    onClick={() => { if (window.confirm('Ligar o envio? A Laura vai responder os clientes DE VERDADE pelo WhatsApp da loja.')) onMudar('envia'); }}
                    className="w-full min-h-[40px] rounded-xl bg-emerald-500 text-black text-[12px] font-black active:scale-95 disabled:opacity-50"
                >
                    Ligar envio ao cliente
                </button>
            )}
            {config.motivo && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-200/90">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>{config.ativaNoServidor ? config.motivo : 'Falta WA_IA_ATIVA=true no servidor: o botão fica gravado, mas a IA não roda.'}</span>
                </p>
            )}
            {resumo && resumo.rodadas + resumo.puladas > 0 ? (
                <p className="text-[11px] text-white/60 tabular-nums">
                    {efetivo === 'ensaio' && 'Nada vai ao cliente. '}Hoje: {resumo.ok} rascunho{resumo.ok === 1 ? '' : 's'}
                    {resumo.barradas > 0 && <> · <span className="text-amber-200">{resumo.barradas} barrado{resumo.barradas === 1 ? '' : 's'} pelo filtro</span></>}
                    {resumo.erro > 0 && <> · <span className="text-red-200">{resumo.erro} erro{resumo.erro === 1 ? '' : 's'}</span></>}
                    {' '}· {segundos(resumo.tempoMedioMs)} em média · {dolares(resumo.custoPorConversaUsd)} por conversa
                </p>
            ) : (
                <p className="text-[11px] text-white/45">Nenhuma rodada hoje ainda.</p>
            )}
            {erro && <p className="text-[11px] text-red-200">{erro}</p>}
            {prontidao}
        </section>
    );
}

export function BarraLauraCrm() {
    const [dados, setDados] = useState<DadosBarraIa | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await fetch('/api/wa/ia/config', { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j.error || 'indisponível');
            setDados({ podeMudar: j.podeMudar, config: j.config, resumo: j.resumo });
            setErro(null);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'indisponível');
        }
    }, []);

    useEffect(() => {
        void carregar();
        const t = setInterval(() => { void carregar(); }, 60_000);
        return () => clearInterval(t);
    }, [carregar]);

    const mudar = async (modo: 'ensaio' | 'desligada' | 'envia') => {
        setSalvando(true);
        try {
            const r = await fetch('/api/wa/ia/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modo }),
            });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j.error || 'não gravou');
            await carregar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'não gravou');
        } finally {
            setSalvando(false);
        }
    };

    return <BarraLauraCrmView dados={dados} salvando={salvando} erro={erro} onMudar={mudar} prontidao={dados?.podeMudar ? <PainelProntidao /> : null} />;
}

// ---------------------------------------------------------------------------
// Lado a lado
// ---------------------------------------------------------------------------

function Coluna({ titulo, tom, children }: { titulo: string; tom: 'real' | 'rascunho'; children: ReactNode }) {
    return (
        <div className={`rounded-xl border px-3 py-2 min-w-0 ${tom === 'real' ? 'border-white/[0.08] bg-white/[0.03]' : 'border-violet-400/25 bg-violet-500/[0.07]'}`}>
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${tom === 'real' ? 'text-white/45' : 'text-violet-200/80'}`}>{titulo}</p>
            {children}
        </div>
    );
}

function CartaoRodada({ r, agora }: { r: RodadaEnsaio; agora: Date }) {
    const ferramentas = [...new Set(r.ferramentas.map(f => ROTULO_FERRAMENTA[f.nome] || f.nome))];
    return (
        <article className="rounded-2xl border border-white/[0.06] bg-[#111116] p-3 space-y-2">
            <div>
                <p className="text-[11px] text-white/45">Cliente · {r.gatilho ? quandoNaLista(r.gatilho.em, agora) : quandoNaLista(r.iniciadaEm, agora)}</p>
                <p className="text-[13px] text-white/85 whitespace-pre-wrap break-words">{r.gatilho?.texto || '—'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Coluna titulo="Enviado de verdade" tom="real">
                    {r.reais.length ? r.reais.map((m, i) => (
                        <p key={i} className="text-[13px] text-white/80 whitespace-pre-wrap break-words">
                            {m.autor === 'vendedor' && <span className="text-[10px] font-bold text-emerald-200/80 mr-1">vendedor:</span>}
                            {m.texto}
                        </p>
                    )) : <p className="text-[12px] text-white/40">Ninguém respondeu ainda.</p>}
                </Coluna>
                <Coluna titulo="Rascunho do CRM" tom="rascunho">
                    {r.status === 'rodando' && <p className="flex items-center gap-1.5 text-[12px] text-white/55"><Loader2 size={12} className="animate-spin" /> Pensando…</p>}
                    {r.status === 'ok' && <p className="text-[13px] text-white/90 whitespace-pre-wrap break-words">{r.rascunho}</p>}
                    {(r.status === 'erro' || r.status === 'abandonada') && <p className="text-[12px] text-red-200">Não gerou: {r.motivo || r.status}</p>}
                </Coluna>
            </div>

            {r.violacoes.length > 0 && (
                <details className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2">
                    <summary className="cursor-pointer text-[12px] font-bold text-amber-100 flex items-center gap-1.5">
                        <ShieldAlert size={13} /> Filtro barrou: {r.violacoes.map(v => ROTULO_VIOLACAO[v] || v).join(', ')}
                    </summary>
                    {r.original && <p className="mt-1.5 text-[12px] text-amber-50/80 whitespace-pre-wrap break-words">A IA tinha escrito: {r.original}</p>}
                </details>
            )}

            <div className="flex flex-wrap gap-1.5 text-[11px] text-white/55 tabular-nums">
                <span className="rounded-full bg-white/[0.05] px-2 py-0.5">{segundos(r.tempoMs)}</span>
                <span className="rounded-full bg-white/[0.05] px-2 py-0.5">{dolares(r.custoUsd)}</span>
                {ferramentas.length > 0 && <span className="rounded-full bg-white/[0.05] px-2 py-0.5">{ferramentas.join(' · ')}</span>}
                {r.fotos.map((f, i) => (
                    <span key={i} className="rounded-full bg-white/[0.05] px-2 py-0.5 flex items-center gap-1"><Camera size={11} /> {f.quantidade} foto{f.quantidade === 1 ? '' : 's'} · {f.carro}</span>
                ))}
                {r.agendamento && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 flex items-center gap-1"><CalendarCheck size={11} /> {r.agendamento.rotulo}</span>}
                {r.passagem && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 flex items-center gap-1" title={r.passagem.resumo}><UserRoundCheck size={11} /> passou ao consultor</span>}
            </div>
        </article>
    );
}

export function CartoesEnsaio({ rodadas, carregando, erro, agora, onAtualizar }: {
    rodadas: RodadaEnsaio[] | null;
    carregando: boolean;
    erro: string | null;
    agora: Date;
    onAtualizar: () => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <p className="text-[12px] text-white/55 flex-1">
                    Ensaio: a Laura do CRM escreve o que mandaria, mas <strong className="text-white/75">nada vai para o cliente</strong>.
                </p>
                <button type="button" onClick={onAtualizar} aria-label="Atualizar ensaio" className="h-10 w-10 shrink-0 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/60 active:scale-95">
                    {carregando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                </button>
            </div>
            {erro && <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-100">{erro}</p>}
            {rodadas && rodadas.length === 0 && !carregando && (
                <p className="text-center text-[13px] text-white/40 py-8">Nenhuma rodada da Laura do CRM nesta conversa ainda.</p>
            )}
            {(rodadas || []).map(r => <CartaoRodada key={r.id} r={r} agora={agora} />)}
        </div>
    );
}

export function EnsaioDaConversa({ conversaId, agora }: { conversaId: string; agora: Date }) {
    const [rodadas, setRodadas] = useState<RodadaEnsaio[] | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await fetch(`/api/wa/ia/execucoes?conversa=${encodeURIComponent(conversaId)}`, { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j.error || 'indisponível');
            setRodadas(j.rodadas);
            setErro(null);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'indisponível');
        } finally {
            setCarregando(false);
        }
    }, [conversaId]);

    // o pai monta com key={conversaId}: trocar de conversa recomeça do zero
    useEffect(() => { void carregar(); }, [carregar]);

    return <CartoesEnsaio rodadas={rodadas} carregando={carregando} erro={erro} agora={agora} onAtualizar={() => void carregar()} />;
}

// ---------------------------------------------------------------------------
// Prontidão: o que falta para a Laura atender de verdade (só admin)
// ---------------------------------------------------------------------------

interface ItemPront { id: string; grupo: 'base' | 'troca' | 'opcional'; ok: boolean; titulo: string; como: string }

export function PainelProntidaoView({ itens, carregando, erro, onAtualizar }: {
    itens: ItemPront[] | null; carregando: boolean; erro: string | null; onAtualizar: () => void;
}) {
    const grupos: [ItemPront['grupo'], string][] = [['base', 'Base (ensaio e envio)'], ['troca', 'Dia da troca do n8n'], ['opcional', 'Opcional']];
    const falta = itens ? itens.filter(i => i.grupo === 'base' && !i.ok).length : 0;
    return (
        <details className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !itens) onAtualizar(); }}>
            <summary className="cursor-pointer text-[12px] font-bold text-white/80">
                Prontidão{itens && (falta ? <span className="ml-2 text-amber-200">{falta} item(ns) da base faltando</span> : <span className="ml-2 text-emerald-200">base ok</span>)}
            </summary>
            <div className="mt-2 space-y-2">
                {carregando && <Loader2 size={14} className="animate-spin text-white/50" />}
                {erro && <p className="text-[11px] text-red-200">{erro}</p>}
                {itens && grupos.map(([g, rotulo]) => (
                    <div key={g}>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">{rotulo}</p>
                        <ul className="space-y-1">
                            {itens.filter(i => i.grupo === g).map(i => (
                                <li key={i.id} className="text-[11px]">
                                    <span className={i.ok ? 'text-emerald-300' : 'text-amber-200'}>{i.ok ? '✓' : '✗'}</span>{' '}
                                    <span className="text-white/80">{i.titulo}</span>
                                    {!i.ok && <span className="block text-white/45 pl-4">{i.como}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                <button type="button" onClick={onAtualizar} className="text-[11px] font-bold text-white/60 underline">Conferir de novo</button>
            </div>
        </details>
    );
}

export function PainelProntidao() {
    const [itens, setItens] = useState<ItemPront[] | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await fetch('/api/wa/ia/prontidao', { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j.error || 'indisponível');
            setItens(j.itens);
            setErro(null);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'indisponível');
        } finally {
            setCarregando(false);
        }
    }, []);
    return <PainelProntidaoView itens={itens} carregando={carregando} erro={erro} onAtualizar={() => void carregar()} />;
}
