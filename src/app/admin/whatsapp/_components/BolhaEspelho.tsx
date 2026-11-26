'use client';

import { ImageOff, Pencil, Reply } from 'lucide-react';
import { horaCurta, resumoMensagem, type MensagemView } from '@/lib/whatsapp/conversasView';
import { Contatos, Localizacao, MidiaAudio, MidiaDocumento, MidiaImagem, MidiaVideo, type UrlMidia } from '@/app/conversas/_components/Midias';

export const urlMidiaEspelho: UrlMidia = (id, download) => `/api/espelho-wa/midia/${id}${download ? '?download=1' : ''}`;

/**
 * Balão do espelho (só leitura). Recebida à esquerda (nome do contato),
 * enviada pelo número espelhado à direita. Mensagem apagada continua visível,
 * marcada, porque o espelho existe para análise.
 */
export function BolhaEspelho({ m, nomeContato, nomeNumero, reacoes, citada }: {
    m: MensagemView;
    nomeContato: string;
    nomeNumero: string;
    reacoes?: string[];
    citada?: { direcao: 'in' | 'out'; resumo: string } | null;
}) {
    const saiu = m.direcao === 'out';
    const reacaoSolta = m.tipo === 'reacao';
    return (
        <div className={`flex ${saiu ? 'justify-end' : 'justify-start'}`}>
            <div className={`relative max-w-[86%] md:max-w-[70%] rounded-2xl border px-3 py-2 ${saiu
                ? 'bg-emerald-950/60 border-emerald-500/25 rounded-tr-md'
                : 'bg-[#1C1C24] border-white/[0.08] rounded-tl-md'}`}>
                <p className={`text-[11px] font-black ${saiu ? 'text-emerald-300' : 'text-sky-300'}`}>
                    {saiu ? nomeNumero : nomeContato}
                </p>

                {m.citadaId && !reacaoSolta && citada !== undefined && (
                    <div className="mt-1 rounded-lg border-l-2 border-white/30 bg-black/25 px-2 py-1">
                        <p className="text-[10px] font-bold text-white/50 flex items-center gap-1">
                            <Reply size={10} /> {citada ? (citada.direcao === 'out' ? nomeNumero : nomeContato) : 'Mensagem anterior'}
                        </p>
                        <p className="text-[12px] text-white/70 line-clamp-2">{citada ? citada.resumo : 'Mensagem fora do histórico salvo.'}</p>
                    </div>
                )}

                <div className="mt-1 space-y-1.5">
                    {m.apagadaEm && <p className="text-[11px] font-bold text-red-300/80">🚫 Apagada no WhatsApp</p>}
                    <div className={m.apagadaEm ? 'opacity-60' : ''}><Conteudo m={m} /></div>
                </div>

                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/40">
                    {m.editadaEm && <span className="flex items-center gap-0.5"><Pencil size={9} /> editada</span>}
                    <span className="tabular-nums">{horaCurta(m.criadaEm)}</span>
                </div>

                {reacoes && reacoes.length > 0 && (
                    <div className={`absolute -bottom-3 ${saiu ? 'left-2' : 'right-2'} rounded-full border border-white/10 bg-[#111116] px-1.5 py-0.5 text-[12px] leading-none`}>
                        {reacoes.join('')}
                    </div>
                )}
            </div>
        </div>
    );
}

const COM_MIDIA = new Set(['imagem', 'figurinha', 'audio', 'video', 'documento']);

/** Mídia que o WhatsApp já não tem mais (antiga) ou grande demais para guardar. */
function SemMidia({ m }: { m: MensagemView }) {
    const texto = m.midiaErro === 'acima_do_limite' ? 'Arquivo grande demais: não foi guardado' : 'Mídia não está mais disponível no WhatsApp';
    return (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-white/55">
            <ImageOff size={14} className="shrink-0" /> {texto}
        </div>
    );
}

function Conteudo({ m }: { m: MensagemView }) {
    const url = urlMidiaEspelho;
    if (COM_MIDIA.has(m.tipo) && !m.temMidia) {
        return (<><SemMidia m={m} />{m.legenda && <Texto t={m.legenda} />}</>);
    }
    switch (m.tipo) {
        case 'imagem': return (<><MidiaImagem m={m} url={url} />{m.legenda && <Texto t={m.legenda} />}</>);
        case 'figurinha': return <MidiaImagem m={m} url={url} figurinha />;
        case 'audio': return <MidiaAudio m={m.transcricao ? m : { ...m, midiaExpirada: true }} url={url} />;
        case 'video': return (<><MidiaVideo m={m} url={url} />{m.legenda && <Texto t={m.legenda} />}</>);
        case 'documento': return (<><MidiaDocumento m={m} url={url} />{m.legenda && <Texto t={m.legenda} />}</>);
        case 'localizacao': return <Localizacao m={m} />;
        case 'contato': return <Contatos m={m} />;
        case 'reacao': return <p className="text-[13px] text-white/70">{resumoMensagem(m)} <span className="text-white/40">(a uma mensagem anterior)</span></p>;
        default: return <Texto t={m.texto || ''} />;
    }
}

function Texto({ t }: { t: string }) {
    return <p className="text-[14px] leading-snug text-white whitespace-pre-wrap break-words">{t}</p>;
}
