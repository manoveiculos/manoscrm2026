'use client';

import React, { useState } from 'react';
import { X, Save, Car, ArrowRightLeft, Calculator, FileText, CheckCircle2, UserCheck, Wallet, Wrench, Plus, Trash2, Lock, ShieldCheck, Landmark, Printer } from 'lucide-react';
import { calcularFechamento, comissaoAutomatica, CustoAdicional, NOME_LOJA, PCT_COMISSAO_VENDA } from '@/lib/services/societarioService';
import { origemDaCompra, type NomeSocio } from '@/lib/services/societarioAcerto';
import { RelatorioNegociacaoPdf } from './RelatorioNegociacaoPdf';

interface ModalDetalhamentoOperacaoProps {
    veiculo: any | null;
    socioAtual?: NomeSocio | null;
    onClose: () => void;
    onSaveSuccess: () => void;
}

type Categoria = CustoAdicional['categoria'];

interface LinhaGasto {
    chave: string;
    id?: string;
    categoria: Categoria;
    descricao: string;
    valor: string;
    data_custo: string;
    loja_pagadora: string;
}

const CATEGORIAS: { valor: Categoria; rotulo: string }[] = [
    { valor: 'oficina', rotulo: 'Oficina' },
    { valor: 'vistoria', rotulo: 'Vistoria' },
    { valor: 'polimento', rotulo: 'Polimento' },
    { valor: 'transferencia', rotulo: 'Transferência' },
    { valor: 'guincho', rotulo: 'Guincho' },
    { valor: 'outros', rotulo: 'Outros' }
];

const hoje = () => new Date().toISOString().split('T')[0];
const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const dataHora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

// Fotografia do que está editável, pra saber se tem alteração não salva antes de aprovar
function retratoEdicao(comissao: number, imposto: number, pctA: number, pctI: number, gastos: LinhaGasto[]) {
    return JSON.stringify({
        comissao: Number(comissao) || 0,
        imposto: Number(imposto) || 0,
        pctA: Number(pctA) || 0,
        pctI: Number(pctI) || 0,
        gastos: gastos
            .filter((g) => g.id || g.descricao.trim() || g.valor.trim())
            .map((g) => [g.id ?? null, g.categoria, g.descricao.trim(), Number(g.valor) || 0, g.data_custo, g.loja_pagadora])
    });
}

