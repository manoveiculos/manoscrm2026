'use client';

import { useState } from 'react';
import { Bot, Loader2, Send, UserRound } from 'lucide-react';

/**
 * Responder pelo CRM, no número da loja, e Assumir / Devolver para a IA.
 * Só aparece com NEXT_PUBLIC_WA_ENVIO=true (a API também exige WA_ENVIO_PELO_CRM=true).
 * Responder já assume a conversa: a Laura para.
 */
export function Compositor({ conversaId, status, onAtualizar }: {
    conversaId: string;
    status: 'ia' | 'humano' | 'encerrada';
    onAtualizar: () => void;
}) {
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const chamar = async (url: string, corpo: unknown): Promise<boolean> => {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) { setErro(j.error || 'não foi possível'); return false; }
        setErro(null);
        return true;
    };

    const enviar = async () => {
        const t = texto.trim();
        if (!t || enviando) return;
        setEnviando(true);
        const ok = await chamar(`/api/wa/conversas/${conversaId}/enviar`, { texto: t });
        setEnviando(false);
        if (ok) { setTexto(''); onAtualizar(); }
    };

    const mudar = async (acao: 'assumir' | 'devolver') => {
        setEnviando(true);
        const ok = await chamar(`/api/wa/conversas/${conversaId}/atendimento`, { acao });
        setEnviando(false);
        if (ok) onAtualizar();
    };

    if (status === 'encerrada') return null;
    return (
        <div className="border-t border-white/[0.06] bg-[#0B0B0F] px-2 md:px-4 py-2 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-white/55">
                {status === 'ia'
                    ? <span className="flex items-center gap-1 text-violet-200"><Bot size={12} /> Laura atendendo</span>
                    : <span className="flex items-center gap-1 text-emerald-200"><UserRound size={12} /> Atendimento humano</span>}
                <button
                    type="button"
                    disabled={enviando}
                    onClick={() => mudar(status === 'ia' ? 'assumir' : 'devolver')}
                    className="ml-auto min-h-[36px] rounded-xl bg-white/[0.06] px-3 text-[12px] font-black text-white/80 active:scale-95 disabled:opacity-50"
                >
                    {status === 'ia' ? 'Assumir' : 'Devolver para a IA'}
                </button>
            </div>
            <div className="flex items-end gap-2">
                <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
                    rows={1}
                    maxLength={4000}
                    placeholder="Responder pelo número da loja…"
                    aria-label="Mensagem"
                    className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 py-2.5 text-[14px] text-white placeholder:text-white/35 outline-none"
                />
                <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={enviando || !texto.trim()}
                    aria-label="Enviar"
                    className="h-11 w-11 shrink-0 rounded-xl bg-emerald-500 text-black flex items-center justify-center active:scale-95 disabled:opacity-40"
                >
                    {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
            </div>
            {erro && <p className="text-[11px] text-red-200">{erro}</p>}
        </div>
    );
}
