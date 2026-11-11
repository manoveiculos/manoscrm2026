'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { ROTULO_FIM, resumoDaPassagem, type Passagem } from '@/lib/whatsapp/passagens';

const fmt = (iso: string) => new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));

/**
 * Todas as passagens do cliente pelo WhatsApp da loja, da mais recente para a mais antiga.
 * Some se o cliente nunca falou com a loja pelo CRM.
 */
export function PassagensCard({ uid, className = '' }: { uid: string; className?: string }) {
    const [dados, setDados] = useState<{ total: number; passagens: Passagem[] } | null>(null);
    const [todas, setTodas] = useState(false);

    useEffect(() => {
        let vivo = true;
        fetch(`/api/lead/passagens?uid=${encodeURIComponent(uid)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (vivo && d?.success) setDados({ total: d.total, passagens: d.passagens }); })
            .catch(() => { /* informativo */ });
        return () => { vivo = false; };
    }, [uid]);

    if (!dados || !dados.passagens.length) return null;
    const lista = todas ? dados.passagens : dados.passagens.slice(0, 3);
    return (
        <div className={`bg-sky-500/[0.06] border border-sky-500/20 rounded-xl px-4 py-3 ${className}`}>
            <p className="flex items-center gap-2 text-[11px] font-bold text-sky-300 uppercase tracking-widest mb-2">
                <History size={14} /> Passagens pelo WhatsApp da loja · {dados.total}
            </p>
            <ol className="space-y-2.5">
                {lista.map((p, i) => (
                    <li key={p.inicio} className="text-[12px] leading-relaxed text-white/75 border-l-2 border-sky-400/30 pl-3">
                        <p className="font-bold text-white/90">
                            {fmt(p.inicio)}{i === 0 && <span className="ml-2 rounded-full bg-sky-400/20 px-1.5 py-px text-[10px] text-sky-200">última</span>}
                        </p>
                        <p className="text-white/55">{resumoDaPassagem(p)}</p>
                        {p.primeiraDoCliente && <p className="text-white/75">Cliente: “{p.primeiraDoCliente}”</p>}
                        {p.ultimaDoCliente && <p className="text-white/50">Depois: “{p.ultimaDoCliente}”</p>}
                        <p className={p.fimTipo === 'cliente_sem_resposta' ? 'text-amber-300' : 'text-white/45'}>
                            {ROTULO_FIM[p.fimTipo]}{p.horasSemResposta != null ? ` há ${p.horasSemResposta >= 48 ? `${Math.round(p.horasSemResposta / 24)} dias` : `${p.horasSemResposta} h`}` : ''}
                        </p>
                    </li>
                ))}
            </ol>
            {dados.passagens.length > 3 && (
                <button type="button" onClick={() => setTodas(v => !v)} className="mt-2 min-h-[36px] text-[12px] font-bold text-sky-200">
                    {todas ? 'Mostrar menos' : `Ver todas (${dados.passagens.length})`}
                </button>
            )}
        </div>
    );
}
