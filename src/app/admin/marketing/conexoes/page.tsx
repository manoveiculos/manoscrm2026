'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleSlash, Loader2, PauseCircle, RefreshCw } from 'lucide-react';
import { diagnosticarErro } from '../diagnostico';
import { BotaoConectar } from '../BotaoConectar';
import { useMarketing } from '../MarketingProvider';
import { FeedData, SQUAD_INFO, timeAgo } from '../utils';

/**
 * Conexões: o que está funcionando, o que falhou e ONDE o caminho bloqueou.
 *  1. Caminho do Instagram (Vitrine → Diretor de Arte → você → Publisher) com o ponto que travou.
 *  2. Conexões ao vivo (banco, estoque, Claude, voz, Higgsfield, Metricool, Google Ads).
 *  3. Rotinas agendadas e últimos erros, cada um com causa, local do bloqueio e o que fazer.
 */

type StatusCheck = 'ok' | 'erro' | 'atencao' | 'nao_configurado';
interface Check { id: string; nome: string; status: StatusCheck; detalhe: string; acao?: string; latencia_ms?: number; reconectar?: { rotulo: string; url: string; passos: string[] } }

const COR: Record<StatusCheck, { ponto: string; txt: string; rotulo: string; borda: string }> = {
    ok: { ponto: 'bg-emerald-500', txt: 'text-emerald-300', rotulo: 'Funcionando', borda: 'border-white/[0.08]' },
    atencao: { ponto: 'bg-amber-500', txt: 'text-amber-300', rotulo: 'Atenção', borda: 'border-amber-500/30' },
    erro: { ponto: 'bg-red-500', txt: 'text-red-300', rotulo: 'Com erro', borda: 'border-red-500/35' },
    nao_configurado: { ponto: 'bg-zinc-500', txt: 'text-zinc-300', rotulo: 'Não configurado', borda: 'border-white/15' },
};

type Etapa = { nome: string; quem: string; estado: 'ok' | 'espera' | 'bloqueado' | 'parado'; detalhe: string };

/** Monta as 4 etapas do post com o estado de cada uma, a partir do que o feed já traz. */
function caminhoDoInstagram(data: FeedData): Etapa[] {
    const pausadas = (data.rotinas ?? []).length > 0 && (data.rotinas ?? []).every((r) => !r.ativo);
    const horas = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity);
    const ultima = (squad: string, tipo?: string) => data.recentRuns.find((r) => r.squad === squad && (!tipo || r.run_type === tipo));

    const vit = ultima('vitrine', 'pauta_diaria');
    const vitDetalhe = !vit ? 'Nenhuma pauta recente.' : `Última pauta ${timeAgo(vit.created_at)}.`;
    const vitEstado: Etapa['estado'] = vit?.status === 'error' ? 'bloqueado' : horas(vit?.created_at) > 36 ? 'parado' : 'ok';

    const semRevisao = data.recentRuns.filter((r) => r.squad === 'vitrine' && r.run_type === 'pauta_diaria' && r.status === 'approved'
        && r.metrics?.visual_aprovado !== true && r.metrics?.visual_aprovado !== 'true' && !String(r.output_ref || '').startsWith('agendado no Metricool')).length;
    const dir = ultima('diretor_arte');
    const dirEstado: Etapa['estado'] = semRevisao > 0 ? 'bloqueado' : 'ok';

    const pend = data.pendingApprovals.filter((r) => r.squad === 'vitrine' || r.squad === 'diretor_arte').length;

    const pub = ultima('publisher', 'post_scheduled');
    const pubErro = pub?.status === 'error' ? diagnosticarErro(pub.error_message) : null;
    const pubEstado: Etapa['estado'] = pubErro ? 'bloqueado' : horas(pub?.created_at) > 24 * 7 ? 'parado' : 'ok';

    const sufixoPausa = pausadas ? ' Rotina pausada.' : '';
    return [
        { nome: 'Vitrine gera a pauta', quem: 'Vitrine', estado: vitEstado, detalhe: `${vitDetalhe}${sufixoPausa}` },
        {
            nome: 'Diretor de Arte revisa', quem: 'Diretor de Arte', estado: dirEstado,
            detalhe: semRevisao > 0
                ? `${semRevisao} pauta(s) aprovada(s) por você esperando a revisão. A rotina não conseguiu gravar o veredito (bloqueio de permissão).`
                : `${dir ? `Última revisão ${timeAgo(dir.created_at)}.` : 'Sem revisões recentes.'}${sufixoPausa}`,
        },
        { nome: 'Você aprova', quem: 'Você', estado: pend > 0 ? 'espera' : 'ok', detalhe: pend > 0 ? `${pend} item(ns) esperando a sua decisão.` : 'Nada esperando decisão.' },
        {
            nome: 'Publisher agenda no Instagram', quem: 'Publisher', estado: pubEstado,
            detalhe: pubErro ? `${pubErro.causa} Bloqueou em: ${pubErro.onde}.` : `${pub ? `Último post agendado ${timeAgo(pub.created_at)}.` : 'Nenhum post agendado recentemente.'}${sufixoPausa}`,
        },
    ];
}

