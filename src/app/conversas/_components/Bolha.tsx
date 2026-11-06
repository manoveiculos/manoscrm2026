'use client';

import { Bot, Check, CheckCheck, CircleAlert, Megaphone, Pencil, Reply } from 'lucide-react';
import {
    horaCurta, ladoDoBalao, resumoMensagem, rotuloAutor,
    type Autor, type MensagemView,
} from '@/lib/whatsapp/conversasView';
import { Contatos, Localizacao, MidiaAudio, MidiaDocumento, MidiaImagem, MidiaVideo, type UrlMidia } from './Midias';

const COR_AUTOR: Record<Autor, string> = {
    cliente: 'bg-[#1C1C24] border-white/[0.08]',
    laura: 'bg-violet-950/60 border-violet-500/25',
    vendedor: 'bg-emerald-950/60 border-emerald-500/25',
    sistema: 'bg-zinc-900 border-zinc-600/40',
};

const COR_ROTULO: Record<Autor, string> = {
    cliente: 'text-sky-300',
    laura: 'text-violet-300',
    vendedor: 'text-emerald-300',
    sistema: 'text-zinc-400',
};

function StatusEntrega({ s }: { s: MensagemView['statusEntrega'] }) {
    if (s === 'lida') return <CheckCheck size={13} className="text-sky-400" aria-label="Lida" />;
    if (s === 'entregue') return <CheckCheck size={13} className="text-white/45" aria-label="Entregue" />;
    if (s === 'enviada') return <Check size={13} className="text-white/45" aria-label="Enviada" />;
    if (s === 'falhou') return <CircleAlert size={13} className="text-red-400" aria-label="Não enviada" />;
    return null;
}

export function Bolha({ m, nomeContato, reacoes, citada, url }: {
    m: MensagemView;
    nomeContato: string | null;
    reacoes?: string[];
    /** Resumo da mensagem respondida (quando o cliente/Laura citou outra mensagem). */
    citada?: { autor: Autor; resumo: string } | null;
    url: UrlMidia;
}) {
    const lado = ladoDoBalao(m);
    const apagada = Boolean(m.apagadaEm);
    const reacaoSolta = m.tipo === 'reacao';

    return (
        <div className={`flex ${lado === 'direita' ? 'justify-end' : 'justify-start'}`}>
            <div className={`relative max-w-[86%] md:max-w-[70%] rounded-2xl border px-3 py-2 ${COR_AUTOR[m.autor]} ${lado === 'direita' ? 'rounded-tr-md' : 'rounded-tl-md'}`}>
                <p className={`text-[11px] font-black flex items-center gap-1 ${COR_ROTULO[m.autor]}`}>
                    {m.autor === 'laura' && <Bot size={12} />}
                    {m.autor === 'sistema' && <Megaphone size={12} />}
                    {rotuloAutor(m.autor, nomeContato)}
                </p>

                {citada !== undefined && m.citadaId && !reacaoSolta && (
                    <div className="mt-1 rounded-lg border-l-2 border-white/30 bg-black/25 px-2 py-1">
                        <p className="text-[10px] font-bold text-white/50 flex items-center gap-1"><Reply size={10} /> {citada ? rotuloAutor(citada.autor, nomeContato) : 'Mensagem anterior'}</p>
                        <p className="text-[12px] text-white/70 line-clamp-2">{citada ? citada.resumo : 'Mensagem de antes do CRM gravar a conversa.'}</p>
                    </div>
                )}

                <div className="mt-1 space-y-1.5">
                    {/* Apagada para todos: igual ao WhatsApp, a tela não mostra o conteúdo
                        (ele continua guardado no banco para auditoria). */}
                    {apagada
                        ? <p className="text-[13px] italic text-white/45">🚫 Mensagem apagada</p>
                        : <Conteudo m={m} url={url} />}
                </div>

                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/40">
                    {m.editadaEm && <span className="flex items-center gap-0.5"><Pencil size={9} /> editada</span>}
                    <span className="tabular-nums">{horaCurta(m.criadaEm)}</span>
                    {m.direcao === 'out' && <StatusEntrega s={m.statusEntrega} />}
                </div>

                {reacoes && reacoes.length > 0 && (
                    <div className={`absolute -bottom-3 ${lado === 'direita' ? 'left-2' : 'right-2'} rounded-full border border-white/10 bg-[#111116] px-1.5 py-0.5 text-[12px] leading-none`}>
                        {reacoes.join('')}
                    </div>
                )}
            </div>
        </div>
    );
}

function Conteudo({ m, url }: { m: MensagemView; url: UrlMidia }) {
    switch (m.tipo) {
        case 'imagem':
            return (<><MidiaImagem m={m} url={url} />{m.legenda && <Texto t={m.legenda} />}</>);
        case 'figurinha':
            return <MidiaImagem m={m} url={url} figurinha />;
        case 'audio':
            return <MidiaAudio m={m} url={url} />;
        case 'video':
            return (<><MidiaVideo m={m} url={url} />{m.legenda && <Texto t={m.legenda} />}</>);
        case 'documento':
            return (<><MidiaDocumento m={m} url={url} />{m.legenda && <Texto t={m.legenda} />}</>);
        case 'localizacao':
            return <Localizacao m={m} />;
        case 'contato':
            return <Contatos m={m} />;
        case 'reacao':
            return <p className="text-[13px] text-white/70">{resumoMensagem(m)} <span className="text-white/40">(a uma mensagem anterior)</span></p>;
        default:
            return <Texto t={m.texto || ''} />;
    }
}

function Texto({ t }: { t: string }) {
    return <p className="text-[14px] leading-snug text-white whitespace-pre-wrap break-words">{t}</p>;
}
