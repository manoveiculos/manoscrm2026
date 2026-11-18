'use client';

import Link from 'next/link';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AprovacoesPainel } from './AprovacoesPainel';
import { AtividadePainel } from './AtividadePainel';
import { useMarketing } from './MarketingProvider';
import { FunilInstagram, MiniSquad, ResumoAtencao } from './PainelBlocos';
import { ABAS, SQUAD_INFO, SQUAD_ORDER } from './utils';

/**
 * /admin/marketing — Resumo: o que precisa de você agora, o caminho do post no Instagram,
 * a fila de aprovação e a atividade. Os detalhes de cada squad ficam nas outras abas.
 */
export default function MarketingResumoPage() {
    const { data, loading, busyId, decide, abrirImagens, kpiBySquad, ultimaPorSquad } = useMarketing();

    if (loading && !data) return <div className="text-zinc-400 text-sm py-10 text-center">Carregando…</div>;
    if (!data) return <div className="text-zinc-400 text-sm py-10 text-center">Não consegui carregar os dados. Use “Atualizar”.</div>;

    const irParaAprovacoes = () => document.getElementById('aprovacoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const abaDoSquad = (squad: string) => ABAS.find((a) => a.squads.includes(squad as never))?.href ?? '/admin/marketing';

    return (
        <div className="space-y-5">
            <ResumoAtencao data={data} onVerAprovacoes={irParaAprovacoes} />
            <FunilInstagram data={data} />

            <section aria-label="Estado dos squads">
                <h2 className="text-base font-bold mb-2">Squads</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                    {SQUAD_ORDER.map((key) => (
                        <Link key={key} href={abaDoSquad(key)} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 rounded-xl">
                            <MiniSquad squad={key} kpi={kpiBySquad[key]} ultima={ultimaPorSquad[key]} />
                        </Link>
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <AprovacoesPainel className="lg:col-span-2" pendentes={data.pendingApprovals} busyId={busyId} onDecide={decide} onAbrirImagens={abrirImagens} />
                <AtividadePainel className="lg:col-span-1" runs={data.recentRuns} />
            </div>

            {data.daily.length > 1 && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4">
                    <h2 className="text-base font-bold mb-3">Execuções por dia (14 dias)</h2>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.daily}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="day" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                                <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                                {SQUAD_ORDER.map((key) => (
                                    <Line key={key} type="monotone" dataKey={key} stroke={SQUAD_INFO[key].color} strokeWidth={2} dot={false} name={SQUAD_INFO[key].label} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}
