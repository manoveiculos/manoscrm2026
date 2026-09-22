'use client';

import React, { useState } from 'react';
import { Wallet, Plus, FileText, CheckCircle2, UserCheck, Scale, ChevronDown, ChevronUp, Landmark, AlertTriangle, ArrowDownToLine, Trash2, Lock } from 'lucide-react';
import { AcertoRegistrado, RetiradaSocio } from '@/lib/services/societarioService';
import {
    AcertoEmpresas,
    CaixaEmpresa,
    DONO_DA_LOJA,
    Loja,
    LOJA_DO_SOCIO,
    NOME_EMPRESA,
    NomeSocio,
    origemDaCompra,
    socioDaRetirada
} from '@/lib/services/societarioAcerto';

interface PainelCaixaAcertoProps {
    acerto: AcertoEmpresas | null;
    veiculos: any[];
    retiradas: RetiradaSocio[];
    acertos: AcertoRegistrado[];
    entradasSemVeiculo?: any[];
    socioAtual: NomeSocio | null;
    onAtualizar: () => void;
}

interface LinhaExtrato {
    chave: string;
    data: string;
    tipo: 'Retirada' | 'Acerto' | 'Entrada compra';
    quem: string;
    descricao: string;
    valor: number;
    urlExcluir: string;
    travada: boolean;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const hoje = () => new Date().toISOString().split('T')[0];

const EMAIL_SOCIO: Record<NomeSocio, string> = { Alexandre: 'alexandre_gorges@hotmail.com', Ivo: 'ivo@acesso.com' };
const FORMAS_ENTRADA = ['DDA', 'TED', 'PIX', 'Dinheiro', 'Boleto', 'Outro'];

const COR: Record<Loja, { texto: string; borda: string; fundo: string; ativo: string; barra: string }> = {
    manos: { texto: 'text-cyan-300', borda: 'border-cyan-500/30', fundo: 'bg-cyan-500/10', ativo: 'bg-cyan-500/20 border-cyan-400 text-cyan-300', barra: 'bg-cyan-400' },
    v3: { texto: 'text-indigo-300', borda: 'border-indigo-500/30', fundo: 'bg-indigo-500/10', ativo: 'bg-indigo-500/20 border-indigo-400 text-indigo-300', barra: 'bg-indigo-400' }
};

const inputBase = 'w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500';
const travada = (v: any) => !!(v.aprovado_alexandre_em && v.aprovado_ivo_em);

function Linha({ rotulo, valor, sinal }: { rotulo: string; valor: number; sinal: '+' | '−' }) {
    if (!valor) return null;
    return (
        <div className="flex justify-between gap-3 text-xs">
            <span className="text-slate-400">{rotulo}</span>
            <span className={`font-mono ${sinal === '+' ? 'text-emerald-400' : 'text-rose-300'}`}>
                {sinal} {brl(valor)}
            </span>
        </div>
    );
}

function CardEmpresa({ e }: { e: CaixaEmpresa }) {
    const semMovimento = !e.recebidoVendas && !e.pagoCompras && !e.pagoGastos && !e.pagoComissoesImpostos && !e.retiradas && !e.acertosRecebidos && !e.acertosPagos;
    return (
        <div className={`bg-slate-900/80 border ${COR[e.loja].borda} rounded-xl p-5 shadow-xl relative overflow-hidden space-y-3`}>
            <div className={`absolute top-0 left-0 w-1 h-full ${COR[e.loja].barra}`} />
            <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-bold ${COR[e.loja].texto} flex items-center gap-1.5`}>
                    <Landmark className="w-4 h-4" /> {NOME_EMPRESA[e.loja]}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded ${COR[e.loja].fundo} ${COR[e.loja].texto} font-semibold`}>{e.dono}</span>
            </div>

            <div>
                <span className="block text-[10px] uppercase tracking-wider text-slate-500">Caixa</span>
                <span className={`text-2xl font-extrabold font-mono ${e.caixa >= 0 ? 'text-white' : 'text-rose-400'}`}>{brl(e.caixa)}</span>
            </div>

            <div className="space-y-1 border-t border-slate-800 pt-2">
                {semMovimento ? (
                    <p className="text-xs text-slate-500">Sem movimento de caixa ainda.</p>
                ) : (
                    <>
                        <Linha rotulo="Recebido em vendas" valor={e.recebidoVendas} sinal="+" />
                        <Linha rotulo="Pago em compras" valor={e.pagoCompras} sinal="−" />
                        <Linha rotulo="Gastos de oficina/preparo" valor={e.pagoGastos} sinal="−" />
                        <Linha rotulo="Comissões e Impostos NF" valor={e.pagoComissoesImpostos} sinal="−" />
                        <Linha rotulo="Retiradas deste caixa" valor={e.retiradas} sinal="−" />
                        <Linha rotulo="Acertos recebidos" valor={e.acertosRecebidos} sinal="+" />
                        <Linha rotulo="Acertos pagos" valor={e.acertosPagos} sinal="−" />
                    </>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2 text-[11px]">
                <div><span className="block text-slate-500">Investido em estoque</span><span className="font-mono text-slate-200">{brl(e.estoqueCusto)}</span></div>
                <div><span className="block text-slate-500">A receber de clientes</span><span className="font-mono text-slate-200">{brl(e.aReceberClientes)}</span></div>
                <div><span className="block text-slate-500">Comissão ({brl(e.comissoes)}) + NF ({brl(e.impostosNf)})</span><span className="font-mono text-orange-300">{brl(e.pagoComissoesImpostos)}</span></div>
                <div><span className="block text-slate-500">Lucro do {e.dono}</span><span className="font-mono text-purple-300">{brl(e.lucroDono)}</span></div>
            </div>
        </div>
    );
}

export function PainelCaixaAcerto({ acerto, veiculos, retiradas, acertos, entradasSemVeiculo, socioAtual, onAtualizar }: PainelCaixaAcertoProps) {
    const [verDetalhe, setVerDetalhe] = useState(false);
    const [formAcerto, setFormAcerto] = useState(false);
    const [valorAcerto, setValorAcerto] = useState('');
    const [dataAcerto, setDataAcerto] = useState(hoje());
    const [descAcerto, setDescAcerto] = useState('');

    const [aba, setAba] = useState<'retirada' | 'entrada'>('retirada');

    const [titular, setTitular] = useState<NomeSocio>(socioAtual || 'Alexandre');
    const [caixaRetirada, setCaixaRetirada] = useState<Loja>(LOJA_DO_SOCIO[socioAtual || 'Alexandre']);
    const [valorRetirada, setValorRetirada] = useState('');
    const [dataRetirada, setDataRetirada] = useState(hoje());
    const [descRetirada, setDescRetirada] = useState('');

    const [veiculoEntrada, setVeiculoEntrada] = useState('');
    const [caixaEntrada, setCaixaEntrada] = useState<Loja>('manos');
    const [valorEntrada, setValorEntrada] = useState('');
    const [formaEntrada, setFormaEntrada] = useState('DDA');
    const [dataEntrada, setDataEntrada] = useState(hoje());
    const [descEntrada, setDescEntrada] = useState('');

    const [salvando, setSalvando] = useState<'acerto' | 'retirada' | 'entrada' | null>(null);
    const [erro, setErro] = useState('');
    const [sucesso, setSucesso] = useState('');

    const [excluindo, setExcluindo] = useState<string | null>(null);
    const [avisoExtrato, setAvisoExtrato] = useState<{ ok: boolean; texto: string } | null>(null);

    const devedora = acerto?.devedora ?? null;
    const credora = acerto?.credora ?? null;

    const enviar = async (tipo: 'acerto' | 'retirada' | 'entrada', url: string, body: object, mensagem: string) => {
        setSalvando(tipo);
        setErro('');
        setSucesso('');
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Erro ao salvar.');
            setSucesso(mensagem);
            onAtualizar();
            return true;
        } catch (err: any) {
            setErro(err.message);
            return false;
        } finally {
            setSalvando(null);
        }
    };

    const registrarAcerto = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!devedora || !credora) return;
        const valor = Number(valorAcerto);
        if (!(valor > 0)) return setErro('Informe o valor pago no acerto.');
        const ok = await enviar(
            'acerto',
            '/api/societario/acertos',
            { de_loja: devedora, para_loja: credora, valor, data_acerto: dataAcerto, descricao: descAcerto || undefined },
            `Acerto de ${brl(valor)} registrado: ${NOME_EMPRESA[devedora]} → ${NOME_EMPRESA[credora]}.`
        );
        if (ok) {
            setFormAcerto(false);
            setValorAcerto('');
            setDescAcerto('');
        }
    };

    const registrarRetirada = async (e: React.FormEvent) => {
        e.preventDefault();
        const valor = Number(valorRetirada);
        if (!(valor > 0)) return setErro('Informe um valor de retirada válido.');
        const ok = await enviar(
            'retirada',
            '/api/societario/retiradas',
            {
                socio_email: EMAIL_SOCIO[titular],
                socio_nome: titular,
                valor,
                descricao: descRetirada,
                data_retirada: dataRetirada,
                loja_caixa: caixaRetirada
            },
            `Retirada de ${brl(valor)} do ${titular} registrada (caixa ${NOME_EMPRESA[caixaRetirada]}).`
        );
        if (ok) {
            setValorRetirada('');
            setDescRetirada('');
        }
    };

    const veiculosParaEntrada = veiculos.filter((v) => !travada(v));
    const veiculoSelecionado = veiculosParaEntrada.find((v) => v.id === veiculoEntrada);
    const origemSelecionada = veiculoSelecionado ? origemDaCompra(veiculoSelecionado) : null;

    const registrarEntrada = async (e: React.FormEvent) => {
        e.preventDefault();
        const valor = Number(valorEntrada);
        if (!(valor > 0)) return setErro('Informe o valor da entrada de compra.');
        const ok = await enviar(
            'entrada',
            '/api/societario/entradas',
            {
                veiculo_id: veiculoSelecionado ? veiculoSelecionado.id : null,
                loja: caixaEntrada,
                valor,
                forma: formaEntrada,
                data_pagamento: dataEntrada,
                descricao: descEntrada || (veiculoSelecionado ? undefined : 'Adiantamento / Aquisição de Veículo')
            },
            veiculoSelecionado
                ? `Entrada de ${brl(valor)} do caixa ${NOME_EMPRESA[caixaEntrada]} lançada no ${veiculoSelecionado.placa || veiculoSelecionado.modelo}.`
                : `Entrada/Aporte de ${brl(valor)} do caixa ${NOME_EMPRESA[caixaEntrada]} lançada sem veículo vinculado.`
        );
        if (ok) {
            setValorEntrada('');
            setDescEntrada('');
        }
    };

    const excluirLancamento = async (l: LinhaExtrato) => {
        if (!window.confirm(`Excluir ${l.tipo.toLowerCase()} de ${brl(l.valor)}?\n${l.quem} · ${l.descricao} · ${dataBr(l.data)}`)) return;
        setExcluindo(l.chave);
        setAvisoExtrato(null);
        try {
            const res = await fetch(l.urlExcluir, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Erro ao excluir lançamento.');
            setAvisoExtrato({ ok: true, texto: `Lançamento excluído: ${l.tipo.toLowerCase()} de ${brl(l.valor)} (${l.quem}).` });
            onAtualizar();
        } catch (err: any) {
            setAvisoExtrato({ ok: false, texto: err.message });
        } finally {
            setExcluindo(null);
        }
    };

    const extrato: LinhaExtrato[] = [
        ...retiradas.map((r) => ({
            chave: `r-${r.id}`,
            data: r.data_retirada,
            tipo: 'Retirada' as const,
            quem: `${socioDaRetirada(r)} · caixa ${NOME_EMPRESA[(r.loja_caixa as Loja) || LOJA_DO_SOCIO[socioDaRetirada(r)]]}`,
            descricao: r.descricao || 'Retirada de caixa',
            valor: Number(r.valor),
            urlExcluir: `/api/societario/retiradas?id=${encodeURIComponent(String(r.id))}`,
            travada: false
        })),
        ...acertos.map((a) => ({
            chave: `a-${a.id}`,
            data: a.data_acerto,
            tipo: 'Acerto' as const,
            quem: `${NOME_EMPRESA[a.de_loja]} → ${NOME_EMPRESA[a.para_loja]}`,
            descricao: a.descricao || 'Acerto entre empresas',
            valor: Number(a.valor),
            urlExcluir: `/api/societario/acertos?id=${encodeURIComponent(String(a.id))}`,
            travada: false
        })),
        ...veiculos.flatMap((v) =>
            (v.pagamentos_compra || []).map((p: any) => ({
                chave: `e-${p.id}`,
                data: p.data_pagamento,
                tipo: 'Entrada compra' as const,
                quem: `caixa ${NOME_EMPRESA[p.loja as Loja] || p.loja} · ${v.placa || v.modelo}`,
                descricao: [p.forma, p.descricao].filter(Boolean).join(' · ') || 'Entrada de compra',
                valor: Number(p.valor),
                urlExcluir: `/api/societario/entradas?id=${encodeURIComponent(String(p.id))}`,
                travada: travada(v)
            }))
        ),
        ...(entradasSemVeiculo || []).map((p) => ({
            chave: `e-sv-${p.id}`,
            data: p.data_pagamento,
            tipo: 'Entrada compra' as const,
            quem: `caixa ${NOME_EMPRESA[p.loja as Loja] || p.loja} · Aquisição Futura`,
            descricao: [p.forma, p.descricao || 'Aporte / Adiantamento de Compra'].filter(Boolean).join(' · '),
            valor: Number(p.valor),
            urlExcluir: `/api/societario/entradas?id=${encodeURIComponent(String(p.id))}`,
            travada: false
        }))
    ].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const retiradaCruzada = LOJA_DO_SOCIO[titular] !== caixaRetirada;

    return (
        <div className="space-y-6 mb-8">
            {erro && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {erro}
                </div>
            )}
            {sucesso && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> {sucesso}
                </div>
            )}

            {/* 1. Quem deve pra quem */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                        <Scale className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">Acerto entre as Empresas</h3>
                        <p className="text-xs text-slate-400">Quem vendeu repassa: parte da compra que a outra pagou + gastos que a outra pagou + lucro do dono dela</p>
                    </div>
                </div>

                {acerto && acerto.alertas.length > 0 && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg space-y-1">
                        {acerto.alertas.map((a, idx) => (
                            <p key={idx} className="text-[11px] text-rose-300 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {a}
                            </p>
                        ))}
                    </div>
                )}

                {devedora && credora && acerto ? (
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                        <div className="text-lg md:text-2xl font-extrabold text-white leading-snug">
                            <span className={COR[devedora].texto}>{NOME_EMPRESA[devedora]}</span> deve{' '}
                            <span className="font-mono text-amber-300">{brl(acerto.valorDevido)}</span> pra{' '}
                            <span className={COR[credora].texto}>{NOME_EMPRESA[credora]}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                            {DONO_DA_LOJA[devedora]} paga o {DONO_DA_LOJA[credora]}.{' '}
                            {acerto.operacoesAguardandoAprovacao > 0
                                ? `${acerto.operacoesAguardandoAprovacao} operação(ões) ainda sem aprovação dos dois — o valor pode mudar.`
                                : 'Todas as operações vendidas estão aprovadas.'}
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => {
                                    setFormAcerto(!formAcerto);
                                    setValorAcerto(String(acerto.valorDevido));
                                }}
                                className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                            >
                                <Plus className="w-3.5 h-3.5" /> Registrar pagamento do acerto
                            </button>
                            <button
                                onClick={() => setVerDetalhe(!verDetalhe)}
                                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5"
                            >
                                {verDetalhe ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} De onde vem esse valor
                            </button>
                        </div>

                        {formAcerto && (
                            <form onSubmit={registrarAcerto} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-3 items-end text-xs pt-2 border-t border-amber-500/20">
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Valor pago (R$)</label>
                                    <input type="number" step="0.01" value={valorAcerto} onChange={(e) => setValorAcerto(e.target.value)} className={`${inputBase} font-mono`} />
                                </div>
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Data</label>
                                    <input type="date" value={dataAcerto} onChange={(e) => setDataAcerto(e.target.value)} className={inputBase} />
                                </div>
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Descrição</label>
                                    <input type="text" placeholder="ex: PIX acerto de setembro" value={descAcerto} onChange={(e) => setDescAcerto(e.target.value)} className={inputBase} />
                                </div>
                                <button type="submit" disabled={salvando === 'acerto'} className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-50">
                                    {salvando === 'acerto' ? 'Salvando...' : 'Confirmar'}
                                </button>
                            </form>
                        )}
                    </div>
                ) : (
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-sm font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" /> Contas zeradas entre Manos e V3
                    </div>
                )}

                {verDetalhe && acerto && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300 min-w-[640px]">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                                <tr>
                                    <th className="px-3 py-2">Operação</th>
                                    <th className="px-3 py-2">Quem deve</th>
                                    <th className="px-3 py-2 text-right">Compra</th>
                                    <th className="px-3 py-2 text-right">Gastos</th>
                                    <th className="px-3 py-2 text-right">Lucro</th>
                                    <th className="px-3 py-2 text-right">Total</th>
                                    <th className="px-3 py-2 text-center">Aprovação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {acerto.operacoes.map((o) => (
                                    <tr key={o.veiculo_id}>
                                        <td className="px-3 py-2">
                                            <span className="font-mono text-emerald-400">{o.placa || 'SEM PLACA'}</span>{' '}
                                            <span className="text-slate-400">{o.veiculo}</span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={COR[o.devedora].texto}>{NOME_EMPRESA[o.devedora]}</span> → <span className={COR[o.credora].texto}>{NOME_EMPRESA[o.credora]}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">{o.custo ? brl(o.custo) : '-'}</td>
                                        <td className="px-3 py-2 text-right font-mono">{o.gastos ? brl(o.gastos) : '-'}</td>
                                        <td className="px-3 py-2 text-right font-mono">{o.lucro ? brl(o.lucro) : '-'}</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-300">{brl(o.valor)}</td>
                                        <td className="px-3 py-2 text-center text-[10px]">
                                            {o.aprovacao === 'aprovada' ? <span className="text-emerald-400">✓ Aprovada</span>
                                                : o.aprovacao === 'parcial' ? <span className="text-amber-400">Falta 1</span>
                                                    : <span className="text-slate-400">Pendente</span>}
                                        </td>
                                    </tr>
                                ))}
                                {acerto.movimentos.map((m, idx) => (
                                    <tr key={`m-${idx}`} className="bg-slate-950/40">
                                        <td className="px-3 py-2 text-slate-400" colSpan={2}>
                                            {dataBr(m.data)} · {m.tipo === 'acerto' ? 'Acerto' : m.tipo === 'troca' ? 'Carro de troca' : 'Retirada cruzada'}: {m.descricao}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500" colSpan={3}>
                                            abate: {NOME_EMPRESA[m.pagou]} pagou {NOME_EMPRESA[m.recebeu]}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-emerald-400">− {brl(m.valor)}</td>
                                        <td />
                                    </tr>
                                ))}
                                {acerto.operacoes.length === 0 && acerto.movimentos.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-4 text-center text-slate-500">Nenhuma operação gera repasse ainda.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 2. Caixa de cada empresa */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {acerto ? (
                    <>
                        <CardEmpresa e={acerto.empresas.manos} />
                        <CardEmpresa e={acerto.empresas.v3} />
                    </>
                ) : (
                    <p className="text-xs text-slate-500">Carregando caixa das empresas...</p>
                )}
            </div>

            {/* 3. Lançamentos (retirada / entrada de compra) + extrato */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setAba('retirada')}
                            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                aba === 'retirada' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <Wallet className="w-3.5 h-3.5" /> Retirada / Saque
                        </button>
                        <button
                            type="button"
                            onClick={() => setAba('entrada')}
                            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                aba === 'entrada' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <ArrowDownToLine className="w-3.5 h-3.5" /> Entrada de Compra
                        </button>
                    </div>

                    {aba === 'retirada' ? (
                        <form onSubmit={registrarRetirada} className="space-y-4 text-xs">
                            <p className="text-slate-400">De quem é o saque e de qual caixa saiu.</p>
                            <div>
                                <label className="block font-medium text-slate-300 mb-1">Titular</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['Alexandre', 'Ivo'] as NomeSocio[]).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => {
                                                setTitular(s);
                                                setCaixaRetirada(LOJA_DO_SOCIO[s]);
                                            }}
                                            className={`p-2.5 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                                                titular === s ? COR[LOJA_DO_SOCIO[s]].ativo : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <UserCheck className="w-4 h-4" /> {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block font-medium text-slate-300 mb-1">Saiu do caixa de</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['manos', 'v3'] as Loja[]).map((l) => (
                                        <button
                                            key={l}
                                            type="button"
                                            onClick={() => setCaixaRetirada(l)}
                                            className={`p-2.5 rounded-lg border font-bold transition-all ${
                                                caixaRetirada === l ? COR[l].ativo : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            {NOME_EMPRESA[l]}
                                        </button>
                                    ))}
                                </div>
                                {retiradaCruzada && (
                                    <p className="mt-1 text-[11px] text-amber-400">
                                        Saque do caixa da outra empresa: entra no acerto como já pago ao {titular}.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Valor (R$)</label>
                                    <input type="number" step="0.01" placeholder="0.00" value={valorRetirada} onChange={(e) => setValorRetirada(e.target.value)} required className={`${inputBase} font-mono`} />
                                </div>
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Data</label>
                                    <input type="date" value={dataRetirada} onChange={(e) => setDataRetirada(e.target.value)} className={inputBase} />
                                </div>
                            </div>

                            <div>
                                <label className="block font-medium text-slate-300 mb-1">Descrição / Referência</label>
                                <input type="text" placeholder="ex: Retirada quinzenal, Pró-labore..." value={descRetirada} onChange={(e) => setDescRetirada(e.target.value)} className={inputBase} />
                            </div>

                            <button
                                type="submit"
                                disabled={salvando === 'retirada'}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Plus className="w-4 h-4" /> {salvando === 'retirada' ? 'Registrando...' : 'Confirmar Retirada'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={registrarEntrada} className="space-y-4 text-xs">
                            <p className="text-slate-400">Dinheiro que saiu de um caixa pra pagar a compra de um carro. Pode lançar várias entradas por carro (ex: meio a meio).</p>
                            <div>
                                <label className="block font-medium text-slate-300 mb-1">Veículo</label>
                                <select
                                    value={veiculoEntrada}
                                    onChange={(e) => {
                                        setVeiculoEntrada(e.target.value);
                                        setValorEntrada('');
                                    }}
                                    className={inputBase}
                                >
                                    <option value="">-- Sem veículo vinculado (Adiantamento / Aquisição Futura) --</option>
                                    {veiculosParaEntrada.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.placa ? `[${v.placa}]` : '[Sem Placa]'} {v.marca} {v.modelo} — custo {brl(Number(v.custo_aquisicao_inicial || 0))}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {origemSelecionada && (
                                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
                                    <div className="flex justify-between"><span className="text-slate-400">Custo da compra</span><span className="font-mono text-white">{brl(origemSelecionada.custo)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Lançado pela Manos</span><span className="font-mono text-cyan-300">{brl(origemSelecionada.lancado.manos)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Lançado pela V3</span><span className="font-mono text-indigo-300">{brl(origemSelecionada.lancado.v3)}</span></div>
                                    {origemSelecionada.semOrigem > 0 && (
                                        <p className="text-[11px] text-amber-400">
                                            {brl(origemSelecionada.semOrigem)} sem entrada lançada — hoje conta como pago pela {NOME_EMPRESA[origemSelecionada.dona]}.
                                        </p>
                                    )}
                                    {origemSelecionada.troca && (
                                        <p className="text-[11px] text-slate-500">
                                            Carro de troca: não sai dinheiro do caixa. A parte lançada pela outra empresa abate do acerto.
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <button type="button" onClick={() => setValorEntrada(String(Math.round(origemSelecionada.custo * 50) / 100))} className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white">
                                            Metade ({brl(Math.round(origemSelecionada.custo * 50) / 100)})
                                        </button>
                                        {origemSelecionada.semOrigem > 0 && (
                                            <button type="button" onClick={() => setValorEntrada(String(origemSelecionada.semOrigem))} className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white">
                                                Tudo que falta ({brl(origemSelecionada.semOrigem)})
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block font-medium text-slate-300 mb-1">Saiu do caixa de</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['manos', 'v3'] as Loja[]).map((l) => (
                                        <button
                                            key={l}
                                            type="button"
                                            onClick={() => setCaixaEntrada(l)}
                                            className={`p-2.5 rounded-lg border font-bold transition-all ${
                                                caixaEntrada === l ? COR[l].ativo : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            {NOME_EMPRESA[l]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Valor (R$)</label>
                                    <input type="number" step="0.01" placeholder="0.00" value={valorEntrada} onChange={(e) => setValorEntrada(e.target.value)} required className={`${inputBase} font-mono`} />
                                </div>
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Forma</label>
                                    <select value={formaEntrada} onChange={(e) => setFormaEntrada(e.target.value)} className={inputBase}>
                                        {FORMAS_ENTRADA.map((f) => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Data</label>
                                    <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} className={inputBase} />
                                </div>
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Descrição</label>
                                    <input type="text" placeholder="ex: metade da V3" value={descEntrada} onChange={(e) => setDescEntrada(e.target.value)} className={inputBase} />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={salvando === 'entrada'}
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Plus className="w-4 h-4" /> {salvando === 'entrada' ? 'Lançando...' : 'Confirmar Entrada de Compra'}
                            </button>
                        </form>
                    )}
                </div>

                <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-cyan-400" /> Extrato de Lançamentos
                            </h3>
                            <p className="text-xs text-slate-400">Entradas de compra, saques dos sócios e acertos entre as empresas</p>
                        </div>
                    </div>

                    {avisoExtrato && (
                        <div className={`p-2.5 mb-3 rounded-lg text-xs flex items-center gap-2 border ${
                            avisoExtrato.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}>
                            {avisoExtrato.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {avisoExtrato.texto}
                        </div>
                    )}

                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs text-slate-300 min-w-[560px]">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                                <tr>
                                    <th className="px-3 py-2">Data</th>
                                    <th className="px-3 py-2">Tipo</th>
                                    <th className="px-3 py-2">Quem / Caixa</th>
                                    <th className="px-3 py-2">Descrição</th>
                                    <th className="px-3 py-2 text-right">Valor</th>
                                    <th className="px-3 py-2 w-10" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {extrato.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nenhum lançamento registrado até o momento.</td>
                                    </tr>
                                ) : (
                                    extrato.map((l) => (
                                        <tr key={l.chave} className="hover:bg-slate-800/40">
                                            <td className="px-3 py-2 text-slate-400">{dataBr(l.data)}</td>
                                            <td className="px-3 py-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                                                    l.tipo === 'Acerto'
                                                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                                        : l.tipo === 'Entrada compra'
                                                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                                            : 'bg-slate-800 text-slate-300 border-slate-700'
                                                }`}>
                                                    {l.tipo}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">{l.quem}</td>
                                            <td className="px-3 py-2 text-slate-400">{l.descricao}</td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-amber-400">{brl(l.valor)}</td>
                                            <td className="px-3 py-2 text-center">
                                                {l.travada ? (
                                                    <span title="Operação aprovada pelos dois sócios: não pode excluir" className="inline-flex text-slate-600">
                                                        <Lock className="w-3.5 h-3.5" />
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => excluirLancamento(l)}
                                                        disabled={excluindo === l.chave}
                                                        title="Excluir lançamento"
                                                        className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
