'use client';

import { AprovacoesPainel } from './AprovacoesPainel';
import { AtividadePainel } from './AtividadePainel';
import { useMarketing } from './MarketingProvider';
import { CardSquad, FunilInstagram } from './PainelBlocos';
import { ABAS, AbaId } from './utils';

/**
 * Corpo padrão de uma aba por função: descrição, cards dos squads da aba,
 * fila de aprovação e atividade só desses squads. (Resumo e Conexões têm tela própria.)
 */
export function AbaSquads({ aba, comFunil = false, aviso }: { aba: AbaId; comFunil?: boolean; aviso?: string }) {
    const { data, loading, busyId, decide, abrirSquad, abrirImagens, kpiBySquad, ultimaPorSquad } = useMarketing();
    const def = ABAS.find((a) => a.id === aba)!;

    if (loading && !data) return <div className="text-zinc-400 text-sm py-10 text-center">Carregando…</div>;
    if (!data) return <div className="text-zinc-400 text-sm py-10 text-center">Não consegui carregar os dados. Use “Atualizar”.</div>;

    const pendentes = data.pendingApprovals.filter((r) => def.squads.includes(r.squad));
    const runs = data.recentRuns.filter((r) => def.squads.includes(r.squad));

    return (
        <div className="space-y-5">
            <p className="text-sm text-zinc-400">{def.descricao}</p>
            {aviso && <p className="text-sm text-amber-300 bg-amber-500/[0.07] border border-amber-500/25 rounded-xl px-4 py-2.5">{aviso}</p>}
            {comFunil && <FunilInstagram data={data} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {def.squads.map((key) => (
                    <CardSquad key={key} squad={key} kpi={kpiBySquad[key]} ultima={ultimaPorSquad[key]} onClick={() => abrirSquad(key)} />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <AprovacoesPainel className="lg:col-span-2" pendentes={pendentes} busyId={busyId} onDecide={decide} onAbrirImagens={abrirImagens} />
                <AtividadePainel className="lg:col-span-1" runs={runs} />
            </div>
        </div>
    );
}
