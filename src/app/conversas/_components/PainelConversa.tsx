'use client';

import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, IdCard, Loader2, MessageCircle, Phone } from 'lucide-react';
import { SeloQualificacao } from '@/components/qualificacao/SeloQualificacao';
import {
    agruparPorDia, resumoMensagem, separarReacoes, telefoneExibicao, telefoneLink,
    type ConversaDetalhe,
} from '@/lib/whatsapp/conversasView';
import { Bolha } from './Bolha';
import type { UrlMidia } from './Midias';

export function PainelConversa({ detalhe, carregando, carregandoAntigas, erro, agora, url, onVoltar, onAbrirFicha, onCarregarAntigas, mostrarBotaoFicha, ensaio, rodape }: {
    detalhe: ConversaDetalhe | null;
    carregando: boolean;
    carregandoAntigas: boolean;
    erro: string | null;
    agora: Date;
    url: UrlMidia;
    onVoltar: () => void;
    onAbrirFicha: () => void;
    onCarregarAntigas: () => void;
    /** Abaixo de xl a ficha abre numa gaveta; em xl ela fica na coluna da direita. */
    mostrarBotaoFicha: boolean;
    /** Gestor/admin: aba "Ensaio da Laura" (rascunho do CRM × resposta enviada). */
    ensaio?: ReactNode;
    /** Responder pelo CRM + Assumir/Devolver (aparece com NEXT_PUBLIC_WA_ENVIO=true). */
    rodape?: ReactNode;
}) {
    const rolagem = useRef<HTMLDivElement | null>(null);
    const fim = useRef<HTMLDivElement | null>(null);
    const ultimoId = useRef<string | null>(null);
    const conversaId = detalhe?.conversa.id ?? null;
    // aba guardada por conversa: trocar de conversa volta para "Conversa"
    const [abaEnsaioDe, setAbaEnsaioDe] = useState<string | null>(null);
    const verEnsaio = Boolean(ensaio) && abaEnsaioDe !== null && abaEnsaioDe === conversaId;

    const { grupos, reacoes, citadasNaPagina } = useMemo(() => {
        const msgs = detalhe?.mensagens || [];
        const { visiveis, reacoes } = separarReacoes(msgs);
        const porProvider = new Map(msgs.map(m => [m.providerId, m]));
        return { grupos: agruparPorDia(visiveis, agora), reacoes, citadasNaPagina: porProvider };
    }, [detalhe, agora]);

    // Abre no fim da conversa; mensagem nova também leva ao fim.
    const ultimaMsg = detalhe?.mensagens[detalhe.mensagens.length - 1]?.id ?? null;
    useLayoutEffect(() => {
        if (!ultimaMsg || ultimaMsg === ultimoId.current) return;
        const primeira = ultimoId.current === null;
        ultimoId.current = ultimaMsg;
        fim.current?.scrollIntoView({ block: 'end', behavior: primeira ? 'auto' : 'smooth' });
    }, [ultimaMsg, verEnsaio]);
    useEffect(() => { ultimoId.current = null; }, [conversaId]);

    if (!detalhe) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
                {carregando
                    ? <Loader2 size={24} className="animate-spin text-white/40" />
                    : erro
                        ? <p className="text-sm text-red-200">{erro}</p>
                        : (
                            <div>
                                <MessageCircle size={32} className="mx-auto text-white/25 mb-3" />
                                <p className="text-white/60 font-bold">Escolha uma conversa</p>
                                <p className="text-[13px] text-white/40 mt-1">As mensagens do cliente, da Laura e dos vendedores aparecem aqui.</p>
                            </div>
                        )}
            </div>
        );
    }

    const c = detalhe.conversa;
    const tel = telefoneLink(c.telefoneKey);
    return (
        <div className="flex flex-col md:h-full min-w-0">
            {/* Cabeçalho */}
            <header className="flex items-center gap-2 px-1 md:px-4 py-2 md:py-3 border-b border-white/[0.06] bg-[#0B0B0F]">
                <button type="button" onClick={onVoltar} aria-label="Voltar para a lista" className="md:hidden h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-white/70 active:scale-95">
                    <ArrowLeft size={20} />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-black text-white">{c.nome || telefoneExibicao(c.telefoneKey)}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/55">
                        <span className="tabular-nums">{telefoneExibicao(c.telefoneKey)}</span>
                        {c.selo && <SeloQualificacao selo={c.selo} compact />}
                        {c.status === 'ia' && <span className="flex items-center gap-1 text-violet-200"><Bot size={12} /> IA atendendo</span>}
                        {c.vendedorNome && <span>· {c.vendedorNome.split(' ')[0]}</span>}
                    </div>
                </div>
                {tel && (
                    <a href={`tel:+${tel}`} aria-label="Ligar para o cliente" className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/70 active:scale-95">
                        <Phone size={18} />
                    </a>
                )}
                {mostrarBotaoFicha && (
                    <button type="button" onClick={onAbrirFicha} aria-label="Ficha do lead" className="xl:hidden h-11 w-11 shrink-0 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/70 active:scale-95">
                        <IdCard size={18} />
                    </button>
                )}
            </header>

            {ensaio && (
                <div className="mx-1 md:mx-4 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1" role="tablist" aria-label="Ver conversa ou ensaio">
                    {([['conversa', 'Conversa'], ['ensaio', 'Ensaio da Laura']] as const).map(([k, rot]) => {
                        const ativa = k === 'ensaio' ? verEnsaio : !verEnsaio;
                        return (
                            <button
                                key={k}
                                type="button"
                                role="tab"
                                aria-selected={ativa}
                                onClick={() => {
                                    // voltando para a conversa: rola de novo até a última mensagem
                                    if (k === 'conversa') ultimoId.current = null;
                                    setAbaEnsaioDe(k === 'ensaio' ? conversaId : null);
                                }}
                                className={`min-h-[40px] rounded-lg text-[12px] font-black ${ativa ? 'bg-white text-black' : 'text-white/60'}`}
                            >
                                {k === 'ensaio' && <Bot size={12} className="inline mr-1 -mt-0.5" />}{rot}
                            </button>
                        );
                    })}
                </div>
            )}

            {verEnsaio ? (
                <div className="md:flex-1 md:overflow-y-auto px-1 md:px-4 py-3">{ensaio}</div>
            ) : (<>
            {/* Aviso: tela só de leitura nesta etapa */}
            {!rodape && <div className="mx-1 md:mx-4 mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/45">
                Só leitura por enquanto: a Laura segue atendendo pelo WhatsApp da loja. Responder por aqui vem na próxima etapa.
            </div>}

            {/* Mensagens */}
            <div ref={rolagem} className="md:flex-1 md:overflow-y-auto px-1 md:px-4 py-3 space-y-4">
                {detalhe.temMais && (
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={onCarregarAntigas}
                            disabled={carregandoAntigas}
                            className="min-h-[40px] rounded-full bg-white/[0.06] px-4 text-[12px] font-bold text-white/70 disabled:opacity-50"
                        >
                            {carregandoAntigas ? 'Carregando…' : 'Carregar mensagens anteriores'}
                        </button>
                    </div>
                )}

                {grupos.map(g => (
                    <section key={g.dia} aria-label={g.dia} className="space-y-3">
                        <div className="sticky top-0 z-[1] flex justify-center">
                            <span className="rounded-full bg-[#1A1A20] px-3 py-1 text-[11px] font-bold text-white/55">{g.dia}</span>
                        </div>
                        {g.mensagens.map(m => {
                            const alvo = m.citadaId ? citadasNaPagina.get(m.citadaId) : null;
                            const citada = m.citadaId
                                ? (alvo ? { autor: alvo.autor, resumo: resumoMensagem(alvo, 120) } : detalhe.citadas[m.citadaId] ?? null)
                                : undefined;
                            return (
                                <div key={m.id} className={reacoes[m.providerId]?.length ? 'pb-2' : ''}>
                                    <Bolha m={m} nomeContato={c.nome} reacoes={reacoes[m.providerId]} citada={citada} url={url} />
                                </div>
                            );
                        })}
                    </section>
                ))}

                {detalhe.mensagens.length === 0 && (
                    <p className="text-center text-[13px] text-white/40 py-10">Nenhuma mensagem nesta conversa ainda.</p>
                )}
                <div ref={fim} />
            </div>
            {rodape}
            </>)}
        </div>
    );
}
