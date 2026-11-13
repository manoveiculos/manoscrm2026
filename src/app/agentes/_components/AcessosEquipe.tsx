'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { duracaoTexto } from '@/lib/agentes/acessos';
import type { AcessoVendedor } from '@/app/api/agentes/acessos/route';
import { horaBRT } from './icones';

const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const min = (m: number | null) => (m == null ? 'não consta' : duracaoTexto(m * 60_000));

function Vendedor({ v }: { v: AcessoVendedor }) {
    const [aberto, setAberto] = useState(false);
    const hoje = v.dias[0];
    const semAcessar = v.semAcessarMs;
    const ausenciaLonga = semAcessar != null && semAcessar >= 24 * 3_600_000;
    return (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0F0F14]">
            <button type="button" onClick={() => setAberto(o => !o)} className="w-full text-left p-3 flex items-center gap-3 min-h-[64px]">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${v.online ? 'bg-emerald-400 motion-safe:animate-pulse' : 'bg-zinc-600'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-black text-white">{v.nome}</span>
                        <span className={`rounded-full border px-1.5 py-px text-[10px] font-bold ${v.online ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-white/15 text-white/55'}`}>{v.online ? 'online agora' : 'offline'}</span>
                        {ausenciaLonga && <span className="rounded-full border border-red-500/50 bg-red-600/15 px-1.5 py-px text-[10px] font-bold text-red-200">sem acessar há {duracaoTexto(semAcessar!)}</span>}
                    </span>
                    <span className="block text-[11px] text-white/60 mt-1">
                        {semAcessar == null ? 'Nenhum acesso registrado no período' : v.online ? 'Com o CRM aberto agora' : `Último sinal há ${duracaoTexto(semAcessar)} (${new Date(v.ultimoSinalEm!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`}
                    </span>
                    <span className="block text-[10px] text-white/40 mt-0.5">
                        Hoje: entrou {hoje.entrou ? horaBRT(hoje.entrou) : '—'} · {hoje.saiu && !v.online ? `saiu/últ. sinal ${horaBRT(hoje.saiu)}` : 'ainda ativo'} · online {min(hoje.minutosOnline)} · {hoje.acoes} ações
                    </span>
                </span>
                <ChevronDown size={16} className={`text-white/40 transition ${aberto ? 'rotate-180' : ''}`} />
            </button>
            {aberto && (
                <div className="border-t border-white/[0.06] p-3 space-y-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] text-white/75">
                            <thead><tr className="text-white/40 text-left"><th className="py-1 pr-3 font-bold">Dia</th><th className="pr-3 font-bold">Entrou</th><th className="pr-3 font-bold">Saiu / últ. sinal</th><th className="pr-3 font-bold">Online</th><th className="pr-3 font-bold">Ações</th><th className="font-bold">Ausências longas</th></tr></thead>
                            <tbody>
                                {v.dias.map(d => (
                                    <tr key={d.dia} className="border-t border-white/[0.05] align-top">
                                        <td className="py-1.5 pr-3 font-bold text-white">{dia(d.dia)}</td>
                                        <td className="pr-3">{d.entrou ? horaBRT(d.entrou) : '—'}</td>
                                        <td className="pr-3">{d.saiu ? horaBRT(d.saiu) : '—'}</td>
                                        <td className="pr-3">{min(d.minutosOnline)}</td>
                                        <td className="pr-3">{d.acoes}</td>
                                        <td>{d.ausencias.length ? d.ausencias.map(x => <span key={x.de} className="block text-amber-200">{horaBRT(x.de)}–{horaBRT(x.ate)} ({duracaoTexto(x.minutos * 60_000)})</span>) : <span className="text-white/30">—</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="mt-2 text-[10px] text-white/40">
                            Online na semana: <b className="text-white/70">{min(v.minutosSemana)}</b>.{' '}
                            {v.batimentoDesde ? `Tempo online conta desde ${new Date(v.batimentoDesde).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` : 'Tempo online ainda não consta: o registro por minuto começa quando a migration de presença for aplicada.'}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1.5">Linha do tempo (mais recentes primeiro)</p>
                        {v.linhaDoTempo.length === 0 ? <p className="text-[11px] text-white/40">Nenhuma ação registrada no período.</p> : (
                            <ul className="max-h-72 overflow-y-auto space-y-1 pr-1">
                                {v.linhaDoTempo.map((e, i) => (
                                    <li key={`${e.em}-${i}`} className="flex gap-2 text-[11px]">
                                        <span className="text-white/40 tabular-nums shrink-0">{dia(new Date(new Date(e.em).getTime() - 3 * 3_600_000).toISOString().slice(0, 10))} {horaBRT(e.em)}</span>
                                        <span className={e.tipo === 'login' || e.tipo === 'logout' ? 'text-sky-200' : 'text-white/80'}>{e.texto}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Acesso REAL dos vendedores ao CRM: entrou/saiu, tempo sem acessar, tempo online e o que fizeram. Só admin. */
export function AcessosEquipe() {
    const [dados, setDados] = useState<{ vendedores: AcessoVendedor[]; faltando: string[] } | null>(null);
    const [erro, setErro] = useState(false);

    useEffect(() => {
        let vivo = true;
        const ler = () => fetch('/api/agentes/acessos?dias=7', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then(j => { if (!vivo) return; if (j?.success) { setDados(j); setErro(false); } else setErro(true); })
            .catch(() => { if (vivo) setErro(true); });
        void ler();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void ler(); }, 30_000);
        return () => { vivo = false; clearInterval(t); };
    }, []);

    return (
        <section className="mt-5">
            <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45 mb-2">Acesso da equipe ao CRM</h2>
            {erro && !dados && <p className="text-[12px] text-red-300">Não consegui carregar os acessos agora.</p>}
            {!dados && !erro && <p className="text-[12px] text-white/40">Carregando…</p>}
            {dados && (
                <>
                    {dados.faltando.length > 0 && <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">Fonte sem leitura: {dados.faltando.join('; ')}. O que depende dela aparece como “não consta”.</p>}
                    {dados.vendedores.length === 0 ? <p className="text-[12px] text-white/40">Nenhum vendedor ativo encontrado.</p> : <div className="grid gap-2 lg:grid-cols-3">{dados.vendedores.map(v => <Vendedor key={v.agenteId} v={v} />)}</div>}
                </>
            )}
            <p className="mt-2 flex items-start gap-1.5 text-[10px] text-white/40"><ShieldCheck size={12} className="shrink-0 mt-px" />
                Transparência (LGPD): a equipe é avisada no CRM de que entradas, saídas, tempo com o CRM aberto e ações em leads/conversas são registrados. Só a gestão vê; guarda-se só o caminho da tela, nunca o conteúdo.
            </p>
        </section>
    );
}
