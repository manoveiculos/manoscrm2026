'use client';

import { useMemo, useState } from 'react';
import { SeloQualificacao } from '@/components/qualificacao/SeloQualificacao';
import { ConversasView } from '@/app/conversas/_components/ConversasView';
import type { UrlMidia } from '@/app/conversas/_components/Midias';
import type { ConversaItem } from '@/lib/whatsapp/conversasView';
import { BarraLauraCrmView, CartoesEnsaio } from '@/app/conversas/_components/LauraCrm';
import { AGORA_EXEMPLO, BARRA_IA_EXEMPLO, CONVERSAS_EXEMPLO, RODADAS_EXEMPLO, detalheExemplo } from './exemplo';

/** Foto fictícia desenhada na hora (sem arquivo, sem rede). */
function fotoSvg(texto: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3a46"/><stop offset="1" stop-color="#16161c"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><rect x="120" y="230" width="400" height="90" rx="30" fill="#8a8f98"/><rect x="190" y="180" width="250" height="70" rx="25" fill="#9aa0a8"/><circle cx="210" cy="325" r="38" fill="#111"/><circle cx="430" cy="325" r="38" fill="#111"/><text x="320" y="420" font-family="Arial" font-size="30" fill="#cfd3da" text-anchor="middle">${texto}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Áudio fictício: 1 s de tom, gerado em WAV. */
function audioWav(): string {
    const taxa = 8000, n = taxa;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / taxa) * 6000, true);
    let bin = '';
    new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); });
    return `data:audio/wav;base64,${btoa(bin)}`;
}

function FichaFicticia({ c }: { c: ConversaItem }) {
    return (
        <div className="space-y-3">
            <div className="min-h-[44px] rounded-xl bg-white text-black text-[13px] font-black flex items-center justify-center">Abrir perfil do lead</div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
                <div className="flex items-center gap-2">
                    {c.selo && <SeloQualificacao selo={c.selo} />}
                    <span className="text-[11px] text-white/40">(prévia — dados fictícios)</span>
                </div>
                {[['Carro de interesse', c.carro || '—'], ['Entrada', 'R$ 20.000'], ['Troca', 'Gol 2015'], ['Prazo', 'Este mês']].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 text-[13px]"><span className="text-white/50">{k}</span><span className="text-white font-bold text-right">{v}</span></div>
                ))}
            </div>
        </div>
    );
}

export function PreviewConversas({ vista, perfil }: { vista: 'lista' | 'conversa'; perfil: 'vendedor' | 'admin' }) {
    const [selecionada, setSelecionada] = useState<string | null>(vista === 'conversa' ? CONVERSAS_EXEMPLO[0].id : null);
    const detalhe = useMemo(() => detalheExemplo(), []);
    const midias = useMemo(() => ({ foto: fotoSvg('foto fictícia'), audio: audioWav() }), []);
    const conversas = perfil === 'admin' ? CONVERSAS_EXEMPLO : CONVERSAS_EXEMPLO.filter(c => c.vendedorId === 'v1');

    const url: UrlMidia = (id, download) => {
        const m = detalhe.mensagens.find(x => x.id === id);
        if (m?.tipo === 'audio') return midias.audio;
        if (m?.tipo === 'documento') return `data:text/plain;charset=utf-8,${encodeURIComponent('Documento fictício da prévia')}${download ? '' : ''}`;
        return midias.foto;
    };

    return (
        // mesma margem que o layout do app dá às telas no celular (p-4)
        <div className="w-full p-4 md:p-0 overflow-x-hidden">
        <ConversasView
            conversas={conversas}
            perfil={perfil}
            carregandoLista={false}
            erroLista={null}
            selecionada={selecionada}
            detalhe={selecionada === CONVERSAS_EXEMPLO[0].id ? detalhe : null}
            carregandoDetalhe={false}
            carregandoAntigas={false}
            erroDetalhe={null}
            onSelecionar={setSelecionada}
            onAtualizar={() => undefined}
            onCarregarAntigas={() => undefined}
            urlMidia={url}
            renderFicha={(c) => <FichaFicticia c={c} />}
            agoraFixo={AGORA_EXEMPLO}
            renderBarraIa={() => <BarraLauraCrmView dados={BARRA_IA_EXEMPLO} salvando={false} erro={null} onMudar={() => undefined} />}
            renderEnsaio={(_c, agora) => <CartoesEnsaio rodadas={RODADAS_EXEMPLO} carregando={false} erro={null} agora={agora} onAtualizar={() => undefined} />}
        />
        </div>
    );
}
