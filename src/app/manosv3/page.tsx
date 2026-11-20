'use client';

// Acerto de contas Manos × V3: lançamentos NOVOS, separados do módulo societário do CRM.
// Fluxo: sobe o contrato → responde as perguntas → fica tudo registrado (quem, quando, quanto) → PDF do fechamento.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Lock, Plus, Printer, RefreshCw } from 'lucide-react';
import {
    CURTO, NOME_LADO, NOME_TIPO, acertoGeral, detalharAcerto, outroLado, brl, calcularNegocio, dataBR, dataHoraBR, pendenciasParaFinalizar, resumirEmpresa,
    reaisParaCentavos, type Lado, type LinhaAcerto, type Movimento, type Negocio, type Ponta, type TipoMov,
} from '@/lib/manosv3';
import { gerarPdfNegocio } from '@/lib/manosv3Pdf';
import Wizard from './Wizard';

type Aba = 'negocios' | 'pendencias' | 'movimentos';
const num = 'tabular-nums';
const campo = 'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 rounded-md px-2 py-1.5 text-sm';
const ROT_STATUS = { estoque: 'Em estoque', vendido: 'Vendido (a fechar)', finalizado: 'Finalizado' } as const;

export default function ManosV3Page() {
    const [carregando, setCarregando] = useState(true);
    const [negado, setNegado] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [socio, setSocio] = useState<string | null>(null);
    const [negocios, setNegocios] = useState<Negocio[]>([]);
    const [movs, setMovs] = useState<Movimento[]>([]);
    const [aba, setAba] = useState<Aba>('negocios');
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState<'todos' | Negocio['status']>('todos');
    const [wizard, setWizard] = useState(false);
    const [detalheId, setDetalheId] = useState<string | null>(null);
    const [repasse, setRepasse] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true); setErro(null);
        try {
            const res = await fetch('/api/manosv3', { cache: 'no-store' });
            if (res.status === 401 || res.status === 403) { setNegado(true); return; }
            const j = await res.json();
            if (!j.success) { setErro(j.error || 'Erro ao carregar.'); return; }
            setSocio(j.socio); setNegocios(j.negocios); setMovs(j.movimentos);
        } catch (e: any) { setErro(e?.message || 'Falha de rede.'); } finally { setCarregando(false); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const vivos = useMemo(() => movs.filter((m) => !m.estornado_em), [movs]);
    const resumo = useMemo(() => ({ manos: resumirEmpresa('manos', negocios, movs), v3: resumirEmpresa('v3', negocios, movs) }), [negocios, movs]);
    const acerto = useMemo(() => acertoGeral(negocios, movs), [negocios, movs]);
    const calc = useMemo(() => new Map(negocios.map((n) => [n.id, calcularNegocio(n, movs.filter((m) => m.negocio_id === n.id))])), [negocios, movs]);
    const porNegocio = useMemo(() => new Map(negocios.map((n) => [n.id, n])), [negocios]);

    async function post(body: any): Promise<boolean> {
        const res = await fetch('/api/manosv3', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await res.json();
        if (!j.success) { alert(j.error || 'Erro'); return false; }
        await carregar();
        return true;
    }

    const negociosFiltrados = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return negocios.filter((n) => (filtroStatus === 'todos' || n.status === filtroStatus) && (!q || `${n.placa || ''} ${n.veiculo} ${n.compra_parte || ''} ${n.venda_parte || ''}`.toLowerCase().includes(q)));
    }, [negocios, busca, filtroStatus]);

    const pendentes = useMemo(() => vivos.filter((m) => m.status === 'pendente'), [vivos]);
    const movsFiltrados = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return movs.filter((m) => {
            if (!q) return true;
            const n = m.negocio_id ? porNegocio.get(m.negocio_id) : null;
            return `${m.descricao || ''} ${n?.placa || ''} ${n?.veiculo || ''} ${m.criado_por || ''}`.toLowerCase().includes(q);
        });
    }, [movs, busca, porNegocio]);

    // Acerto entre as empresas explicado por carro: cada lançamento pago gera 50% de dívida para a outra empresa.
    const gruposAcerto = useMemo(() => {
        const linhas = detalharAcerto(movs);
        const grupos: { key: string; negocioId: string | null; titulo: string; sub: string; devedora: Lado | null; credora: Lado | null; valor: number; linhas: LinhaAcerto[] }[] = [];
        for (const n of negocios) {
            const c = calc.get(n.id)!;
            const ls = linhas.filter((x) => x.negocioId === n.id);
            if (!c.devedora || ls.length === 0) continue;
            grupos.push({ key: n.id, negocioId: n.id, titulo: `${n.placa || 's/ placa'} · ${n.veiculo}`, sub: `${CURTO[c.devedora]} deve à ${CURTO[c.credora!]} (saldo líquido deste carro)`, devedora: c.devedora, credora: c.credora, valor: c.valorAcerto, linhas: ls });
        }
        const soltos = linhas.filter((x) => !x.negocioId);
        if (soltos.length) {
            const manosDeve = soltos.reduce((sum, x) => sum + (x.devedora === 'manos' ? x.valor : -x.valor), 0);
            if (manosDeve !== 0) grupos.push({ key: 'soltos', negocioId: null, titulo: 'Repasses sem carro específico', sub: 'Acertos avulsos entre as empresas', devedora: manosDeve > 0 ? 'manos' : 'v3', credora: manosDeve > 0 ? 'v3' : 'manos', valor: Math.abs(manosDeve), linhas: soltos });
        }
        return grupos;
    }, [movs, negocios, calc]);

    async function registrarRepasse(g: { negocioId: string | null; titulo: string; devedora: Lado | null; credora: Lado | null; valor: number }) {
        if (!g.devedora || !g.credora) return;
        if (!confirm(`Registrar que a ${NOME_LADO[g.devedora]} repassou ${brl(g.valor)} à ${NOME_LADO[g.credora]} (${g.titulo})? Isso zera o acerto deste carro.`)) return;
        await post({ acao: 'add_movimento', negocio_id: g.negocioId, movimento: { tipo: 'repasse', de_lado: g.devedora, para_lado: g.credora, valor_centavos: g.valor, status: 'pago', data: new Date().toISOString().slice(0, 10), descricao: `Repasse do acerto 50/50 - ${g.titulo}` } });
    }

    if (negado) {
        return (
            <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-sm">
                    <Lock className="w-8 h-8 mx-auto text-slate-400 mb-3" />
                    <h1 className="font-semibold">Acesso restrito</h1>
                    <p className="text-sm text-slate-500 mt-1">Painel exclusivo dos sócios (Alexandre e Ivo). Entre com a sua conta.</p>
                    <a href="/login?redirect=%2Fmanosv3" className="inline-block mt-4 text-sm underline">Ir para o login</a>
                </div>
            </div>
        );
    }

    const detalhe = detalheId ? porNegocio.get(detalheId) || null : null;
    const nomeNeg = (id: string | null) => { const n = id ? porNegocio.get(id) : null; return n ? `${n.placa || 's/ placa'} · ${n.veiculo}` : '—'; };

    return (
        <div id="manosv3-print" className="min-h-screen w-full bg-slate-50 text-slate-900 p-4 md:p-8 [color-scheme:light]">
            <style>{`@media print { body * { visibility: hidden; } #manosv3-print, #manosv3-print * { visibility: visible; } #manosv3-print { position: absolute; left: 0; top: 0; width: 100%; padding: 12px; background: #fff !important; } .no-print { display: none !important; } }`}</style>

            <div className="max-w-7xl mx-auto space-y-6">
                <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 md:p-6 shadow-lg flex flex-wrap items-center justify-between gap-5 print:bg-slate-900">
                    <div className="flex items-center gap-4 md:gap-6">
                        <img src="/logo-manos.png" alt="Manos Veículos" className="h-12 md:h-14 w-auto" />
                        <span className="text-2xl font-light text-slate-500">×</span>
                        <img src="/logo-v3.png" alt="V3 Automóveis" className="h-12 md:h-14 w-auto" />
                        <div className="hidden md:block border-l border-slate-600 pl-5">
                            <h1 className="text-xl font-bold tracking-tight">Acerto de Contas</h1>
                            <p className="text-xs text-slate-400">Lançamentos próprios, separados do CRM{socio ? ` · logado como ${socio}` : ''}</p>
                        </div>
                    </div>
                    <h1 className="md:hidden text-lg font-bold w-full">Acerto de Contas</h1>
                    <div className="no-print flex flex-wrap items-center gap-2 [&_button]:!text-slate-900 [&_.cta]:!text-white">
                        <button onClick={carregar} title="Atualizar" className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"><RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} /></button>
                        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-100"><Printer className="w-4 h-4" /> Imprimir tela</button>
                        <button onClick={() => setRepasse(true)} className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-100">Registrar repasse entre empresas</button>
                        <button onClick={() => setWizard(true)} className="cta inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 shadow"><Plus className="w-4 h-4" /> Lançar por contrato</button>
                    </div>
                </header>

                {erro && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">{erro}</div>}

                {/* Acerto líquido */}
                <section className="bg-white border border-slate-200 rounded-xl p-5">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Acerto entre as empresas</h2>
                    {acerto.devedora && acerto.credora ? (
                        <p className="mt-1 text-lg"><b>{NOME_LADO[acerto.devedora]}</b> precisa pagar <b className={num}>{brl(acerto.valor)}</b> para a <b>{NOME_LADO[acerto.credora]}</b></p>
                    ) : <p className="mt-1 text-lg text-slate-600">Nenhum acerto pendente entre as empresas.</p>}
                    <p className="mt-1 text-xs text-slate-500">Regra: tudo é 50/50 (compra, venda e despesas). Quem pagou mais que a sua metade é reembolsado pela outra, desde o primeiro lançamento pago — {acerto.negociosComAcerto} carro(s) com saldo. Repasses já feitos são descontados.</p>
                </section>

                {/* Cards por empresa */}
                <section className="grid md:grid-cols-2 gap-4">
                    {(['manos', 'v3'] as Lado[]).map((l) => {
                        const r = resumo[l];
                        return (
                            <div key={l} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-3 flex items-center justify-between print:bg-slate-900">
                                    <img src={l === 'manos' ? '/logo-manos.png' : '/logo-v3.png'} alt={NOME_LADO[l]} className="h-10 w-auto" />
                                    <div className="text-right text-xs text-slate-300">
                                        <div className="font-semibold text-white">{NOME_LADO[l]}</div>
                                        <div>sócio: {l === 'manos' ? 'Alexandre' : 'Ivo'}</div>
                                    </div>
                                </div>
                                <div className="p-5 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <Box titulo="Caixa (realizado)" valor={r.caixa} cor="slate" grande />
                                    <Box titulo={`Investido em estoque · 50% (${r.carrosEstoque} carros)`} valor={r.investidoEstoque} cor="slate" grande />
                                    <Box titulo="A receber" valor={r.aReceber + r.acertoReceber} cor="emerald" nota={r.acertoReceber > 0 ? `inclui ${brl(r.acertoReceber)} da ${CURTO[outroLado(l)]} (50/50)` : undefined} />
                                    <Box titulo="A pagar" valor={r.aPagar + r.acertoPagar} cor="red" nota={r.acertoPagar > 0 ? `inclui ${brl(r.acertoPagar)} à ${CURTO[outroLado(l)]} (50/50)` : undefined} />
                                </div>
                                <div className="flex justify-between border-t border-slate-100 pt-2 text-sm"><span className="text-slate-600">Projetado (caixa + a receber − a pagar)</span><b className={num}>{brl(r.projetado)}</b></div>
                                <dl className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                                    <Linha k={`Vendas feitas (${r.vendas})`} v={r.valorVendas} />
                                    <Linha k="Lucro gerado nessas vendas (total do carro)" v={r.lucroGerado} />
                                    <Linha k="Sua parte do lucro (50% de todos os carros vendidos)" v={r.lucroParte} />
                                    <Linha k="Comissões pagas" v={r.comissoes} />
                                    <Linha k="Impostos / NF pagos" v={r.impostos} />
                                </dl>
                                </div>
                            </div>
                        );
                    })}
                </section>

                <section className="bg-white border border-slate-200 rounded-xl">
                    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 pt-3">
                        <nav className="flex gap-1">
                            {([['negocios', `Carros (${negocios.length})`], ['pendencias', `A receber / A pagar (${pendentes.length + gruposAcerto.length})`], ['movimentos', 'Todos os lançamentos']] as [Aba, string][]).map(([id, label]) => (
                                <button key={id} onClick={() => setAba(id)} className={`px-3 py-2 text-sm border-b-2 -mb-px ${aba === id ? 'border-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
                            ))}
                        </nav>
                        <div className="flex items-center gap-2 pb-2">
                            {aba === 'negocios' && (
                                <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as any)} className={campo}>
                                    <option value="todos">Todos</option><option value="estoque">Em estoque</option><option value="vendido">Vendidos (a fechar)</option><option value="finalizado">Finalizados</option>
                                </select>
                            )}
                            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar placa, carro ou nome" className={`${campo} w-56`} />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        {aba === 'negocios' && (
                            <table className="w-full text-sm">
                                <thead className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50"><tr>
                                    <Th>Carro</Th><Th>Situação</Th><Th r>Compra</Th><Th r>Pagou Manos</Th><Th r>Pagou V3</Th><Th r>Venda</Th><Th r>Lucro</Th><Th>Acerto</Th><Th>Conferência</Th><th className="no-print" />
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {negociosFiltrados.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">{carregando ? 'Carregando…' : 'Nenhum carro lançado ainda. Clique em “Lançar por contrato”.'}</td></tr>}
                                    {negociosFiltrados.map((n) => {
                                        const c = calc.get(n.id)!;
                                        return (
                                            <tr key={n.id} className="align-top hover:bg-slate-50">
                                                <td className="px-3 py-2.5"><div className="font-medium">{n.placa || 's/ placa'}</div><div className="text-xs text-slate-500">{n.veiculo}</div></td>
                                                <td className="px-3 py-2.5 text-xs">{ROT_STATUS[n.status]}<div className="text-slate-500">{n.status === 'finalizado' ? dataHoraBR(n.finalizado_em) : `lançado ${dataHoraBR(n.created_at)}`}</div></td>
                                                <td className={`px-3 py-2.5 text-right ${num}`}>{brl(n.compra_valor_centavos)}<div className="text-xs text-slate-500">{CURTO[n.compra_loja]} · {dataBR(n.compra_data)}</div></td>
                                                <td className={`px-3 py-2.5 text-right ${num}`}>{brl(c.investido.manos)}</td>
                                                <td className={`px-3 py-2.5 text-right ${num}`}>{brl(c.investido.v3)}</td>
                                                <td className={`px-3 py-2.5 text-right ${num}`}>{c.temVenda ? <>{brl(c.venda)}<div className="text-xs text-slate-500">{n.venda_loja ? CURTO[n.venda_loja] : ''} · {dataBR(n.venda_data)}</div></> : '—'}</td>
                                                <td className={`px-3 py-2.5 text-right font-medium ${num} ${c.temVenda ? (c.lucro < 0 ? 'text-red-700' : 'text-emerald-700') : 'text-slate-400'}`}>{c.temVenda ? brl(c.lucro) : '—'}</td>
                                                <td className="px-3 py-2.5 text-xs">{c.devedora ? <>{CURTO[c.devedora]} deve à {CURTO[c.credora!]}<div className={`font-medium ${num}`}>{brl(c.valorAcerto)}</div></> : c.investido.manos + c.investido.v3 > 0 ? 'Quites' : '—'}</td>
                                                <td className="px-3 py-2.5 text-xs whitespace-nowrap"><span className={n.conferido_alexandre_em ? 'text-emerald-700' : 'text-slate-300'}>✓ Alexandre</span> <span className={n.conferido_ivo_em ? 'text-emerald-700' : 'text-slate-300'}>✓ Ivo</span></td>
                                                <td className="no-print px-3 py-2.5"><button onClick={() => setDetalheId(n.id)} className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100">Abrir</button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                        {aba === 'pendencias' && (
                            <div className="grid md:grid-cols-2 gap-0 md:divide-x divide-slate-100">
                                {(['manos', 'v3'] as Lado[]).map((l) => (
                                    <div key={l} className="p-4 space-y-6">
                                        <h3 className="font-semibold">{NOME_LADO[l]}</h3>
                                        {([['A receber', 'credora'], ['A pagar', 'devedora']] as [string, 'credora' | 'devedora'][]).map(([t, papel]) => {
                                            const q = busca.trim().toLowerCase();
                                            const grupos = gruposAcerto.filter((g) => g.devedora && g[papel] === l && (!q || `${g.titulo} ${g.sub}`.toLowerCase().includes(q)));
                                            const lista = pendentes
                                                .filter((m) => (papel === 'credora' ? m.para_lado === l : m.de_lado === l))
                                                .filter((m) => !q || `${m.descricao} ${nomeNeg(m.negocio_id)}`.toLowerCase().includes(q));
                                            const totalAcerto = grupos.reduce((sum, g) => sum + g.valor, 0);
                                            const totalExt = lista.reduce((sum, m) => sum + m.valor_centavos, 0);
                                            const outra = outroLado(l);
                                            return (
                                                <div key={t} className="space-y-3">
                                                    <div className="flex justify-between text-sm font-semibold border-b border-slate-200 pb-1"><span>{t}</span><span className={num}>{brl(totalAcerto + totalExt)}</span></div>

                                                    <div>
                                                        <div className="flex justify-between text-xs uppercase tracking-wide text-slate-500"><span>Acerto com a {CURTO[outra]} (50/50)</span><span className={num}>{brl(totalAcerto)}</span></div>
                                                        {grupos.length === 0 && <p className="py-2 text-xs text-slate-400">Nenhum acerto entre as empresas.</p>}
                                                        {grupos.map((g) => (
                                                            <div key={g.key} className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60">
                                                                <div className="flex items-start justify-between gap-3 p-3">
                                                                    <div>
                                                                        <div className="font-medium text-sm">{g.titulo}</div>
                                                                        <div className="text-xs text-slate-500">{g.sub}</div>
                                                                    </div>
                                                                    <div className="text-right whitespace-nowrap">
                                                                        <div className={`font-semibold ${num}`}>{brl(g.valor)}</div>
                                                                        {papel === 'devedora' && g.negocioId !== undefined && (
                                                                            <button onClick={() => registrarRepasse(g)} className="no-print mt-1 px-2 py-0.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100">Registrar repasse</button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <ul className="border-t border-slate-200 divide-y divide-slate-100 text-xs">
                                                                    {g.linhas.map((li) => (
                                                                        <li key={li.movId} className="px-3 py-2 flex items-start justify-between gap-3">
                                                                            <div>
                                                                                <div className="text-slate-800">{NOME_TIPO[li.tipo]}{li.descricao && li.descricao !== NOME_TIPO[li.tipo] ? ` — ${li.descricao}` : ''}</div>
                                                                                <div className="text-slate-500">{li.explicacao} · {dataBR(li.data)} · lançado por {li.criadoPor || '—'}</div>
                                                                            </div>
                                                                            <div className={`whitespace-nowrap ${num} ${li.credora === g.credora ? '' : 'text-red-700'}`}>{li.credora === g.credora ? '' : '−'}{brl(li.valor)}</div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div>
                                                        <div className="flex justify-between text-xs uppercase tracking-wide text-slate-500"><span>Pendências com terceiros</span><span className={num}>{brl(totalExt)}</span></div>
                                                        <ul className="mt-1 divide-y divide-slate-100 text-sm">
                                                            {lista.length === 0 && <li className="py-2 text-slate-400 text-xs">Nada pendente.</li>}
                                                            {lista.map((m) => (
                                                                <li key={m.id} className="py-2 flex items-start justify-between gap-3">
                                                                    <div><div>{m.descricao || NOME_TIPO[m.tipo]}</div><div className="text-xs text-slate-500">{nomeNeg(m.negocio_id)} · {m.de_lado === 'externo' ? 'cliente/terceiro' : CURTO[m.de_lado as Lado]} → {m.para_lado === 'externo' ? 'terceiro' : CURTO[m.para_lado as Lado]} · vence {dataBR(m.vencimento)}</div></div>
                                                                    <div className="text-right whitespace-nowrap"><div className={num}>{brl(m.valor_centavos)}</div><button onClick={() => post({ acao: 'baixa', id: m.id })} className="no-print mt-1 px-2 py-0.5 text-xs rounded border border-slate-300 hover:bg-slate-100">Dar baixa</button></div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}

                        {aba === 'movimentos' && (
                            <TabelaMov movs={movsFiltrados} nomeNeg={nomeNeg} onBaixa={(id) => post({ acao: 'baixa', id })} onEstornar={(id) => { if (confirm('Estornar este lançamento? Ele continua no histórico, mas deixa de contar.')) post({ acao: 'estornar', id }); }} />
                        )}
                    </div>
                </section>
            </div>

            {wizard && <Wizard negocios={negocios} movimentos={movs} onClose={() => setWizard(false)} onSalvo={() => { setWizard(false); carregar(); }} />}
            {repasse && <MovForm negocioId={null} titulo="Repasse entre empresas (sem carro específico)" tipos={['repasse']} onClose={() => setRepasse(false)} onSalvo={() => { setRepasse(false); carregar(); }} />}
            {detalhe && (
                <Detalhe neg={detalhe} movs={movs.filter((m) => m.negocio_id === detalhe.id)} todos={movs} socio={socio} nomeNeg={nomeNeg}
                    onClose={() => setDetalheId(null)} onPost={post} onRecarregar={carregar} />
            )}
        </div>
    );
}

function Th({ children, r }: { children?: React.ReactNode; r?: boolean }) { return <th className={`px-3 py-2 font-medium ${r ? 'text-right' : ''}`}>{children}</th>; }
function Box({ titulo, valor, cor, grande, nota }: { titulo: string; valor: number; cor: 'emerald' | 'red' | 'slate'; grande?: boolean; nota?: string }) {
    const c = { emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900', red: 'border-red-200 bg-red-50 text-red-900', slate: 'border-slate-200 bg-slate-50 text-slate-900' }[cor];
    return <div className={`rounded-lg border p-3 ${c}`}><div className="text-xs opacity-75">{titulo}</div><div className={`font-semibold tabular-nums ${grande ? 'text-lg' : ''} ${valor < 0 ? 'text-red-700' : ''}`}>{brl(valor)}</div>{nota && <div className="text-[11px] opacity-75 mt-0.5">{nota}</div>}</div>;
}
function Linha({ k, v }: { k: string; v: number }) { return <div className="flex justify-between"><dt>{k}</dt><dd className="tabular-nums">{brl(v)}</dd></div>; }

function TabelaMov({ movs, nomeNeg, onBaixa, onEstornar }: { movs: Movimento[]; nomeNeg: (id: string | null) => string; onBaixa: (id: string) => void; onEstornar: (id: string) => void }) {
    const pt = (p: Ponta) => (p === 'externo' ? 'Terceiro' : CURTO[p]);
    return (
        <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50"><tr>
                <Th>Registrado em</Th><Th>Carro</Th><Th>Tipo</Th><Th>Quem pagou → recebeu</Th><Th r>Valor</Th><Th>Situação</Th><Th>Lançado por</Th><th className="no-print" />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
                {movs.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Nenhum lançamento.</td></tr>}
                {movs.map((m) => (
                    <tr key={m.id} className={`align-top hover:bg-slate-50 ${m.estornado_em ? 'text-slate-400 line-through' : ''}`}>
                        <td className={`px-3 py-2 text-xs whitespace-nowrap ${num}`}>{dataHoraBR(m.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{nomeNeg(m.negocio_id)}</td>
                        <td className="px-3 py-2">{NOME_TIPO[m.tipo]}{m.descricao && <div className="text-xs text-slate-500">{m.descricao}</div>}{m.forma && <div className="text-[11px] text-slate-400">{m.forma}</div>}</td>
                        <td className="px-3 py-2">{pt(m.de_lado)} → {pt(m.para_lado)}</td>
                        <td className={`px-3 py-2 text-right ${num}`}>{brl(m.valor_centavos)}</td>
                        <td className="px-3 py-2 text-xs">{m.estornado_em ? `Estornado ${dataHoraBR(m.estornado_em)} por ${m.estornado_por || '—'}` : m.status === 'pago' ? <>Pago {dataHoraBR(m.pago_em)}<div className="text-slate-500">por {m.pago_por || '—'}</div></> : <span className="text-amber-700">Pendente · vence {dataBR(m.vencimento)}</span>}</td>
                        <td className="px-3 py-2 text-xs">{m.criado_por || '—'}</td>
                        <td className="no-print px-3 py-2 whitespace-nowrap text-xs">
                            {!m.estornado_em && m.status === 'pendente' && <button onClick={() => onBaixa(m.id)} className="mr-1 px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100">Dar baixa</button>}
                            {!m.estornado_em && <button onClick={() => onEstornar(m.id)} className="px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-100">Estornar</button>}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function Detalhe({ neg, movs, todos, socio, nomeNeg, onClose, onPost, onRecarregar }: {
    neg: Negocio; movs: Movimento[]; todos: Movimento[]; socio: string | null; nomeNeg: (id: string | null) => string;
    onClose: () => void; onPost: (b: any) => Promise<boolean>; onRecarregar: () => void;
}) {
    const [novo, setNovo] = useState(false);
    const c = calcularNegocio(neg, movs);
    const pend = pendenciasParaFinalizar(neg, c);
    const finalizado = neg.status === 'finalizado';
    const meuCampo = socio === 'Ivo' ? neg.conferido_ivo_em : neg.conferido_alexandre_em;

    const abrirContrato = (path: string | null) => path && window.open(`/api/manosv3/contrato?path=${encodeURIComponent(path)}`, '_blank');

    async function finalizar() {
        if (!confirm('Finalizar o negócio? Depois disso não dá para lançar nem estornar. O PDF de fechamento será gerado para arquivo.')) return;
        const ok = await onPost({ acao: 'finalizar', negocio_id: neg.id });
        if (ok) {
            // recarrega e gera o PDF já com a data de finalização
            const res = await fetch('/api/manosv3', { cache: 'no-store' });
            const j = await res.json();
            const atual = (j.negocios as Negocio[]).find((n) => n.id === neg.id);
            if (atual) await gerarPdfNegocio(atual, j.movimentos);
        }
    }

    return (
        <div className="no-print fixed inset-0 z-40 bg-slate-900/40 flex justify-end" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white text-slate-900 w-full max-w-2xl h-full overflow-y-auto p-5 space-y-5 [color-scheme:light]">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">{neg.placa || 's/ placa'} · {neg.veiculo}</h2>
                        <p className="text-xs text-slate-500">{ROT_STATUS[neg.status]} · lançado {dataHoraBR(neg.created_at)} por {neg.criado_por || '—'}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Compra · {NOME_LADO[neg.compra_loja]}</div><div className={`font-semibold ${num}`}>{brl(neg.compra_valor_centavos)}</div><div className="text-xs text-slate-500">{neg.compra_parte || '—'} · {dataBR(neg.compra_data)}</div>{neg.compra_contrato_path && <button onClick={() => abrirContrato(neg.compra_contrato_path)} className="text-xs underline">Ver contrato (PDF)</button>}</div>
                    <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Venda{neg.venda_loja ? ` · ${NOME_LADO[neg.venda_loja]}` : ''}</div>{neg.venda_loja ? <><div className={`font-semibold ${num}`}>{brl(neg.venda_valor_centavos || 0)}</div><div className="text-xs text-slate-500">{neg.venda_parte || '—'} · {dataBR(neg.venda_data)}</div>{neg.venda_contrato_path && <button onClick={() => abrirContrato(neg.venda_contrato_path)} className="text-xs underline">Ver contrato (PDF)</button>}</> : <div className="text-slate-400 text-sm">Ainda não vendido</div>}</div>
                </div>

                <section className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm space-y-1">
                    <h3 className="font-semibold">Resultado</h3>
                    <div className={`grid grid-cols-2 gap-x-6 ${num}`}>
                        <span>Venda</span><span className="text-right">{brl(c.venda)}</span>
                        <span>Compra</span><span className="text-right">−{brl(c.compra)}</span>
                        <span>Custos</span><span className="text-right">−{brl(c.custos)}</span>
                        <span>Comissão</span><span className="text-right">−{brl(c.comissao)}</span>
                        <span>Imposto / NF</span><span className="text-right">−{brl(c.imposto)}</span>
                        <b>Lucro líquido</b><b className="text-right">{brl(c.lucro)}</b>
                        <span>Manos 50%</span><span className="text-right">{brl(c.parte.manos)}</span>
                        <span>V3 50%</span><span className="text-right">{brl(c.parte.v3)}</span>
                    </div>
                    <div className={`pt-2 border-t border-slate-200 text-xs text-slate-600 ${num}`}>
                        Custo total do carro: {brl(c.compra + c.custos + c.comissao + c.imposto)} → cada empresa arca com <b>{brl(c.cota.manos)}</b> (50%)<br />
                        Já pagou: Manos {brl(c.investidoPago.manos)} · V3 {brl(c.investidoPago.v3)}
                        {c.temVenda && <> | Recebeu da venda: Manos {brl(c.recebidoPago.manos)} · V3 {brl(c.recebidoPago.v3)}</>}
                    </div>
                    {c.devedora && c.credora && <div className="font-medium pt-1"><b>{NOME_LADO[c.devedora]}</b> deve <b className={num}>{brl(c.valorAcerto)}</b> à <b>{NOME_LADO[c.credora]}</b> (acerto 50/50 do que já foi pago).</div>}
                </section>

                <section>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm">Lançamentos deste carro</h3>
                        {!finalizado && <button onClick={() => setNovo(true)} className="text-sm inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"><Plus className="w-4 h-4" />Lançar movimento</button>}
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <TabelaMov movs={[...movs].sort((a, b) => b.created_at.localeCompare(a.created_at))} nomeNeg={nomeNeg}
                            onBaixa={(id) => onPost({ acao: 'baixa', id })} onEstornar={(id) => { if (confirm('Estornar este lançamento?')) onPost({ acao: 'estornar', id }); }} />
                    </div>
                </section>

                <section className="space-y-2 border-t border-slate-200 pt-4">
                    <div className="text-sm flex flex-wrap gap-x-6 gap-y-1">
                        <span className={neg.conferido_alexandre_em ? 'text-emerald-700' : 'text-slate-400'}>✓ Alexandre {neg.conferido_alexandre_em ? dataHoraBR(neg.conferido_alexandre_em) : 'não conferiu'}</span>
                        <span className={neg.conferido_ivo_em ? 'text-emerald-700' : 'text-slate-400'}>✓ Ivo {neg.conferido_ivo_em ? dataHoraBR(neg.conferido_ivo_em) : 'não conferiu'}</span>
                    </div>
                    {!finalizado && pend.length > 0 && <p className="text-xs text-amber-700">Para finalizar: {pend.join('; ')}.</p>}
                    <div className="flex flex-wrap gap-2">
                        {!finalizado && socio && <button onClick={() => onPost({ acao: meuCampo ? 'desconferir' : 'conferir', negocio_id: neg.id })} className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-100">{meuCampo ? 'Desmarcar minha conferência' : 'Conferir (confirmo os números)'}</button>}
                        {!finalizado && <button onClick={finalizar} disabled={pend.length > 0} className="px-3 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40">Finalizar e gerar PDF</button>}
                        <button onClick={() => gerarPdfNegocio(neg, todos)} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-100"><FileText className="w-4 h-4" /> {finalizado ? 'Baixar PDF de fechamento' : 'PDF (rascunho)'}</button>
                    </div>
                </section>
            </div>
            {novo && <MovForm negocioId={neg.id} titulo={`Lançar movimento — ${neg.placa || neg.veiculo}`} tipos={['custo', 'venda', 'comissao', 'imposto', 'repasse', 'outro']} onClose={() => setNovo(false)} onSalvo={() => { setNovo(false); onRecarregar(); }} />}
        </div>
    );
}

function MovForm({ negocioId, titulo, tipos, onClose, onSalvo }: { negocioId: string | null; titulo: string; tipos: TipoMov[]; onClose: () => void; onSalvo: () => void }) {
    const [tipo, setTipo] = useState<TipoMov>(tipos[0]);
    const [quem, setQuem] = useState<Lado>('manos');
    const [valor, setValor] = useState('');
    const [status, setStatus] = useState<'pago' | 'pendente'>('pago');
    const [data, setData] = useState(new Date().toISOString().slice(0, 10));
    const [descricao, setDescricao] = useState('');
    const [msg, setMsg] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const campoF = 'w-full border border-slate-300 bg-white text-slate-900 rounded-md px-2.5 py-1.5 text-sm';
    // venda: dinheiro ENTRA na empresa escolhida; repasse: sai da empresa escolhida e entra na outra; demais: SAI da empresa.
    const rotulo = tipo === 'venda' ? 'Entra no caixa de' : tipo === 'repasse' ? 'Quem repassa (paga)' : 'Quem pagou';

    async function salvar() {
        const v = reaisParaCentavos(valor);
        if (!v) return setMsg('Informe o valor.');
        const outro: Lado = quem === 'manos' ? 'v3' : 'manos';
        const mov = {
            tipo, valor_centavos: v, status, data, descricao,
            de_lado: tipo === 'venda' ? 'externo' : quem,
            para_lado: tipo === 'venda' ? quem : tipo === 'repasse' ? outro : 'externo',
        };
        setSalvando(true); setMsg(null);
        try {
            const res = await fetch('/api/manosv3', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'add_movimento', negocio_id: negocioId, movimento: mov }) });
            const j = await res.json();
            if (!j.success) return setMsg(j.error || 'Erro ao salvar.');
            onSalvo();
        } catch (e: any) { setMsg(e?.message || 'Falha de rede.'); } finally { setSalvando(false); }
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white text-slate-900 border border-slate-200 rounded-xl w-full max-w-md p-5 space-y-3 [color-scheme:light]">
                <h2 className="font-semibold">{titulo}</h2>
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-500">Tipo<select className={campoF} value={tipo} onChange={(e) => setTipo(e.target.value as TipoMov)}>{tipos.map((t) => <option key={t} value={t}>{NOME_TIPO[t]}</option>)}</select></label>
                    <label className="text-xs text-slate-500">{rotulo}<select className={campoF} value={quem} onChange={(e) => setQuem(e.target.value as Lado)}>{(['manos', 'v3'] as Lado[]).map((l) => <option key={l} value={l}>{NOME_LADO[l]}</option>)}</select></label>
                    <label className="text-xs text-slate-500">Valor (R$)<input className={`${campoF} tabular-nums`} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" /></label>
                    <label className="text-xs text-slate-500">Data<input type="date" className={campoF} value={data} onChange={(e) => setData(e.target.value)} /></label>
                    <label className="text-xs text-slate-500">Situação<select className={campoF} value={status} onChange={(e) => setStatus(e.target.value as any)}><option value="pago">Pago / recebido</option><option value="pendente">Pendente</option></select></label>
                </div>
                <label className="block text-xs text-slate-500">Descrição<input className={campoF} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
                {msg && <p className="text-sm text-red-700">{msg}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-100">Cancelar</button>
                    <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar'}</button>
                </div>
            </div>
        </div>
    );
}
