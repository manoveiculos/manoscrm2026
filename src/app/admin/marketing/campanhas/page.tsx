'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPinOff, Megaphone, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import type { CampanhaLinha, ConversoesDevolvidas, ForaDaPraca, FunilCrm, GrupoCampanhas, StatusCampanha } from '@/lib/campanhas/tipos';

/**
 * Campanhas: Facebook/Instagram (Meta Ads) e Google Ads AO VIVO, cada grupo separado, com o que o CRM
 * realmente recebeu (leads, atendidos, vendas, custo por lead real) e o tráfego fora da praça.
 * Só leitura. Atualiza sozinho a cada 60 s com a aba aberta.
 */

interface Resposta {
    dias: number; geradoEm: string;
    meta: GrupoCampanhas; google: GrupoCampanhas;
    crm: {
        funil: { meta: FunilCrm; google: FunilCrm; outros: FunilCrm };
        custoPorLeadReal: { meta: number | null; google: number | null };
        custoPorVenda: { meta: number | null; google: number | null };
    };
    foraDaPraca: { meta: ForaDaPraca; google: ForaDaPraca };
    conversoes: { meta: ConversoesDevolvidas; google: ConversoesDevolvidas };
}

const PERIODOS = [{ d: 1, r: 'Hoje' }, { d: 7, r: '7 dias' }, { d: 30, r: '30 dias' }];
const reais = (n: number | null | undefined, casas = 2) => (n == null ? '—' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`);
const inteiro = (n: number) => n.toLocaleString('pt-BR');
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const COR_STATUS: Record<StatusCampanha, string> = {
    ativa: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    pausada: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/40',
    encerrada: 'bg-zinc-800 text-zinc-500 border-zinc-700',
    outro: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};
const ROTULO_STATUS: Record<StatusCampanha, string> = { ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada', outro: 'Atenção' };

function Kpi({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
    return (
        <div className={`rounded-xl border p-3 ${destaque ? 'border-white/20 bg-white/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{rotulo}</p>
            <p className="text-lg font-bold text-white tabular-nums mt-0.5">{valor}</p>
        </div>
    );
}

