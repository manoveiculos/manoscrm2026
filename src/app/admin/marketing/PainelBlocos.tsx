'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock, Plug } from 'lucide-react';
import {
    FeedData, IntegrationRow, KpiRow, RunRow, SquadKey, SQUAD_INFO, STATUS_STYLE, timeAgo,
} from './utils';
import { diagnosticarErro } from './diagnostico';

/**
 * Blocos de leitura rápida do /admin/marketing:
 *  - ResumoAtencao: o que precisa de você agora (aprovações, erros, conexões, Instagram parado)
 *  - FunilInstagram: o caminho do post nos últimos 7 dias, com o gargalo destacado
 *  - CardSquad: estado do squad + o último resultado, em vez de só um contador
 *  - ChipIntegracao: conexão com o motivo quando falha e aviso de dado antigo
 */

const DIA = 24 * 3600 * 1000;
const dentroDe = (iso: string, dias: number) => Date.now() - new Date(iso).getTime() <= dias * DIA;
const diasDesde = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DIA) : null);
const corta = (s: string | null | undefined, n: number) => (!s ? '' : s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const NOMES_INTEGRACAO: Record<string, string> = { google_ads: 'Google Ads', metricool: 'Metricool', meta_ads: 'Meta Ads' };
const nomeIntegracao = (provider: string) =>
    NOMES_INTEGRACAO[provider] ?? provider.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// ── Estado do squad ───────────────────────────────────────────────────────

export type EstadoSquad = 'ok' | 'erro' | 'espera' | 'parado';

export function estadoDoSquad(kpi: KpiRow | undefined, ultima: RunRow | undefined): EstadoSquad {
    if (!kpi || (kpi.runs_7d || 0) === 0) return 'parado';
    if (ultima?.status === 'error') return 'erro';
    if ((kpi.pending_approvals || 0) > 0) return 'espera';
    return 'ok';
}

const ESTADO: Record<EstadoSquad, { label: string; cls: string }> = {
    ok: { label: 'Em dia', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
    erro: { label: 'Último com erro', cls: 'text-red-300 bg-red-500/10 border-red-500/30' },
    espera: { label: 'Espera você', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
    parado: { label: 'Sem atividade na semana', cls: 'text-zinc-300 bg-white/[0.05] border-white/10' },
};

// ── Resumo: precisa de você agora ─────────────────────────────────────────

interface ItemAtencao { tom: 'erro' | 'alerta'; titulo: string; detalhe?: string; acao?: { rotulo: string; onClick: () => void } }

const TOM = {
    erro: { barra: 'border-l-red-500', icone: 'text-red-400' },
    alerta: { barra: 'border-l-amber-500', icone: 'text-amber-400' },
};

export function ResumoAtencao({ data, onVerAprovacoes }: { data: FeedData; onVerAprovacoes: () => void }) {
    const itens: ItemAtencao[] = [];

    const rotinas = data.rotinas ?? [];
    if (rotinas.length > 0 && rotinas.every((r) => !r.ativo)) {
        itens.push({
            tom: 'alerta',
            titulo: `As ${rotinas.length} rotinas agendadas estão pausadas`,
            detalhe: 'Nada novo é gerado nem publicado sozinho até reprogramarmos. Posts que já estão agendados no Metricool continuam saindo.',
        });
    }

    const pendentes = data.pendingApprovals.length;
    if (pendentes > 0) {
        itens.push({
            tom: 'alerta',
            titulo: `${pendentes} ${pendentes === 1 ? 'item espera' : 'itens esperam'} a sua decisão`,
            detalhe: 'Sem a sua aprovação, nada vai para o Instagram.',
            acao: { rotulo: 'Ver e decidir', onClick: onVerAprovacoes },
        });
    }

    const agendados7d = data.recentRuns.filter((r) => r.squad === 'publisher' && r.run_type === 'post_scheduled' && r.status === 'success' && dentroDe(r.created_at, 7));
    if (agendados7d.length === 0) {
        itens.push({ tom: 'alerta', titulo: 'Nenhum post agendado no Instagram nos últimos 7 dias', detalhe: 'Veja o funil abaixo para achar onde o post parou.' });
    }

    // Um erro por squad (o mais recente) nos últimos 7 dias.
    const vistos = new Set<string>();
    for (const r of data.recentRuns) {
        if (r.status !== 'error' || !dentroDe(r.created_at, 7) || vistos.has(r.squad)) continue;
        vistos.add(r.squad);
        const d = diagnosticarErro(r.error_message);
        itens.push({
            tom: 'erro',
            titulo: `${SQUAD_INFO[r.squad]?.label ?? r.squad}: ${d.tipo === 'outro' ? corta(r.error_message || r.title, 120) : d.causa}`,
            detalhe: `${timeAgo(r.created_at)} · Bloqueou em: ${d.onde}. ${d.acao}`,
        });
        if (vistos.size >= 3) break;
    }

    for (const ig of data.integrations) {
        const nome = nomeIntegracao(ig.provider);
        if (ig.status !== 'connected') {
            itens.push({ tom: 'erro', titulo: `${nome} desconectado`, detalhe: corta((ig.details?.erro as string) || 'Sem detalhe do motivo.', 160) });
        } else {
            const d = diasDesde(ig.checked_at);
            if (d !== null && d > 7) itens.push({ tom: 'alerta', titulo: `${nome}: conexão verificada há ${d} dias`, detalhe: 'O status pode estar desatualizado.' });
        }
    }

    if (itens.length === 0) {
        return (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-300">
                <CheckCircle2 className="w-5 h-5 shrink-0" /> Tudo em ordem: nada esperando você e nenhum erro na semana.
            </div>
        );
    }

    return (
        <section aria-label="Precisa de você agora" className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4">
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Precisa de você agora
                <span className="text-xs font-black bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full">{itens.length}</span>
            </h2>
            <ul className="space-y-2">
                {itens.map((it, i) => (
                    <li key={i} className={`flex items-start gap-3 rounded-xl bg-black/25 border border-white/[0.05] border-l-4 ${TOM[it.tom].barra} px-3 py-2.5`}>
                        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${TOM[it.tom].icone}`} />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug">{it.titulo}</p>
                            {it.detalhe && <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{it.detalhe}</p>}
                        </div>
                        {it.acao && (
                            <button onClick={it.acao.onClick} className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors">
                                {it.acao.rotulo}
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

// ── Funil do Instagram (últimos 7 dias) ───────────────────────────────────

export function FunilInstagram({ data }: { data: FeedData }) {
    const recentes = data.recentRuns.filter((r) => dentroDe(r.created_at, 7));
    const geradas = recentes.filter((r) => r.squad === 'vitrine' && r.run_type === 'pauta_diaria').length;
    const revisadas = recentes.filter((r) => r.squad === 'diretor_arte' && r.run_type === 'revisao_visual').length;
    const aprovadas = recentes.filter((r) => r.squad === 'vitrine' && r.run_type === 'pauta_diaria' && r.status === 'approved').length;
    const agendadas = recentes.filter((r) => r.squad === 'publisher' && r.run_type === 'post_scheduled' && r.status === 'success').length;
    const esperando = data.pendingApprovals.filter((r) => r.squad === 'vitrine' || r.squad === 'diretor_arte').length;

    const etapas = [
        { rotulo: 'Pautas geradas', valor: geradas, quem: 'Vitrine' },
        { rotulo: 'Revisadas na arte', valor: revisadas, quem: 'Diretor de Arte' },
        { rotulo: 'Aprovadas por você', valor: aprovadas, quem: 'Você' },
        { rotulo: 'Agendadas no Instagram', valor: agendadas, quem: 'Publisher' },
    ];
    // Gargalo: a primeira etapa que fica abaixo da anterior.
    const gargalo = etapas.findIndex((e, i) => i > 0 && e.valor < etapas[i - 1].valor);

    return (
        <section aria-label="Caminho do post no Instagram" className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4">
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
                <h2 className="text-base font-bold">Caminho do post no Instagram <span className="text-xs font-normal text-zinc-500">· últimos 7 dias</span></h2>
                {esperando > 0 && <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> {esperando} esperando você</span>}
            </div>
            <div className="flex items-stretch gap-1.5 flex-wrap">
                {etapas.map((e, i) => {
                    const trava = i === gargalo;
                    return (
                        <div key={e.rotulo} className="flex items-center gap-1.5 flex-1 min-w-[150px]">
                            <div className={`flex-1 rounded-xl border px-3 py-2.5 ${trava ? 'border-amber-500/40 bg-amber-500/[0.07]' : 'border-white/[0.07] bg-black/25'}`}>
                                <p className={`text-3xl font-black leading-none ${e.valor === 0 ? 'text-zinc-500' : trava ? 'text-amber-300' : 'text-zinc-100'}`}>{e.valor}</p>
                                <p className="text-sm font-semibold mt-1.5 leading-tight">{e.rotulo}</p>
                                <p className="text-xs text-zinc-500 mt-0.5">{e.quem}{trava ? ' · onde está parando' : ''}</p>
                            </div>
                            {i < etapas.length - 1 && <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 hidden sm:block" />}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

// ── Card de squad ─────────────────────────────────────────────────────────

export function CardSquad({ squad, kpi, ultima, onClick }: { squad: SquadKey; kpi: KpiRow | undefined; ultima: RunRow | undefined; onClick: () => void }) {
    const info = SQUAD_INFO[squad];
    const Icon = info.icon;
    const estado = estadoDoSquad(kpi, ultima);
    const st = ultima ? (STATUS_STYLE[ultima.status] || STATUS_STYLE.success) : null;
    const quando = timeAgo(ultima?.created_at || kpi?.last_run_at || null);

    return (
        <button
            onClick={onClick}
            className="group text-left rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 hover:bg-white/[0.06] hover:border-white/[0.16] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
        >
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${info.color}22`, color: info.color }}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-bold text-base leading-tight">{info.label}</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ESTADO[estado].cls}`}>{ESTADO[estado].label}</span>
                    </div>
                    <p className="text-sm text-zinc-400 leading-snug mt-1">{info.missao}</p>
                </div>
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                    <p className="text-3xl font-black leading-none">{kpi?.runs_7d ?? 0}</p>
                    <p className="text-xs text-zinc-400 mt-1">execuções em 7 dias</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                    {!!kpi?.pending_approvals && <span className="font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">{kpi.pending_approvals} pendente(s)</span>}
                    {!!kpi?.errors_7d && <span className="font-bold text-red-300 bg-red-500/10 px-2 py-0.5 rounded-full">{kpi.errors_7d} erro(s) na semana</span>}
                </div>
            </div>

            <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-start gap-2 text-sm">
                {st && <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${st.dot}`} aria-hidden />}
                <p className="min-w-0 flex-1 text-zinc-300 leading-snug">
                    {ultima ? <><span className="text-zinc-500">Último:</span> {corta(ultima.title, 90)}</> : <span className="text-zinc-500">Sem execuções recentes</span>}
                </p>
                <span className="text-xs text-zinc-500 shrink-0 whitespace-nowrap">{quando}</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-zinc-500 group-hover:text-zinc-200 flex items-center gap-0.5 transition-colors">Ver histórico <ChevronRight className="w-3.5 h-3.5" /></p>
        </button>
    );
}

// ── Conexões ──────────────────────────────────────────────────────────────

export function ChipIntegracao({ ig }: { ig: IntegrationRow }) {
    const ok = ig.status === 'connected';
    const d = ig.details || {};
    const networks = (d.networks || {}) as Record<string, string>;
    const dias = diasDesde(ig.checked_at);
    const antigo = ok && dias !== null && dias > 7;
    const dashboardUrl = d.dashboard_url as string | undefined;

    return (
        <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm ${ok ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-red-500/[0.05] border-red-500/25'}`}>
            <Plug className={`w-4 h-4 mt-0.5 shrink-0 ${ok ? 'text-emerald-400' : 'text-red-400'}`} />
            <div className="min-w-0">
                <p className="leading-snug">
                    <span className="font-bold">{nomeIntegracao(ig.provider)}</span>{' '}
                    <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? 'conectado' : 'desconectado'}</span>
                    {networks.instagram && <span className="text-zinc-400"> · Instagram @{networks.instagram}</span>}
                    {d.plan && <span className="text-zinc-500"> · plano {String(d.plan)}</span>}
                </p>
                <p className="text-xs text-zinc-500 leading-snug mt-0.5">
                    {antigo
                        ? <span className="text-amber-400">verificado há {dias} dias — pode estar desatualizado</span>
                        : <>verificado {timeAgo(ig.checked_at)}</>}
                    {!ok && d.erro && <span className="text-red-300"> · {corta(String(d.erro), 110)}</span>}
                    {dashboardUrl && <> · <a href={dashboardUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Gerenciar →</a></>}
                </p>
            </div>
        </div>
    );
}

// ── Mini card de squad (aba Resumo) ───────────────────────────────────────

export function MiniSquad({ squad, kpi, ultima }: { squad: SquadKey; kpi: KpiRow | undefined; ultima: RunRow | undefined }) {
    const info = SQUAD_INFO[squad];
    const Icon = info.icon;
    const estado = estadoDoSquad(kpi, ultima);
    const ponto = { ok: 'bg-emerald-500', erro: 'bg-red-500', espera: 'bg-amber-500', parado: 'bg-zinc-500' }[estado];
    return (
        <div className="h-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 hover:bg-white/[0.06] transition-colors">
            <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${info.color}22`, color: info.color }}><Icon className="w-4 h-4" /></span>
                <p className="text-sm font-bold leading-tight truncate">{info.label}</p>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-300">
                <span className={`w-2 h-2 rounded-full ${ponto}`} aria-hidden /> {ESTADO[estado].label}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{kpi?.runs_7d ?? 0} em 7 dias · {timeAgo(ultima?.created_at || kpi?.last_run_at || null)}</p>
        </div>
    );
}
