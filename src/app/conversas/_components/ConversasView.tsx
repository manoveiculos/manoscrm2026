'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/app/fila/_components/Sheet';
import type { ConversaDetalhe, ConversaItem } from '@/lib/whatsapp/conversasView';
import { ListaConversas } from './ListaConversas';
import { PainelConversa } from './PainelConversa';
import { FichaLead } from './FichaLead';
import { urlMidiaPadrao, type UrlMidia } from './Midias';

/**
 * Tela Conversas (Fase 3, leitura) — o WhatsApp da loja dentro do CRM.
 *   celular: lista → conversa → ficha (gaveta)
 *   desktop: lista | conversa | ficha (a ficha vira gaveta abaixo de 1280 px)
 * Componente só de apresentação: a página busca os dados; a prévia (/dev)
 * injeta dados fictícios.
 */
export function ConversasView({
    conversas, perfil, carregandoLista, erroLista,
    selecionada, detalhe, carregandoDetalhe, carregandoAntigas, erroDetalhe,
    onSelecionar, onAtualizar, onCarregarAntigas,
    urlMidia = urlMidiaPadrao, renderFicha, agoraFixo,
}: {
    conversas: ConversaItem[] | null;
    perfil: 'vendedor' | 'gestor' | 'admin' | null;
    carregandoLista: boolean;
    erroLista: string | null;
    selecionada: string | null;
    detalhe: ConversaDetalhe | null;
    carregandoDetalhe: boolean;
    carregandoAntigas: boolean;
    erroDetalhe: string | null;
    onSelecionar: (id: string | null) => void;
    onAtualizar: () => void;
    onCarregarAntigas: () => void;
    urlMidia?: UrlMidia;
    /** A prévia troca a ficha real (que busca dados) por uma fictícia. */
    renderFicha?: (c: ConversaItem) => ReactNode;
    agoraFixo?: number;
}) {
    const [fichaAberta, setFichaAberta] = useState(false);
    // relógio para "Hoje"/"Ontem" e horários da lista (fixo na prévia)
    const [agoraMs, setAgoraMs] = useState(() => agoraFixo ?? Date.now());
    useEffect(() => {
        if (agoraFixo) return;
        const t = setInterval(() => setAgoraMs(Date.now()), 60_000);
        return () => clearInterval(t);
    }, [agoraFixo]);
    const agora = useMemo(() => new Date(agoraMs), [agoraMs]);
    const gestao = perfil === 'admin' || perfil === 'gestor';
    const aberta = Boolean(selecionada);
    const conversa = detalhe?.conversa ?? null;
    const ficha = conversa ? (renderFicha ? renderFicha(conversa) : <FichaLead conversa={conversa} />) : null;

    return (
        <div className="w-full md:h-screen md:flex md:overflow-hidden">
            {/* Lista */}
            <aside className={`${aberta ? 'hidden' : 'block'} md:block md:w-[340px] lg:w-[380px] md:shrink-0 md:border-r md:border-white/[0.06] md:h-full`}>
                {!aberta && erroDetalhe && (
                    <div className="md:hidden mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">{erroDetalhe}</div>
                )}
                <ListaConversas
                    conversas={conversas}
                    selecionada={selecionada}
                    carregando={carregandoLista}
                    erro={erroLista}
                    gestao={gestao}
                    agora={agora}
                    onSelecionar={(id) => onSelecionar(id)}
                    onAtualizar={onAtualizar}
                />
            </aside>

            {/* Conversa */}
            <main className={`${aberta ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0 md:h-full -mx-4 md:mx-0`}>
                <PainelConversa
                    detalhe={selecionada ? detalhe : null}
                    carregando={carregandoDetalhe}
                    carregandoAntigas={carregandoAntigas}
                    erro={erroDetalhe}
                    agora={agora}
                    url={urlMidia}
                    onVoltar={() => onSelecionar(null)}
                    onAbrirFicha={() => setFichaAberta(true)}
                    onCarregarAntigas={onCarregarAntigas}
                    mostrarBotaoFicha={Boolean(conversa)}
                />
            </main>

            {/* Ficha (desktop largo) */}
            {conversa && (
                <aside className="hidden xl:block xl:w-[360px] xl:shrink-0 xl:border-l xl:border-white/[0.06] xl:h-full xl:overflow-y-auto p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-3">Ficha do lead</p>
                    {ficha}
                </aside>
            )}

            {/* Ficha (celular e tablet) */}
            <Sheet
                aberto={fichaAberta && Boolean(conversa)}
                titulo="Ficha do lead"
                subtitulo={conversa?.nome || null}
                onFechar={() => setFichaAberta(false)}
            >
                <div className="pb-4">{ficha}</div>
            </Sheet>
        </div>
    );
}
