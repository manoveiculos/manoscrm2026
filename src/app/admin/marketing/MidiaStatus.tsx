'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Clock, ChevronDown } from 'lucide-react';

/**
 * Status da mídia de uma pauta (Vitrine v2): Sucesso / Fallback aplicado /
 * Aguardando ativo — e o resumo do log estruturado (metrics.log_execucao).
 */

type Metrics = Record<string, any> | null | undefined;

const STYLE: Record<string, { label: string; cls: string; icon: any }> = {
    sucesso: { label: 'Mídia: sucesso', cls: 'text-emerald-400 bg-emerald-500/10', icon: CheckCircle2 },
    fallback_aplicado: { label: 'Mídia: fallback aplicado', cls: 'text-amber-400 bg-amber-500/10', icon: AlertTriangle },
    aguardando_ativo: { label: 'Mídia: aguardando ativo', cls: 'text-red-400 bg-red-500/10', icon: Clock },
};

export function statusMidia(metrics: Metrics): string | null {
    return (metrics?.status_midia as string) || (metrics?.log_execucao?.status_pauta as string) || null;
}

export function MidiaBadge({ metrics }: { metrics: Metrics }) {
    const s = statusMidia(metrics);
    if (!s || !STYLE[s]) return null;
    const { label, cls, icon: Icon } = STYLE[s];
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>
            <Icon className="w-2.5 h-2.5" /> {label}
        </span>
    );
}

export function LogResumo({ metrics }: { metrics: Metrics }) {
    const [open, setOpen] = useState(false);
    const log = metrics?.log_execucao;
    if (!log || typeof log !== 'object') return null;
    const fallbacks: any[] = Array.isArray(log.fallbacks) ? log.fallbacks : [];
    const solicitacoes: any[] = Array.isArray(log.solicitacoes) ? log.solicitacoes : [];
    const midia = log.midia || {};
    const registro = log.registro || {};
    return (
        <div className="mt-1.5">
            <div className="flex flex-wrap gap-1.5 items-center text-[10px] text-zinc-500">
                {midia.logo && <span>logo: {midia.logo}</span>}
                {midia.foto_real && <span>· foto: {String(midia.foto_real).replace(/_/g, ' ')}</span>}
                {typeof midia.imagens_publicadas === 'number' && <span>· {midia.imagens_publicadas}/{midia.imagens_geradas ?? '?'} imagens publicadas</span>}
                {registro.canal && <span>· registro: {registro.canal === 'api' ? 'API do CRM' : 'Supabase direto'}</span>}
                <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 text-blue-400 hover:underline">
                    log <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>
            {fallbacks.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                    {fallbacks.map((f, i) => (
                        <li key={i} className="text-[10px] text-amber-400/90 leading-snug">
                            ↳ {f.ativo}: {f.motivo}{f.aplicado ? ` → ${f.aplicado}` : ''}
                        </li>
                    ))}
                </ul>
            )}
            {solicitacoes.length > 0 && (
                <p className="text-[10px] text-violet-400 mt-1">Solicitação aberta ao Diretor de Arte ({solicitacoes.map((s) => s.tipo).join(', ')})</p>
            )}
            {open && (
                <pre className="mt-1.5 text-[10px] text-zinc-400 bg-black/40 border border-white/[0.06] rounded-lg p-2 overflow-x-auto max-h-64 custom-scrollbar">
                    {JSON.stringify(log, null, 2)}
                </pre>
            )}
        </div>
    );
}
