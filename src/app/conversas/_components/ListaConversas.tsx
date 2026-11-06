'use client';

import { useMemo, useState } from 'react';
import { Bot, Loader2, MessagesSquare, RefreshCw, Search, UserRound } from 'lucide-react';
import { SeloQualificacao } from '@/components/qualificacao/SeloQualificacao';
import {
    FILTROS, aguardandoResposta, contarFiltros, filtrarConversas, quandoNaLista, rotuloAutor, telefoneExibicao,
    type ConversaItem, type FiltroConversa,
} from '@/lib/whatsapp/conversasView';

export function ListaConversas({ conversas, selecionada, carregando, erro, gestao, agora, onSelecionar, onAtualizar }: {
    conversas: ConversaItem[] | null;
    selecionada: string | null;
    carregando: boolean;
    erro: string | null;
    /** Gestor/admin vê todas e o nome do vendedor de cada uma. */
    gestao: boolean;
    agora: Date;
    onSelecionar: (id: string) => void;
    onAtualizar: () => void;
}) {
    const [filtro, setFiltro] = useState<FiltroConversa>('todas');
    const [busca, setBusca] = useState('');
    const lista = useMemo(() => filtrarConversas(conversas || [], filtro, busca), [conversas, filtro, busca]);
    const contagem = useMemo(() => contarFiltros(conversas || []), [conversas]);

    return (
        <div className="flex flex-col md:h-full">
            <div className="px-1 md:px-4 pt-1 md:pt-5 pb-3 space-y-3 md:border-b md:border-white/[0.06]">
                <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black text-white tracking-tight">Conversas</h1>
                        <p className="text-[12px] text-white/45 mt-0.5">
                            {gestao ? 'Todas as conversas do WhatsApp da loja' : 'Seus clientes no WhatsApp da loja'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onAtualizar}
                        aria-label="Atualizar conversas"
                        className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/60 active:scale-95"
                    >
                        {carregando ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    </button>
                </div>

                <label className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 h-11">
                    <Search size={16} className="text-white/40 shrink-0" />
                    <input
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar nome, carro ou telefone"
                        className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder:text-white/35 outline-none"
                        aria-label="Buscar conversa"
                    />
                </label>

                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]" role="tablist" aria-label="Filtrar conversas">
                    {FILTROS.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            role="tab"
                            aria-selected={filtro === f.id}
                            onClick={() => setFiltro(f.id)}
                            className={`h-9 shrink-0 rounded-full px-3 text-[12px] font-bold border transition ${filtro === f.id
                                ? 'bg-white text-black border-white'
                                : 'bg-white/[0.04] text-white/70 border-white/[0.08]'}`}
                        >
                            {f.label}
                            {f.id !== 'todas' && contagem[f.id] > 0 && (
                                <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${filtro === f.id ? 'bg-black/10' : 'bg-white/10'}`}>{contagem[f.id]}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {erro && (
                <div className="mx-1 md:mx-4 my-3 rounded-2xl border border-red-500/40 bg-red-600/10 px-4 py-3 text-sm text-red-200">
                    Não consegui carregar as conversas: {erro}
                </div>
            )}

            <div className="md:flex-1 md:overflow-y-auto">
                {carregando && !conversas && (
                    <div className="space-y-2 px-1 md:px-4 py-3">
                        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[72px] rounded-2xl bg-white/[0.03] animate-pulse" />)}
                    </div>
                )}

                {conversas && lista.length === 0 && (
                    <div className="mx-1 md:mx-4 my-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-10 text-center">
                        <MessagesSquare size={28} className="mx-auto text-white/40 mb-3" />
                        <p className="text-white font-black">{conversas.length ? 'Nada neste filtro.' : 'Nenhuma conversa ainda.'}</p>
                        <p className="text-[13px] text-white/50 mt-1">
                            {conversas.length ? 'Troque o filtro ou limpe a busca.' : 'Quando um cliente seu escrever para o WhatsApp da loja, a conversa aparece aqui.'}
                        </p>
                    </div>
                )}

                <ul className="divide-y divide-white/[0.05]">
                    {lista.map(c => {
                        const ativa = c.id === selecionada;
                        const esperando = aguardandoResposta(c);
                        return (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelecionar(c.id)}
                                    aria-current={ativa ? 'true' : undefined}
                                    className={`w-full text-left px-2 md:px-4 py-3 flex gap-3 min-h-[72px] transition ${ativa ? 'bg-white/[0.07]' : 'active:bg-white/[0.05] md:hover:bg-white/[0.03]'}`}
                                >
                                    <div className="h-11 w-11 shrink-0 rounded-full bg-white/[0.06] flex items-center justify-center text-white/60">
                                        <UserRound size={20} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className={`truncate text-[14px] ${c.naoLidas > 0 ? 'font-black text-white' : 'font-bold text-white/90'}`}>
                                                {c.nome || telefoneExibicao(c.telefoneKey)}
                                            </p>
                                            <span className={`ml-auto shrink-0 text-[11px] ${c.naoLidas > 0 ? 'text-emerald-300 font-bold' : 'text-white/40'}`}>
                                                {quandoNaLista(c.ultimaEm, agora)}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2">
                                            <p className="truncate text-[12px] text-white/55 flex-1">
                                                {c.ultima
                                                    ? <>{c.ultima.autor === 'laura' && <Bot size={11} className="inline mr-1 -mt-0.5 text-violet-300" />}{c.ultima.autor !== 'cliente' && c.ultima.autor !== 'laura' ? `${rotuloAutor(c.ultima.autor)}: ` : ''}{c.ultima.resumo}</>
                                                    : 'Sem mensagens'}
                                            </p>
                                            {c.naoLidas > 0 && (
                                                <span className="shrink-0 min-w-[20px] h-5 rounded-full bg-emerald-500 px-1.5 text-[11px] font-black text-black flex items-center justify-center" aria-label={`${c.naoLidas} não lidas`}>
                                                    {c.naoLidas}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            {c.selo && <SeloQualificacao selo={c.selo} compact />}
                                            {c.status === 'ia' && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-200">IA atendendo</span>}
                                            {c.status === 'humano' && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">Com vendedor</span>}
                                            {esperando && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">Cliente esperando</span>}
                                            {c.carro && <span className="truncate max-w-[140px] text-[10px] text-white/45">🚗 {c.carro}</span>}
                                            {gestao && <span className="text-[10px] text-white/40">{c.vendedorNome ? `· ${c.vendedorNome.split(' ')[0]}` : '· sem vendedor'}</span>}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
