'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, ShieldCheck } from 'lucide-react';
import { formatarTelefoneBR, normalizarTelefoneBR } from '@/lib/telefone';

const CHAVE_ADIAR = 'manos:telefone:adiado';

/**
 * Tela obrigatória: todo login confirma o próprio WhatsApp antes de usar o CRM.
 *   1. digita o número com DDD → o CRM manda um código de 6 dígitos pelo número da loja;
 *   2. digita o código → o número fica salvo (55+DDD+número) e a tela some para sempre.
 * Não dá para fechar. Só existe "confirmar depois" quando o próprio envio falha
 * (WhatsApp da loja fora do ar), e vale só para esta sessão do navegador.
 */
export function ConfirmarTelefone() {
    const [precisa, setPrecisa] = useState(false);
    const [passo, setPasso] = useState<'numero' | 'codigo' | 'pronto'>('numero');
    const [numero, setNumero] = useState('');
    const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
    const [codigo, setCodigo] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [podeAdiar, setPodeAdiar] = useState(false);
    const [espera, setEspera] = useState(0); // segundos até poder pedir outro código

    useEffect(() => {
        let vivo = true;
        try { if (sessionStorage.getItem(CHAVE_ADIAR) === '1') return; } catch { /* sem sessionStorage: segue */ }
        fetch('/api/perfil/telefone', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then(d => {
                if (!vivo || !d?.success || !d.precisa) return;
                setNumero(d.telefone ? formatarTelefoneBR(d.telefone) : '');
                setPrecisa(true);
            })
            .catch(() => { /* sem rede: não trava o CRM */ });
        return () => { vivo = false; };
    }, []);

    useEffect(() => {
        if (espera <= 0) return;
        const t = setTimeout(() => setEspera(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [espera]);

    if (!precisa) return null;

    const chamar = async (corpo: Record<string, unknown>) => {
        setOcupado(true); setErro(null);
        try {
            const r = await fetch('/api/perfil/telefone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.success) { setErro(j.error || 'Não foi possível. Tente de novo.'); setPodeAdiar(Boolean(j.podeAdiar)); return null; }
            setPodeAdiar(false);
            return j as Record<string, unknown>;
        } catch {
            setErro('Sem conexão. Tente de novo.'); setPodeAdiar(true);
            return null;
        } finally { setOcupado(false); }
    };

    const valido = normalizarTelefoneBR(numero);
    const enviar = async () => {
        if (!valido || ocupado) return;
        const j = await chamar({ acao: 'enviar', telefone: valido });
        if (!j) return;
        setEnviadoPara(String(j.telefone)); setCodigo(''); setPasso('codigo'); setEspera(60);
    };
    const confirmar = async () => {
        if (codigo.length !== 6 || ocupado) return;
        const j = await chamar({ acao: 'confirmar', codigo });
        if (!j) return;
        setPasso('pronto');
        setTimeout(() => setPrecisa(false), 1800);
    };
    const adiar = () => { try { sessionStorage.setItem(CHAVE_ADIAR, '1'); } catch { /* segue */ } setPrecisa(false); };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="tel-titulo" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-3xl border border-white/[0.1] bg-[#0F0F14] p-6 shadow-2xl">
                {passo === 'pronto' ? (
                    <div className="text-center py-6">
                        <ShieldCheck size={40} className="mx-auto text-emerald-400 mb-3" />
                        <p className="text-lg font-black text-white">Número confirmado</p>
                        <p className="text-[13px] text-white/55 mt-1">Os avisos do CRM vão chegar nesse WhatsApp.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="h-11 w-11 shrink-0 rounded-2xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center"><MessageCircle size={22} /></span>
                            <div>
                                <h2 id="tel-titulo" className="text-lg font-black text-white leading-tight">Confirme seu WhatsApp</h2>
                                <p className="text-[12px] text-white/50">É por ele que o CRM te avisa de lead novo e cliente esperando.</p>
                            </div>
                        </div>

                        {passo === 'numero' && (
                            <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} className="space-y-3">
                                <label className="block">
                                    <span className="block text-[11px] font-bold uppercase tracking-widest text-white/45 mb-1.5">Seu número, com DDD</span>
                                    <input
                                        type="tel" inputMode="tel" autoComplete="tel" autoFocus
                                        value={numero} onChange={(e) => setNumero(e.target.value)}
                                        placeholder="(47) 98846-7855"
                                        className="w-full min-h-[52px] rounded-2xl bg-white/[0.05] border border-white/[0.1] px-4 text-[18px] font-bold text-white placeholder:text-white/25 outline-none focus:border-emerald-400/60"
                                    />
                                </label>
                                <p className="text-[12px] text-white/45 min-h-[18px]">
                                    {numero.trim() && !valido ? 'Digite o DDD e o número completo.' : valido ? `Vai ficar salvo como ${valido}` : ''}
                                </p>
                                <button type="submit" disabled={!valido || ocupado} className="w-full min-h-[52px] rounded-2xl bg-emerald-500 text-black text-[15px] font-black flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40">
                                    {ocupado ? <Loader2 size={18} className="animate-spin" /> : null} Enviar código pelo WhatsApp
                                </button>
                            </form>
                        )}

                        {passo === 'codigo' && (
                            <form onSubmit={(e) => { e.preventDefault(); void confirmar(); }} className="space-y-3">
                                <p className="text-[13px] text-white/70">Mandamos um código de 6 números para <strong className="text-white">{formatarTelefoneBR(enviadoPara)}</strong>. Ele chega pelo WhatsApp da loja.</p>
                                <input
                                    type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
                                    value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000" aria-label="Código de 6 números"
                                    className="w-full min-h-[60px] rounded-2xl bg-white/[0.05] border border-white/[0.1] px-4 text-center text-[28px] font-black tracking-[0.4em] text-white placeholder:text-white/15 outline-none focus:border-emerald-400/60"
                                />
                                <button type="submit" disabled={codigo.length !== 6 || ocupado} className="w-full min-h-[52px] rounded-2xl bg-emerald-500 text-black text-[15px] font-black flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40">
                                    {ocupado ? <Loader2 size={18} className="animate-spin" /> : null} Confirmar
                                </button>
                                <div className="flex items-center justify-between text-[12px]">
                                    <button type="button" onClick={() => { setPasso('numero'); setErro(null); }} className="min-h-[40px] font-bold text-white/60">Trocar o número</button>
                                    <button type="button" disabled={espera > 0 || ocupado} onClick={() => void enviar()} className="min-h-[40px] font-bold text-emerald-300 disabled:text-white/30">
                                        {espera > 0 ? `Reenviar em ${espera}s` : 'Reenviar código'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {erro && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-100">{erro}</p>}
                        {podeAdiar && (
                            <button type="button" onClick={adiar} className="mt-3 w-full min-h-[44px] rounded-2xl bg-white/[0.06] text-[13px] font-bold text-white/70">
                                Continuar agora e confirmar depois
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