const ROTULO_EVENTO = { QualifiedLead: 'Lead qualificado', Schedule: 'Visita agendada', Purchase: 'Venda' } as const;
const ROTULO_MODO = {
    off: { t: 'Desligado', c: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/40', d: 'Os eventos ficam na fila e NÃO são enviados à plataforma.' },
    test: { t: 'Em teste', c: 'bg-amber-500/15 text-amber-300 border-amber-500/30', d: 'Validando com a plataforma sem gravar nada.' },
    live: { t: 'Ao vivo', c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', d: 'Enviando de verdade para treinar os anúncios.' },
} as const;

function BlocoConversoes({ nome, c }: { nome: string; c: ConversoesDevolvidas }) {
    const m = ROTULO_MODO[c.modo];
    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Conversões devolvidas ao {nome}</p>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${m.c}`}>{m.t}</span>
                <span className="text-xs text-zinc-500">{m.d}</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wide text-zinc-500">
                        <tr><th className="px-3 py-2">Evento</th><th className="px-3 py-2 text-right">A enviar</th><th className="px-3 py-2 text-right">Enviadas</th><th className="px-3 py-2 text-right">Falhas</th><th className="px-3 py-2 text-right">Sem identificador</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {c.itens.map(i => (
                            <tr key={i.evento}>
                                <td className="px-3 py-2 text-zinc-100">{ROTULO_EVENTO[i.evento]}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{i.aEnviar}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-100">{i.enviadas}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${i.falhas ? 'text-red-300' : 'text-zinc-300'}`}>{i.falhas}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{i.semIdentificador}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function BlocoForaDaPraca({ f }: { f: ForaDaPraca }) {
    if (!f.visitantes) return null;
    const alto = f.percentual >= 30;
    return (
        <div className={`rounded-xl border p-3 text-sm ${alto ? 'border-red-500/40 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
            <p className={`flex items-center gap-2 font-semibold ${alto ? 'text-red-200' : 'text-zinc-200'}`}>
                <MapPinOff className="w-4 h-4" /> {pct(f.percentual)} dos visitantes do site vieram de fora de Santa Catarina
                <span className="font-normal text-zinc-400">({f.foraDeSc} de {f.visitantes})</span>
            </p>
            {f.topCidades.length > 0 && (
                <p className="text-zinc-400 mt-1">Mais frequentes: {f.topCidades.map(c => `${c.cidade}/${c.uf} (${c.visitantes})`).join(', ')}.</p>
            )}
            {alto && <p className="text-red-200/90 mt-1">Verba sendo gasta fora da praça: vale restringir o público ao Alto Vale / Santa Catarina na campanha.</p>}
        </div>
    );
}

function TabelaCampanhas({ campanhas, mostraLeadsCrm }: { campanhas: CampanhaLinha[]; mostraLeadsCrm: boolean }) {
    if (!campanhas.length) return <p className="text-sm text-zinc-500">Nenhuma campanha com movimento neste período.</p>;
    return (
        <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wide text-zinc-500">
                    <tr>
                        <th className="px-3 py-2">Campanha</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Orç./dia</th>
                        <th className="px-3 py-2 text-right">Gasto</th><th className="px-3 py-2 text-right">Cliques</th><th className="px-3 py-2 text-right">CTR</th>
                        <th className="px-3 py-2 text-right">CPC</th><th className="px-3 py-2 text-right">Resultados</th><th className="px-3 py-2 text-right">Custo/result.</th>
                        {mostraLeadsCrm && <th className="px-3 py-2 text-right">Leads no CRM</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {campanhas.map(c => (
                        <tr key={`${c.plataforma}-${c.id}`} className="hover:bg-white/[0.03]">
                            <td className="px-3 py-2 text-zinc-100 max-w-[260px] truncate" title={c.nome}>{c.nome}</td>
                            <td className="px-3 py-2"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${COR_STATUS[c.status]}`} title={c.statusBruto}>{ROTULO_STATUS[c.status]}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{reais(c.orcamentoDiario, 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-100">{reais(c.gasto)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{inteiro(c.cliques)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{pct(c.ctr)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{reais(c.cpc)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-100">{inteiro(c.resultados)}{c.conversas ? <span className="text-zinc-500"> ({c.conversas} no Whats)</span> : null}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{reais(c.custoPorResultado)}</td>
                            {mostraLeadsCrm && <td className="px-3 py-2 text-right tabular-nums text-zinc-100">{inteiro(c.leadsCrm || 0)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Secao({ titulo, subtitulo, cor, icone, grupo, funil, custoLead, custoVenda, fora, mostraLeadsCrm, nota, conversoes }: {
    titulo: string; subtitulo: string; cor: string; icone: React.ReactNode; grupo: GrupoCampanhas; funil: FunilCrm;
    custoLead: number | null; custoVenda: number | null; fora: ForaDaPraca; mostraLeadsCrm: boolean; nota?: string; conversoes: ConversoesDevolvidas;
}) {
    const t = grupo.totais;
    return (
        <section className="space-y-4">
            <header className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${cor}`}>
                <div className="flex items-center gap-3">
                    {icone}
                    <div><h2 className="text-base font-bold text-white">{titulo}</h2><p className="text-xs text-white/60">{subtitulo}</p></div>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border ${grupo.conectado ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-red-500/15 text-red-300 border-red-500/30'}`}>
                    {grupo.conectado ? 'Conectado' : 'Sem conexão'}
                </span>
            </header>

            {!grupo.conectado && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 flex gap-3">
                    <TriangleAlert className="w-5 h-5 shrink-0" />
                    <div><p className="font-medium">Não consegui ler {titulo} agora.</p><p className="text-red-200/80 mt-1 break-words">{grupo.erro}</p></div>
                </div>
            )}

            {grupo.conectado && (
                <>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">Na plataforma</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                            <Kpi rotulo="Gasto" valor={reais(t.gasto)} destaque />
                            <Kpi rotulo="Impressões" valor={inteiro(t.impressoes)} />
                            <Kpi rotulo="Cliques" valor={inteiro(t.cliques)} />
                            <Kpi rotulo="CTR" valor={pct(t.ctr)} />
                            <Kpi rotulo="CPC" valor={reais(t.cpc)} />
                            <Kpi rotulo="CPM" valor={reais(t.cpm)} />
                            <Kpi rotulo="Resultados" valor={inteiro(t.resultados)} destaque />
                            <Kpi rotulo="Custo / resultado" valor={reais(t.custoPorResultado)} />
                        </div>
                    </div>

                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">O que chegou no CRM (real)</p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            <Kpi rotulo="Leads" valor={inteiro(funil.leads)} destaque />
                            <Kpi rotulo="Atendidos" valor={inteiro(funil.atendidos)} />
                            <Kpi rotulo="Vendas" valor={inteiro(funil.vendas)} />
                            <Kpi rotulo="Custo por lead real" valor={reais(custoLead)} destaque />
                            <Kpi rotulo="Custo por venda" valor={reais(custoVenda)} />
                        </div>
                        {nota && <p className="text-xs text-zinc-500 mt-2">{nota}</p>}
                    </div>

                    <BlocoForaDaPraca f={fora} />
                    <TabelaCampanhas campanhas={grupo.campanhas} mostraLeadsCrm={mostraLeadsCrm} />
                </>
            )}

            <BlocoConversoes nome={titulo} c={conversoes} />
        </section>
    );
}

export default function CampanhasPage() {
    const [dias, setDias] = useState(7);
    const [grupo, setGrupo] = useState<'todos' | 'meta' | 'google'>('todos');
    const [dados, setDados] = useState<Resposta | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [agora, setAgora] = useState(() => Date.now());
    const seq = useRef(0);

    const carregar = useCallback(async () => {
        const meu = ++seq.current;
        setCarregando(true);
        try {
            const r = await fetch(`/api/admin/campanhas?dias=${dias}`, { cache: 'no-store' });
            const j = await r.json();
            if (meu !== seq.current) return;
            if (!j.success) throw new Error(j.error || 'erro');
            setDados(j); setErro(null);
        } catch (e) { if (meu === seq.current) setErro(e instanceof Error ? e.message : 'erro ao carregar'); }
        finally { if (meu === seq.current) setCarregando(false); }
    }, [dias]);

    useEffect(() => { carregar(); }, [carregar]);
    // ao vivo: a cada 60 s com a aba visível (e o relógio do "atualizado há" anda a cada 10 s)
    useEffect(() => {
        const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 60_000);
        const r = setInterval(() => setAgora(Date.now()), 10_000);
        return () => { clearInterval(t); clearInterval(r); };
    }, [carregar]);

    const seg = dados ? Math.max(0, Math.round((agora - new Date(dados.geradoEm).getTime()) / 1000)) : null;
    const mostraMeta = grupo !== 'google', mostraGoogle = grupo !== 'meta';

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ao vivo
                    </span>
                    {seg != null && <span className="text-xs text-zinc-500">atualizado há {seg < 60 ? `${seg}s` : `${Math.floor(seg / 60)} min`}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {([['todos', 'Os dois'], ['meta', 'Facebook / Instagram'], ['google', 'Google']] as const).map(([id, r]) => (
                        <button key={id} onClick={() => setGrupo(id)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${grupo === id ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-300 hover:bg-white/5'}`}>{r}</button>
                    ))}
                    <span className="w-px h-5 bg-white/10 mx-1" />
                    {PERIODOS.map(p => (
                        <button key={p.d} onClick={() => setDias(p.d)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${dias === p.d ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'border-white/10 text-zinc-300 hover:bg-white/5'}`}>{p.r}</button>
                    ))}
                    <button onClick={carregar} aria-label="Atualizar agora" className="rounded-lg border border-white/10 p-1.5 text-zinc-300 hover:bg-white/5">
                        {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {erro && <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">{erro}</div>}
            {!dados && carregando && (
                <div className="py-24 flex flex-col items-center gap-4">
                    <div className="h-10 w-10 border-2 border-red-500/20 border-t-red-600 rounded-full animate-spin" />
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Consultando Meta e Google…</p>
                </div>
            )}

            {dados && (
                <>
                    {mostraMeta && (
                        <Secao titulo="Facebook / Instagram" subtitulo="Meta Ads" cor="border-blue-500/30 bg-blue-500/10" icone={<Megaphone className="w-6 h-6 text-blue-300" />}
                            grupo={dados.meta} funil={dados.crm.funil.meta} custoLead={dados.crm.custoPorLeadReal.meta} custoVenda={dados.crm.custoPorVenda.meta}
                            fora={dados.foraDaPraca.meta} mostraLeadsCrm conversoes={dados.conversoes.meta}
                            nota="Leads do CRM: clique no WhatsApp de anúncio (identificado pelo anúncio), formulários do Facebook e origem Meta/Instagram." />
                    )}
                    {mostraGoogle && (
                        <Secao titulo="Google" subtitulo="Google Ads" cor="border-emerald-500/30 bg-emerald-500/10" icone={<Search className="w-6 h-6 text-emerald-300" />}
                            grupo={dados.google} funil={dados.crm.funil.google} custoLead={dados.crm.custoPorLeadReal.google} custoVenda={dados.crm.custoPorVenda.google}
                            fora={dados.foraDaPraca.google} mostraLeadsCrm={false} conversoes={dados.conversoes.google}
                            nota="Leads do CRM: origem Google (formulário do site). O Google não informa a campanha no lead, então a ligação por campanha ainda não existe." />
                    )}
                    <p className="text-xs text-zinc-500">
                        Fora dos dois grupos: {inteiro(dados.crm.funil.outros.leads)} leads (WhatsApp direto, indicação e outros sem origem de anúncio) neste período.
                        Resultados da plataforma: Meta conta leads de formulário e conversas iniciadas no WhatsApp; Google conta conversões.
                    </p>
                </>
            )}
        </div>
    );
}
