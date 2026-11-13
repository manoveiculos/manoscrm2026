'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft, FileText } from 'lucide-react';
import { PassagensCard } from './PassagensCard';

const MARCADOR_FICHA = 'FICHA IA';

/**
 * Separa o que está em handoff_summary:
 *  - ficha da rotina da IA (começa com "FICHA IA — atualizado em …")
 *  - briefing de redistribuição (/api/lead/handoff-brief), que fica ACIMA da
 *    ficha quando os dois existem.
 */
export function separarFicha(texto: string | null | undefined): { briefing: string | null; ficha: string | null } {
    const t = (texto || '').trim();
    if (!t) return { briefing: null, ficha: null };
    const pos = t.indexOf(MARCADOR_FICHA);
    if (pos < 0) return { briefing: t, ficha: null };
    const briefing = t.slice(0, pos).trim() || null;
    return { briefing, ficha: t.slice(pos).trim() };
}

/**
 * Ficha da IA (antes do atendimento) + briefing de passagem, se houver.
 * A conversa vendedor ↔ cliente não fica registrada no CRM, então a ficha é o
 * que o vendedor precisa ler ANTES de chamar o cliente.
 */
export function FichaIACard({ uid, className = '' }: { uid: string; className?: string }) {
    const [texto, setTexto] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        fetch(`/api/lead/ficha?uid=${encodeURIComponent(uid)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (vivo && d?.success) setTexto(d.texto || null); })
            .catch(() => { /* informativo */ });
        return () => { vivo = false; };
    }, [uid]);

    const { briefing, ficha } = separarFicha(texto);
    // As passagens têm busca própria (a conversa do WhatsApp); o resto vem do handoff_summary.
    if (!briefing && !ficha) return <PassagensCard uid={uid} className={className} />;

    return (
        <div className={`space-y-2 ${className}`}>
            <PassagensCard uid={uid} />
            {briefing && (
                <div className="bg-cyan-500/[0.06] border border-cyan-500/20 rounded-xl px-4 py-3 flex gap-3">
                    <ArrowRightLeft size={14} className="text-cyan-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold text-cyan-300 uppercase tracking-widest mb-1">Briefing de passagem</p>
                        <p className="text-[12px] text-white/70 leading-relaxed whitespace-pre-line">{briefing}</p>
                    </div>
                </div>
            )}
            {ficha && (
                <div className="bg-violet-500/[0.06] border border-violet-500/25 rounded-xl px-4 py-3 flex gap-3">
                    <FileText size={14} className="text-violet-300 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-violet-200 uppercase tracking-widest mb-1">Ficha da IA (antes do atendimento)</p>
                        <div className="text-[12px] text-white/80 leading-relaxed whitespace-pre-line break-words max-h-80 overflow-y-auto pr-1">
                            {ficha}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