export function ModalDetalhamentoOperacao({ veiculo, socioAtual, onClose, onSaveSuccess }: ModalDetalhamentoOperacaoProps) {
    const contratoCompra = Array.isArray(veiculo?.contratos_compra) ? veiculo.contratos_compra[0] : veiculo?.contratos_compra;
    const contratoVenda = Array.isArray(veiculo?.contratos_venda) ? veiculo.contratos_venda[0] : veiculo?.contratos_venda;
    const fechamento = Array.isArray(veiculo?.fechamentos_lucro) ? veiculo.fechamentos_lucro[0] : veiculo?.fechamentos_lucro;
    const vendido = !!contratoVenda;

    const comissaoInicial = Number(fechamento?.comissao_vendedor || 0);
    const impostoInicial = Number(fechamento?.imposto_nf || 0);
    const pctAlexandreInicial = Number(fechamento?.pct_alexandre ?? 50);
    const pctIvoInicial = Number(fechamento?.pct_ivo ?? 50);

    const [comissaoVendedor, setComissaoVendedor] = useState<number>(comissaoInicial);
    const [impostoNf, setImpostoNf] = useState<number>(impostoInicial);
    const [pctAlexandre, setPctAlexandre] = useState<number>(pctAlexandreInicial);
    const [pctIvo, setPctIvo] = useState<number>(pctIvoInicial);
    const [gastos, setGastos] = useState<LinhaGasto[]>(() =>
        (veiculo?.custos_adicionais || []).map((c: any) => ({
            chave: c.id,
            id: c.id,
            categoria: c.categoria,
            descricao: c.descricao || '',
            valor: String(c.valor ?? ''),
            data_custo: c.data_custo || hoje(),
            loja_pagadora: c.loja_pagadora || veiculo?.loja_atual || 'manos'
        }))
    );
    const [retratoInicial] = useState(() => retratoEdicao(comissaoInicial, impostoInicial, pctAlexandreInicial, pctIvoInicial, gastos));
    const [aprovacao, setAprovacao] = useState<{ alexandre: string | null; ivo: string | null }>({
        alexandre: veiculo?.aprovado_alexandre_em || null,
        ivo: veiculo?.aprovado_ivo_em || null
    });
    const [salvando, setSalvando] = useState(false);
    const [aprovando, setAprovando] = useState(false);
    const [erro, setErro] = useState('');
    const [exibirPdf, setExibirPdf] = useState(false);

    if (!veiculo) return null;

    const travada = !!(aprovacao.alexandre && aprovacao.ivo);
    const minhaAprovacao = socioAtual === 'Alexandre' ? aprovacao.alexandre : socioAtual === 'Ivo' ? aprovacao.ivo : null;
    const alteracaoNaoSalva = retratoEdicao(comissaoVendedor, impostoNf, pctAlexandre, pctIvo, gastos) !== retratoInicial;

    const custoAquisicao = Number(veiculo.custo_aquisicao_inicial || 0);
    const valorVenda = Number(contratoVenda?.valor_venda_fechado || fechamento?.valor_venda || 0);
    const totalCustosExtras = gastos.reduce((acc, g) => acc + (Number(g.valor) || 0), 0);
    const comissaoPadrao = comissaoAutomatica(valorVenda, custoAquisicao);
    const origem = origemDaCompra(veiculo);
    const entradasCompra: any[] = veiculo.pagamentos_compra || [];
    const pctDoCusto = (v: number) => (origem.custo > 0 ? Math.round((v / origem.custo) * 100) : 0);

    // Recálculo dinâmico em tempo real
    const calc = calcularFechamento({
        custoAquisicao,
        valorVenda,
        comissaoVendedor,
        impostoNf,
        totalCustosExtras,
        pctAlexandre,
        pctIvo
    });

    const formatBRL = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    const alterarGasto = (chave: string, campo: keyof LinhaGasto, valor: string) => {
        setGastos((atual) => atual.map((g) => (g.chave === chave ? { ...g, [campo]: valor } : g)));
    };

    const adicionarGasto = () => {
        setGastos((atual) => [
            ...atual,
            { chave: `novo-${Date.now()}`, categoria: 'oficina', descricao: '', valor: '', data_custo: hoje(), loja_pagadora: veiculo?.loja_atual || 'manos' }
        ]);
    };

    const handleSalvarRecalculo = async () => {
        setSalvando(true);
        setErro('');

        try {
            // Linha nova deixada em branco não conta; linha pela metade é erro
            const preenchidos = gastos.filter((g) => g.id || g.descricao.trim() || g.valor.trim());
            for (const g of preenchidos) {
                if (!g.descricao.trim()) throw new Error('Todo gasto precisa de descrição.');
                if (!(Number(g.valor) > 0)) throw new Error(`Informe o valor do gasto "${g.descricao}".`);
            }

            const res = await fetch('/api/societario/fechamento', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ação: 'ajustar',
                    veiculo_id: veiculo.id,
                    custos: preenchidos.map((g) => ({
                        id: g.id,
                        categoria: g.categoria,
                        descricao: g.descricao.trim(),
                        valor: Number(g.valor),
                        data_custo: g.data_custo,
                        loja_pagadora: g.loja_pagadora
                    })),
                    ...(vendido
                        ? { comissao_vendedor: comissaoVendedor, imposto_nf: impostoNf, pct_alexandre: pctAlexandre, pct_ivo: pctIvo }
                        : {})
                })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Erro ao recalcular fechamento.');
            }

            onSaveSuccess();
            onClose();
        } catch (err: any) {
            setErro(err.message);
        } finally {
            setSalvando(false);
        }
    };

    const handleAprovacao = async (acao: 'aprovar' | 'desfazer') => {
        setAprovando(true);
        setErro('');
        try {
            const res = await fetch('/api/societario/aprovacao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ veiculo_id: veiculo.id, acao })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Erro ao registrar aprovação.');

            setAprovacao({ alexandre: data.aprovado_alexandre_em || null, ivo: data.aprovado_ivo_em || null });
            onSaveSuccess();
        } catch (err: any) {
            setErro(err.message);
        } finally {
            setAprovando(false);
        }
    };

    const removerEntrada = async (id: string) => {
        if (!window.confirm('Remover esta entrada de compra?')) return;
        setErro('');
        try {
            const res = await fetch(`/api/societario/entradas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Erro ao remover entrada de compra.');

            // mudou a operação: o banco zera as aprovações dadas
            setAprovacao({ alexandre: null, ivo: null });
            onSaveSuccess();
        } catch (err: any) {
            setErro(err.message);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden relative my-8">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Car className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl font-bold text-white flex flex-wrap items-center gap-2">
                                {veiculo.marca} {veiculo.modelo}
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-400">
                                    {veiculo.placa || 'SEM PLACA'}
                                </span>
                                {travada && (
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 flex items-center gap-1">
                                        <Lock className="w-3 h-3" /> Travada
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-slate-400">
                                Chassi: {veiculo.chassi || 'N/I'} | Renavam: {veiculo.renavam || 'N/I'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setExibirPdf(true)}
                            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/30 transition-all"
                            title="Gerar e imprimir relatório detalhado em PDF"
                        >
                            <Printer className="w-4 h-4" />
                            <span>Imprimir PDF</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {exibirPdf && (
                    <RelatorioNegociacaoPdf
                        veiculo={veiculo}
                        comissaoVendedorEdicao={comissaoVendedor}
                        impostoNfEdicao={impostoNf}
                        pctAlexandreEdicao={pctAlexandre}
                        pctIvoEdicao={pctIvo}
                        gastosEdicao={gastos}
                        onClose={() => setExibirPdf(false)}
                    />
                )}

                {/* Conteúdo Modal */}
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                    {erro && (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl">
                            {erro}
                        </div>
                    )}

                    {/* Aprovação dupla da operação */}
                    {vendido && (
                        <div className={`rounded-xl p-4 border space-y-3 ${travada ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-950/90 border-slate-800'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-sm font-bold text-white">
                                    {travada ? <Lock className="w-4 h-4 text-emerald-400" /> : <ShieldCheck className="w-4 h-4 text-amber-400" />}
                                    {travada ? 'Aprovada pelos dois sócios — sem alterações' : 'Aprovação da operação'}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {(['Alexandre', 'Ivo'] as NomeSocio[]).map((s) => {
                                        const em = s === 'Alexandre' ? aprovacao.alexandre : aprovacao.ivo;
                                        return (
                                            <span
                                                key={s}
                                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                                                    em ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-400'
                                                }`}
                                            >
                                                {em ? `✓ ${s} · ${dataHora(em)}` : `${s} · pendente`}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            {(!travada || minhaAprovacao) && (
                                <div className="flex flex-wrap items-center gap-3">
                                    {!socioAtual ? (
                                        <span className="text-[11px] text-slate-500">Entre com o login do Alexandre ou do Ivo pra aprovar ou destravar.</span>
                                    ) : minhaAprovacao ? (
                                        <button
                                            onClick={() => handleAprovacao('desfazer')}
                                            disabled={aprovando}
                                            className="px-3 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-rose-300 hover:text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 transition-all cursor-pointer"
                                            title="Destravar operação e remover minha aprovação"
                                        >
                                            {aprovando ? 'Salvando...' : 'Desfazer minha aprovação (Destravar)'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleAprovacao('aprovar')}
                                            disabled={aprovando || alteracaoNaoSalva}
                                            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                                        >
                                            <CheckCircle2 className="w-4 h-4" /> {aprovando ? 'Aprovando...' : `Aprovar como ${socioAtual}`}
                                        </button>
                                    )}
                                    <span className="text-[11px] text-slate-400">
                                        {alteracaoNaoSalva
                                            ? 'Salve as alterações antes de aprovar.'
                                            : 'Qualquer alteração zera as aprovações. É possível destravar para correções a qualquer momento.'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Grid de Resumo de Compra x Venda */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Cartão de Entrada / Compra */}
                        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                                <span className="uppercase tracking-wider flex items-center gap-1">
                                    <FileText className="w-4 h-4 text-blue-400" /> Contrato de Compra (Entrada)
                                </span>
                                <span className="text-slate-500">{contratoCompra?.data_contrato || 'N/I'}</span>
                            </div>
                            <div className="text-2xl font-bold text-white font-mono">{formatBRL(custoAquisicao)}</div>
                            <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                                <div><strong className="text-slate-300">Fornecedor:</strong> {contratoCompra?.fornecedor_nome || 'N/A'}</div>
                                <div><strong className="text-slate-300">Captador:</strong> {contratoCompra?.captador_vendedor || 'N/A'}</div>
                                <div><strong className="text-slate-300">Liquidação:</strong> {contratoCompra?.forma_liquidacao || 'DDA/TED'}</div>
                                <div><strong className="text-slate-300">Loja do contrato:</strong> {NOME_LOJA[contratoCompra?.loja_pagadora] || 'N/I'}</div>
                            </div>
                        </div>

                        {/* Cartão de Saída / Venda */}
                        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                                <span className="uppercase tracking-wider flex items-center gap-1">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Contrato de Venda (Saída)
                                </span>
                                <span className="text-slate-500">{contratoVenda?.data_contrato || 'Em estoque'}</span>
                            </div>
                            <div className="text-2xl font-bold text-emerald-400 font-mono">
                                {valorVenda > 0 ? formatBRL(valorVenda) : 'Disponível em Estoque'}
                            </div>
                            <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                                <div><strong className="text-slate-300">Comprador:</strong> {contratoVenda?.comprador_nome || 'N/A'}</div>
                                <div><strong className="text-slate-300">Vendedor:</strong> {contratoVenda?.vendedor_responsavel || 'N/A'}</div>
                                <div><strong className="text-slate-300">Entrada Moeda:</strong> {formatBRL(contratoVenda?.valor_entrada_moeda || 0)}</div>
                                <div><strong className="text-slate-300">Vendido por:</strong> {NOME_LOJA[contratoVenda?.loja_recebedora] || 'N/A'}</div>
                            </div>
                        </div>
                    </div>

                    {/* De onde saiu o dinheiro da compra */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                            <span className="flex items-center gap-2 text-sm font-bold text-white">
                                <Landmark className="w-4 h-4 text-blue-400" /> De onde saiu o dinheiro da compra
                            </span>
                            <span className="text-xs text-slate-400">
                                Custo: <strong className="text-white font-mono">{formatBRL(origem.custo)}</strong>
                            </span>
                        </div>

                        {origem.custo > 0 && (
                            <div className="space-y-1">
                                <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
                                    <div className="bg-cyan-400" style={{ width: `${pctDoCusto(origem.aporte.manos)}%` }} />
                                    <div className="bg-indigo-400" style={{ width: `${pctDoCusto(origem.aporte.v3)}%` }} />
                                </div>
                                <div className="flex flex-wrap justify-between gap-2 text-[11px]">
                                    <span className="text-cyan-300">Manos Veículos {formatBRL(origem.aporte.manos)} ({pctDoCusto(origem.aporte.manos)}%)</span>
                                    <span className="text-indigo-300">V3 Automóveis {formatBRL(origem.aporte.v3)} ({pctDoCusto(origem.aporte.v3)}%)</span>
                                </div>
                            </div>
                        )}

                        {entradasCompra.map((p) => (
                            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs p-2 bg-slate-900 border border-slate-800 rounded-lg">
                                <span className="text-slate-300">
                                    <strong className={p.loja === 'v3' ? 'text-indigo-300' : 'text-cyan-300'}>{NOME_LOJA[p.loja] || p.loja}</strong>
                                    {' · '}{p.forma || 'forma não informada'} · {dataBr(p.data_pagamento)}
                                    {p.descricao ? <span className="text-slate-500"> · {p.descricao}</span> : null}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="font-mono text-white">{formatBRL(Number(p.valor))}</span>
                                    {!travada && (
                                        <button
                                            type="button"
                                            onClick={() => removerEntrada(p.id)}
                                            title="Remover entrada"
                                            className="p-1 rounded text-slate-500 hover:text-rose-400"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </span>
                            </div>
                        ))}

                        {origem.semOrigem > 0 && (
                            <p className="text-[11px] text-amber-400">
                                {formatBRL(origem.semOrigem)} sem entrada lançada — conta como pago pela {NOME_LOJA[origem.dona]} (loja do contrato).
                            </p>
                        )}
                        {origem.excedente > 0 && (
                            <p className="text-[11px] text-rose-400">
                                Entradas somam {formatBRL(origem.excedente)} acima do custo da compra. Remova a entrada errada.
                            </p>
                        )}
                        {origem.troca && (
                            <p className="text-[11px] text-slate-500">
                                Carro recebido em troca: não saiu dinheiro do caixa. A parte lançada pela outra empresa abate do acerto.
                            </p>
                        )}
                        {!travada && (
                            <p className="text-[11px] text-slate-500">
                                Pra lançar entrada use a aba &quot;Entrada de Compra&quot; no painel de caixa, abaixo da tabela de negócios.
                            </p>
                        )}
                    </div>

                    {/* Detalhe da Permuta (Veículo de Troca) se houver */}
                    {contratoVenda?.tem_troca && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                                <ArrowRightLeft className="w-4 h-4" /> Veículo Entrado como Parte de Pagamento (Permuta)
                            </div>
                            <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-200">
                                <div>
                                    <span className="font-semibold text-white">{contratoVenda.troca_modelo}</span>
                                    {contratoVenda.troca_placa && (
                                        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                                            {contratoVenda.troca_placa}
                                        </span>
                                    )}
                                </div>
                                <div className="font-bold text-amber-300 font-mono">
                                    Valor Troca: {formatBRL(contratoVenda.valor_veiculo_troca || 0)}
                                </div>
                            </div>
                            <p className="text-[11px] text-amber-200/70 italic">
                                Este veículo foi cadastrado no estoque automaticamente como custo inicial para futura apuração de lucro.
                            </p>
                        </div>
                    )}

                    {/* Gastos do veículo */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                            <span className="flex items-center gap-2 text-sm font-bold text-white">
                                <Wrench className="w-4 h-4 text-orange-400" /> Gastos do Veículo
                            </span>
                            <span className="text-xs text-slate-400">
                                Total: <strong className="text-orange-300 font-mono">{formatBRL(totalCustosExtras)}</strong>
                            </span>
                        </div>

                        {gastos.length === 0 && (
                            <p className="text-xs text-slate-500">Nenhum gasto lançado (oficina, vistoria, polimento, transferência, guincho...).</p>
                        )}

                        {gastos.map((g) => (
                            <div key={g.chave} className="grid grid-cols-2 md:grid-cols-[110px_1fr_110px_120px_100px_36px] gap-2 items-center text-xs">
                                <select
                                    value={g.categoria}
                                    onChange={(e) => alterarGasto(g.chave, 'categoria', e.target.value)}
                                    disabled={travada}
                                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:border-orange-500 focus:outline-none disabled:opacity-60"
                                >
                                    {CATEGORIAS.map((c) => (
                                        <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    placeholder="Descrição (ex: troca de pastilhas)"
                                    value={g.descricao}
                                    onChange={(e) => alterarGasto(g.chave, 'descricao', e.target.value)}
                                    disabled={travada}
                                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:border-orange-500 focus:outline-none disabled:opacity-60"
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor R$"
                                    value={g.valor}
                                    onChange={(e) => alterarGasto(g.chave, 'valor', e.target.value)}
                                    disabled={travada}
                                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-orange-300 font-mono focus:border-orange-500 focus:outline-none disabled:opacity-60"
                                />
                                <input
                                    type="date"
                                    value={g.data_custo}
                                    onChange={(e) => alterarGasto(g.chave, 'data_custo', e.target.value)}
                                    disabled={travada}
                                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:border-orange-500 focus:outline-none disabled:opacity-60"
                                />
                                <select
                                    value={g.loja_pagadora}
                                    onChange={(e) => alterarGasto(g.chave, 'loja_pagadora', e.target.value)}
                                    disabled={travada}
                                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:border-orange-500 focus:outline-none disabled:opacity-60"
                                >
                                    <option value="manos">Manos</option>
                                    <option value="v3">V3</option>
                                </select>
                                {!travada && (
                                    <button
                                        type="button"
                                        onClick={() => setGastos((atual) => atual.filter((x) => x.chave !== g.chave))}
                                        title="Remover gasto"
                                        className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-rose-400 hover:border-rose-500/40 transition-colors justify-self-start"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}

                        {!travada && (
                            <button
                                type="button"
                                onClick={adicionarGasto}
                                className="px-3 py-1.5 rounded-lg border border-dashed border-slate-700 hover:border-orange-500/50 text-xs font-semibold text-slate-300 hover:text-orange-300 flex items-center gap-1.5 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Adicionar gasto
                            </button>
                        )}
                    </div>

                    {/* Seção de Ajuste dos Custos, NF, Comissão e Cotas */}
                    {vendido ? (
                        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                                <span className="flex items-center gap-2 text-sm font-bold text-white">
                                    <Calculator className="w-4 h-4 text-purple-400" /> Ajuste de Apuração Financeira & Partilha
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                {/* Comissão de venda da loja que vendeu */}
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">
                                        Comissão de Venda — {NOME_LOJA[contratoVenda?.loja_recebedora] || 'loja vendedora'} (R$)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={comissaoVendedor}
                                        onChange={(e) => setComissaoVendedor(Number(e.target.value))}
                                        disabled={travada}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-60"
                                    />
                                    {!travada && comissaoVendedor !== comissaoPadrao && (
                                        <button
                                            type="button"
                                            onClick={() => setComissaoVendedor(comissaoPadrao)}
                                            className="mt-1 text-[11px] text-orange-300 hover:text-orange-200 underline"
                                        >
                                            Usar {PCT_COMISSAO_VENDA}% do lucro bruto ({formatBRL(comissaoPadrao)})
                                        </button>
                                    )}
                                </div>

                                {/* Imposto / Dedução NF */}
                                <div>
                                    <label className="block font-medium text-slate-300 mb-1">Imposto / Provisionamento NF (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={impostoNf}
                                        onChange={(e) => setImpostoNf(Number(e.target.value))}
                                        disabled={travada}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-60"
                                    />
                                </div>
                            </div>

                            {/* Divisão Percentual */}
                            <div className="pt-2 border-t border-slate-800/80">
                                <label className="block text-xs font-semibold text-slate-300 mb-2">
                                    Divisão da Margem Líquida (% Alexandre vs % Ivo)
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3">
                                        <div className="flex items-center justify-between text-xs text-cyan-400 font-bold mb-1">
                                            <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Alexandre</span>
                                            <input
                                                type="number"
                                                value={pctAlexandre}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    setPctAlexandre(val);
                                                    setPctIvo(100 - val);
                                                }}
                                                disabled={travada}
                                                className="w-16 bg-slate-950 border border-cyan-500/40 text-center text-cyan-300 font-bold rounded p-1 disabled:opacity-60"
                                            /> %
                                        </div>
                                        <div className="text-lg font-bold text-white font-mono mt-2">
                                            {formatBRL(calc.cotaAlexandre)}
                                        </div>
                                    </div>

                                    <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
                                        <div className="flex items-center justify-between text-xs text-indigo-400 font-bold mb-1">
                                            <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Ivo</span>
                                            <input
                                                type="number"
                                                value={pctIvo}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    setPctIvo(val);
                                                    setPctAlexandre(100 - val);
                                                }}
                                                disabled={travada}
                                                className="w-16 bg-slate-950 border border-indigo-500/40 text-center text-indigo-300 font-bold rounded p-1 disabled:opacity-60"
                                            /> %
                                        </div>
                                        <div className="text-lg font-bold text-white font-mono mt-2">
                                            {formatBRL(calc.cotaIvo)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Resultado Final de Lucro */}
                            <div className="p-4 bg-slate-900 border border-purple-500/30 rounded-xl flex flex-wrap justify-between items-center gap-3 text-xs">
                                <div>
                                    <span className="text-slate-400 uppercase tracking-wider text-[10px]">Lucro Líquido Apurado</span>
                                    <div className={`text-xl font-bold font-mono ${calc.lucroLiquido >= 0 ? 'text-purple-400' : 'text-rose-400'}`}>{formatBRL(calc.lucroLiquido)}</div>
                                </div>
                                <div className="text-right text-slate-400 text-[11px]">
                                    <div>Lucro Bruto: {formatBRL(calc.lucroBruto)}</div>
                                    <div>Comissão: {formatBRL(calc.comissaoVendedor)} · NF: {formatBRL(calc.impostoNf)} · Gastos: {formatBRL(calc.totalCustosExtras)}</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500">
                            Veículo em estoque: os gastos ficam salvos e entram automaticamente na apuração quando a venda for registrada.
                        </p>
                    )}
                </div>

                {/* Rodapé com Ação */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                    >
                        {travada ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!travada && (
                        <button
                            onClick={handleSalvarRecalculo}
                            disabled={salvando}
                            className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" /> {salvando ? 'Salvando...' : vendido ? 'Salvar e Recalcular Cotas' : 'Salvar Gastos'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