const ESTADO_ETAPA = {
    ok: { ponto: 'bg-emerald-500', borda: 'border-white/[0.08]', rotulo: 'ok' },
    espera: { ponto: 'bg-amber-500', borda: 'border-amber-500/40', rotulo: 'espera você' },
    bloqueado: { ponto: 'bg-red-500', borda: 'border-red-500/40', rotulo: 'bloqueado' },
    parado: { ponto: 'bg-zinc-500', borda: 'border-white/15', rotulo: 'parado' },
} as const;

export default function MarketingConexoesPage() {
    const { data, loading } = useMarketing();
    const [checks, setChecks] = useState<Check[] | null>(null);
    const [verificando, setVerificando] = useState(false);
    const [erroChecagem, setErroChecagem] = useState<string | null>(null);

    const verificar = useCallback(async () => {
        setVerificando(true);
        setErroChecagem(null);
        try {
            const res = await fetch('/api/admin/marketing-conexoes', { cache: 'no-store' });
            const j = await res.json().catch(() => null);
            if (!res.ok || !j?.checks) throw new Error(j?.error || `A checagem respondeu HTTP ${res.status}`);
            setChecks(j.checks as Check[]);
        } catch (e) {
            setErroChecagem(e instanceof Error ? e.message : 'Falha na checagem');
        } finally {
            setVerificando(false);
        }
    }, []);

    useEffect(() => { void verificar(); }, [verificar]);

    if (loading && !data) return <div className="text-zinc-400 text-sm py-10 text-center">Carregando…</div>;
    if (!data) return <div className="text-zinc-400 text-sm py-10 text-center">Não consegui carregar os dados. Use “Atualizar”.</div>;

    const rotinas = data.rotinas ?? [];
    const erros = data.recentRuns.filter((r) => r.status === 'error').slice(0, 8);
    const etapas = caminhoDoInstagram(data);
    const contagem = (s: StatusCheck) => (checks || []).filter((c) => c.status === s).length;

    return (
        <div className="space-y-7">
            <section aria-label="Caminho do Instagram">
                <h2 className="text-base font-bold mb-1">Caminho do post no Instagram</h2>
                <p className="text-sm text-zinc-400 mb-3">Onde o post está e onde travou.</p>
                <div className="flex items-stretch gap-1.5 flex-wrap">
                    {etapas.map((e, i) => (
                        <div key={e.nome} className="flex items-center gap-1.5 flex-1 min-w-[210px]">
                            <div className={`flex-1 h-full rounded-xl border bg-black/25 px-3 py-2.5 ${ESTADO_ETAPA[e.estado].borda}`}>
                                <p className="flex items-center gap-2 text-sm font-bold"><span className={`w-2.5 h-2.5 rounded-full ${ESTADO_ETAPA[e.estado].ponto}`} aria-hidden /> {e.nome}</p>
                                <p className="text-xs font-semibold text-zinc-300 mt-0.5">{ESTADO_ETAPA[e.estado].rotulo}</p>
                                <p className="text-xs text-zinc-400 mt-1 leading-snug">{e.detalhe}</p>
                            </div>
                            {i < etapas.length - 1 && <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 hidden sm:block" />}
                        </div>
                    ))}
                </div>
            </section>

            <section aria-label="Conexões ao vivo">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <h2 className="text-base font-bold">Conexões <span className="text-xs font-normal text-zinc-500">· checagem ao vivo, sem gastar crédito</span></h2>
                    <button onClick={verificar} disabled={verificando} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.1] disabled:opacity-50 transition-colors">
                        {verificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Verificar agora
                    </button>
                </div>
                {checks && (
                    <p className="text-sm text-zinc-400 mb-3">
                        <span className="text-emerald-300 font-semibold">{contagem('ok')} funcionando</span>
                        {contagem('atencao') > 0 && <> · <span className="text-amber-300 font-semibold">{contagem('atencao')} com atenção</span></>}
                        {contagem('erro') > 0 && <> · <span className="text-red-300 font-semibold">{contagem('erro')} com erro</span></>}
                        {contagem('nao_configurado') > 0 && <> · <span className="text-zinc-300 font-semibold">{contagem('nao_configurado')} não configurada(s)</span></>}
                    </p>
                )}
                {erroChecagem && <p className="text-sm text-red-300 bg-red-500/[0.07] border border-red-500/25 rounded-xl px-4 py-2.5 mb-3">Não consegui checar as conexões: {erroChecagem}</p>}
                {!checks && !erroChecagem && <p className="text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {(checks || []).map((c) => (
                        <div key={c.id} className={`rounded-xl bg-white/[0.03] border p-3 ${COR[c.status].borda}`}>
                            <p className="flex items-center gap-2 text-sm font-bold">
                                <span className={`w-2.5 h-2.5 rounded-full ${COR[c.status].ponto}`} aria-hidden /> {c.nome}
                                <span className={`ml-auto text-xs font-semibold ${COR[c.status].txt}`}>{COR[c.status].rotulo}</span>
                            </p>
                            <p className="text-sm text-zinc-300 mt-1.5 leading-snug">{c.detalhe}</p>
                            {c.acao && c.status !== 'ok' && <p className="text-xs text-zinc-400 mt-1.5">O que fazer: {c.acao}</p>}
                            {c.reconectar && c.status !== 'ok' && (
                                <div className="mt-2 rounded-lg bg-white/[0.04] border border-white/10 p-2.5">
                                    {(c.id === 'meta_login' || c.id === 'google_login')
                                        ? <BotaoConectar provedor={c.id === 'google_login' ? 'google' : 'meta'} rotulo="Reconectar" />
                                        : (
                                            <a href={c.reconectar.url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-xs font-semibold hover:bg-white">
                                                {c.reconectar.rotulo} <ArrowRight className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                    <ol className="mt-2 list-decimal pl-4 space-y-0.5 text-xs text-zinc-400">
                                        {c.reconectar.passos.map((p, i) => <li key={i}>{p}</li>)}
                                    </ol>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            <section aria-label="Rotinas agendadas">
                <h2 className="text-base font-bold mb-2">Rotinas agendadas</h2>
                {rotinas.length === 0 && <p className="text-sm text-zinc-400">Nenhuma rotina registrada.</p>}
                <div className="space-y-2">
                    {rotinas.map((r) => {
                        const d = r.ultimo_status && r.ultimo_status !== 'ok' ? diagnosticarErro(r.ultimo_erro, r.bloqueio) : null;
                        return (
                            <div key={r.id} className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {r.ativo ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <PauseCircle className="w-4 h-4 text-amber-400" />}
                                    <span className="font-bold text-sm">{r.nome}</span>
                                    <span className="text-xs text-zinc-500">{SQUAD_INFO[r.squad as keyof typeof SQUAD_INFO]?.label ?? r.squad} · {r.agenda}</span>
                                    <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${r.ativo ? 'text-emerald-300 bg-emerald-500/10' : 'text-amber-300 bg-amber-500/10'}`}>{r.ativo ? 'ligada' : 'pausada'}</span>
                                </div>
                                {r.funcao && <p className="text-sm text-zinc-400 mt-1">{r.funcao}</p>}
                                {d && (
                                    <div className="mt-2 text-sm rounded-lg bg-red-500/[0.06] border border-red-500/25 px-3 py-2">
                                        <p className="text-red-300 font-semibold">{d.causa}</p>
                                        <p className="text-zinc-400 text-xs mt-0.5">Bloqueou em: {d.onde}</p>
                                        <p className="text-zinc-300 text-xs mt-0.5">O que fazer: {d.acao}</p>
                                    </div>
                                )}
                                <p className="text-xs text-zinc-500 mt-2">Última execução: {timeAgo(r.ultimo_inicio)}{r.motivo_pausa ? ` · ${r.motivo_pausa}` : ''}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section aria-label="Últimos erros">
                <h2 className="text-base font-bold mb-2">Últimos erros</h2>
                {erros.length === 0 ? (
                    <p className="text-sm text-zinc-400 flex items-center gap-2"><CircleSlash className="w-4 h-4" /> Nenhum erro nas últimas execuções.</p>
                ) : (
                    <ul className="space-y-2">
                        {erros.map((r) => {
                            const d = diagnosticarErro(r.error_message);
                            return (
                                <li key={r.id} className="rounded-xl bg-white/[0.03] border border-white/[0.08] border-l-4 border-l-red-500 p-3">
                                    <p className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400 shrink-0" /> {SQUAD_INFO[r.squad]?.label ?? r.squad}: {d.tipo === 'outro' ? (r.error_message || r.title) : d.causa}</p>
                                    <p className="text-xs text-zinc-400 mt-1">{timeAgo(r.created_at)} · Bloqueou em: {d.onde}. {d.acao}</p>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
