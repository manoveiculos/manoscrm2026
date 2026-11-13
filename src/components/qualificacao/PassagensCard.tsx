'use client';

import { useEffect, useState } from 'react';
import { Compass, History, Target } from 'lucide-react';
import { ROTULO_SITUACAO, type CodigoSituacao } from '@/lib/whatsapp/ia/analista';
import { ROTULO_FIM, resumoDaPassagem, type Passagem } from '@/lib/whatsapp/passagens';

const fmt = (iso: string) => new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));

/**
 * Todas as passagens do cliente pelo WhatsApp da loja, da mais recente para a mais antiga.
 * Some se o cliente nunca falou com a loja pelo CRM.
 */
interface SituacaoView { situacao: CodigoSituacao; resumo: string; proximaAcao: string; quando: string | null; confianca: string; analisadaEm: string | null; desatualizada: boolean }

interface ClassificacaoView {
    em: string; modo: 'ensaio' | 'grava'; categoria: 'comprador' | 'vendedor_de_carro' | 'outro'; selo: string; score: number | null; confianca: string;
    resumo: string | null; proximaAcao: string | null; motivoDoSelo: string | null; provas: { campo: string; valor: string | null; evidencia: string | null }[]; gravados: string[];
}

const ROTULO_SELO: Record<string, string> = { quente: '🔥 Quente', morno: '🌡️ Morno', fora_do_perfil: '⛔ Fora do perfil', sem_qualificacao: '❔ Sem qualificação' };
const ROTULO_CAT: Record<string, string> = { comprador: 'Quer comprar', vendedor_de_carro: 'Quer vender o carro dele', outro: 'Não é comprador' };
const ROTULO_CAMPO: Record<string, string> = { carro: 'Carro', entrada: 'Entrada', troca: 'Troca', prazo: 'Prazo' };

const dataBR = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}`; };

export function PassagensCard({ uid, className = '' }: { uid: string; className?: string }) {
    const [dados, setDados] = useState<{ total: number; passagens: Passagem[]; situacao: SituacaoView | null; classificacao: ClassificacaoView | null } | null>(null);
    const [todas, setTodas] = useState(false);

    useEffect(() => {
        let vivo = true;
        fetch(`/api/lead/passagens?uid=${encodeURIComponent(uid)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (vivo && d?.success) setDados({ total: d.total, passagens: d.passagens, situacao: d.situacao || null, classificacao: d.classificacao || null }); })
            .catch(() => { /* informativo */ });
        return () => { vivo = false; };
    }, [uid]);

    if (!dados || !dados.passagens.length) return null;
    const lista = todas ? dados.passagens : dados.passagens.slice(0, 3);
    const s = dados.situacao;
    const c = dados.classificacao;
    return (
        <div className={`space-y-2 ${className}`}>
        {c && (
            <div className="bg-violet-500/[0.06] border border-violet-500/20 rounded-xl px-4 py-3">
                <p className="flex items-center gap-2 text-[11px] font-bold text-violet-300 uppercase tracking-widest mb-1">
                    <Target size={14} /> Classificação da IA
                </p>
                <p className="text-[13px] font-bold text-white/90">
                    {c.categoria === 'comprador' ? (ROTULO_SELO[c.selo] || c.selo) : ROTULO_CAT[c.categoria]}{c.score != null && c.categoria === 'comprador' ? ` · ${c.score}/100` : ''}
                </p>
                {c.motivoDoSelo && c.categoria === 'comprador' && <p className="text-[12px] text-white/60">{c.motivoDoSelo}</p>}
                {c.resumo && <p className="text-[12px] text-white/70 leading-relaxed mt-1">{c.resumo}</p>}
                {c.provas.length > 0 && (
                    <ul className="mt-2 space-y-1">
                        {c.provas.map(p => (
                            <li key={p.campo} className="text-[12px] text-white/70">
                                <b className="text-white/90">{ROTULO_CAMPO[p.campo] || p.campo}:</b> {p.valor}
                                {p.evidencia && <span className="block text-[11px] text-white/40">cliente disse: “{p.evidencia}”</span>}
                            </li>
                        ))}
                    </ul>
                )}
                {c.proximaAcao && <p className="text-[12px] text-violet-200/90 mt-1.5">Próximo passo: {c.proximaAcao}</p>}
                <p className="text-[10px] text-white/35 mt-1">
                    {c.modo === 'ensaio' ? 'Teste: ainda não gravado no lead' : c.gravados.length ? `Preencheu no lead: ${c.gravados.map(k => ({ vehicle_interest: 'carro', valor_investimento: 'entrada', carro_troca: 'troca', prazo_compra: 'prazo' }[k] || k)).join(', ')}` : 'Nada novo para preencher'}{c.confianca === 'baixa' ? ' · pouca certeza' : ''}
                </p>
            </div>
        )}
        {s && (
            <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl px-4 py-3">
                <p className="flex items-center gap-2 text-[11px] font-bold text-emerald-300 uppercase tracking-widest mb-1">
                    <Compass size={14} /> Situação agora
                </p>
                <p className="text-[13px] font-bold text-white/90">{ROTULO_SITUACAO[s.situacao]}{s.quando ? ` · ${dataBR(s.quando)}` : ''}</p>
                {s.resumo && <p className="text-[12px] text-white/70 leading-relaxed mt-0.5">{s.resumo}</p>}
                {s.proximaAcao && s.proximaAcao.toLowerCase() !== 'nada' && <p className="text-[12px] text-emerald-200/90 leading-relaxed mt-1">Próximo passo: {s.proximaAcao}</p>}
                <p className="text-[10px] text-white/35 mt-1">
                    Lido pela IA{s.analisadaEm ? ` em ${fmt(s.analisadaEm)}` : ''}{s.confianca === 'baixa' ? ' · pouca certeza' : ''}{s.desatualizada ? ' · a conversa andou depois disso' : ''}
                </p>
            </div>
        )}
        <div className="bg-sky-500/[0.06] border border-sky-500/20 rounded-xl px-4 py-3">
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
        </div>
    );
}
