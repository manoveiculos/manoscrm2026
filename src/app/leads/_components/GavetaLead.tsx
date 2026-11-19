'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, MessageCircle, CalendarPlus, ExternalLink, Loader2, Bot, User, Store, ArrowRight } from 'lucide-react';
import { ALL_STATUS, normalizeStatus } from '@/constants/status';
import { formatarTelefoneBR } from '@/lib/telefone';
import type { Lead, LeadStatus } from '@/lib/types';
import type { LinhaFicha, MensagemView, SituacaoView } from '@/lib/leads/resumo';

interface Resumo {
    lead: { uid: string | null; nome: string; telefone: string | null; interesse: string | null; origem: string | null; status: string | null; criadoEm: string | null; consultorNome: string | null; fichaCompleta: boolean };
    conversa: { id: string; status: string; ultimaMensagemEm: string | null } | null;
    situacao: SituacaoView | null;
    ficha: LinhaFicha[];
    falta: string[];
    mensagens: MensagemView[];
}

const quando = (iso: string | null | undefined) => {
    if (!iso) return '';
    const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.floor(min / 60)} h`;
    return `há ${Math.floor(min / 1440)} d`;
};

const DE = {
    cliente: { nome: 'Cliente', icone: User, cls: 'bg-zinc-800 text-zinc-100' },
    laura: { nome: 'Laura', icone: Bot, cls: 'bg-emerald-900/40 text-emerald-100 border border-emerald-700/30' },
    vendedor: { nome: 'Vendedor', icone: Store, cls: 'bg-blue-900/40 text-blue-100 border border-blue-700/30' },
} as const;

/**
 * Gaveta de resumo do lead (aba Leads): clicou no lead, vê na hora onde ele está, o que já disse,
 * as últimas mensagens e as ações. Substitui o painel antigo de 7 abas para o clique simples.
 */
export function GavetaLead({ lead, onClose, onStatusChange }: {
    lead: Lead;
    onClose: () => void;
    onStatusChange: (leadId: string, status: LeadStatus) => void;
}) {
    const [r, setR] = useState<Resumo | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        setR(null); setErro(null);
        fetch(`/api/leads/resumo?id=${encodeURIComponent(lead.id)}`, { cache: 'no-store' })
            .then(x => x.json())
            .then(j => { if (!vivo) return; if (j.success) setR(j); else setErro(j.error || 'não foi possível carregar'); })
            .catch(() => vivo && setErro('sem conexão'));
        return () => { vivo = false; };
    }, [lead.id]);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    const uid = r?.lead.uid;
    const nome = r?.lead.nome || lead.name || 'Sem nome';
    const tel = r?.lead.telefone || lead.phone || '';
    const etapa = normalizeStatus(r?.lead.status || lead.status);
    const agendar = `/agenda?novo=1&nome=${encodeURIComponent(nome)}&tel=${encodeURIComponent(tel)}&veiculo=${encodeURIComponent(r?.lead.interesse || lead.vehicle_interest || '')}${uid ? `&lead=${encodeURIComponent(uid)}` : ''}`;
    const btn = 'min-h-[44px] rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 px-3 active:scale-95 transition';

    return (
        <div className="fixed inset-0 z-[200] flex justify-end" role="dialog" aria-label={`Resumo de ${nome}`}>
            <button aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={onClose} />
            <aside className="relative w-full max-w-md h-full bg-zinc-950 border-l border-white/10 overflow-y-auto shadow-2xl">
                <header className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-white/10 p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-white truncate">{nome}</h2>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            {tel ? formatarTelefoneBR(tel) : 'sem telefone'}
                            {r?.lead.origem ? ` · ${r.lead.origem}` : ''}
                            {r?.lead.consultorNome ? ` · ${r.lead.consultorNome}` : ''}
                            {r?.lead.criadoEm ? ` · lead ${quando(r.lead.criadoEm).replace('há ', 'de ')}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10" aria-label="Fechar"><X className="w-5 h-5" /></button>
                </header>

                <div className="p-4 space-y-5">
                    {!r && !erro && <p className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando resumo…</p>}
                    {erro && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{erro}</p>}

                    {r && (
                        <>
                            <section>
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">Onde está agora</h3>
                                {r.situacao ? (
                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                                        <p className="text-sm font-bold text-white">{r.situacao.rotulo}</p>
                                        {r.situacao.resumo && <p className="text-sm text-zinc-300">{r.situacao.resumo}</p>}
                                        {r.situacao.proximaAcao && (
                                            <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2 flex gap-2">
                                                <ArrowRight className="w-4 h-4 shrink-0 mt-0.5" /> <span><b>Próximo passo:</b> {r.situacao.proximaAcao}</span>
                                            </p>
                                        )}
                                        {r.situacao.analisadaEm && <p className="text-[11px] text-zinc-500">Análise da IA {quando(r.situacao.analisadaEm)}{r.situacao.confianca === 'baixa' ? ' · confiança baixa' : ''}</p>}
                                    </div>
                                ) : (
                                    <p className="text-sm text-zinc-500">{r.conversa ? 'Ainda sem análise da conversa.' : 'Este lead ainda não conversou pelo WhatsApp da loja.'}</p>
                                )}
                            </section>

                            <section>
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">O que ele quer</h3>
                                {r.ficha.length || r.lead.interesse ? (
                                    <dl className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
                                        {(r.ficha.length ? r.ficha : [{ rotulo: 'Quer', valor: r.lead.interesse || '' }]).map(l => (
                                            <div key={l.rotulo} className="flex gap-3 px-3 py-2 text-sm"><dt className="w-20 shrink-0 text-zinc-500">{l.rotulo}</dt><dd className="text-zinc-100 min-w-0 break-words">{l.valor}</dd></div>
                                        ))}
                                    </dl>
                                ) : <p className="text-sm text-zinc-500">Nada anotado ainda.</p>}
                                {r.conversa && r.falta.length > 0 && <p className="text-xs text-zinc-400 mt-2">Falta perguntar: {r.falta.join(', ')}.</p>}
                            </section>

                            <section>
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">Últimas mensagens</h3>
                                {r.mensagens.length ? (
                                    <ul className="space-y-2">
                                        {r.mensagens.map((m, i) => {
                                            const d = DE[m.de]; const Icone = d.icone;
                                            return (
                                                <li key={i} className={`rounded-xl px-3 py-2 text-sm ${d.cls}`}>
                                                    <p className="text-[11px] opacity-70 flex items-center gap-1.5 mb-0.5"><Icone className="w-3 h-3" /> {d.nome} · {quando(m.quando)}</p>
                                                    <p className="break-words">{m.texto}</p>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : <p className="text-sm text-zinc-500">Sem mensagens registradas.</p>}
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">Ações</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {r.conversa
                                        ? <Link href={`/conversas?c=${r.conversa.id}`} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white col-span-2`}><MessageCircle className="w-4 h-4" /> Responder no WhatsApp</Link>
                                        : tel && <a href={`https://wa.me/${tel.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white col-span-2`}><MessageCircle className="w-4 h-4" /> Chamar no WhatsApp</a>}
                                    <Link href={agendar} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-100`}><CalendarPlus className="w-4 h-4" /> Agendar visita</Link>
                                    {uid && r.lead.fichaCompleta && <Link href={`/lead/${encodeURIComponent(uid)}`} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-100`}><ExternalLink className="w-4 h-4" /> Ficha completa</Link>}
                                </div>
                                <label className="block">
                                    <span className="text-xs text-zinc-400">Etapa</span>
                                    <select
                                        value={etapa}
                                        onChange={e => { onStatusChange(lead.id, e.target.value as LeadStatus); }}
                                        className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                                    >
                                        {ALL_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </label>
                            </section>
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}
