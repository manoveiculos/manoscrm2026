'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, FileText, CheckCircle2, ArrowRightLeft, X, AlertTriangle, Link2 } from 'lucide-react';
import { ParsedContratoResult } from '@/lib/services/societarioPdfParser';
import { comissaoAutomatica, NOME_LOJA, PCT_COMISSAO_VENDA } from '@/lib/services/societarioService';

interface FormNovoContratoProps {
    parsedData?: ParsedContratoResult | null;
    veiculosExistentes: any[];
    onSuccess: () => void;
    onClose: () => void;
}

type OrigemTipo = 'loja' | 'meio' | 'personalizado';

const inputBase = 'w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normPlaca = (p?: string | null) => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const txt = (v?: string | number | null) => (v === undefined || v === null ? '' : String(v));
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
const r2 = (v: number) => Math.round(v * 100) / 100;

function Campo({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <label className="block font-semibold text-slate-300 mb-1">{label}</label>
            {children}
        </div>
    );
}

export function FormNovoContrato({ parsedData, veiculosExistentes, onSuccess, onClose }: FormNovoContratoProps) {
    const [tipo, setTipo] = useState<'compra' | 'venda'>('compra');
    const [loja, setLoja] = useState<'manos' | 'v3'>('manos');
    const [dataContrato, setDataContrato] = useState('');

    // Dados do Veículo / Entrada
    const [marca, setMarca] = useState('');
    const [modelo, setModelo] = useState('');
    const [placa, setPlaca] = useState('');
    const [chassi, setChassi] = useState('');
    const [renavam, setRenavam] = useState('');
    const [anoFabricacao, setAnoFabricacao] = useState('');
    const [anoModelo, setAnoModelo] = useState('');
    const [km, setKm] = useState('');
    const [cor, setCor] = useState('');
    const [combustivel, setCombustivel] = useState('');
    const [valorCompra, setValorCompra] = useState('');
    const [formaLiquidacao, setFormaLiquidacao] = useState('');
    const [fornecedorNome, setFornecedorNome] = useState('');
    const [fornecedorCpfCnpj, setFornecedorCpfCnpj] = useState('');
    const [captador, setCaptador] = useState('');

    // De onde saiu o dinheiro da compra
    const [origemTipo, setOrigemTipo] = useState<OrigemTipo>('loja');
    const [origemManos, setOrigemManos] = useState('');
    const [origemV3, setOrigemV3] = useState('');

    // Dados da Venda / Saída
    const [veiculoIdSelecionado, setVeiculoIdSelecionado] = useState('');
    const [compradorNome, setCompradorNome] = useState('');
    const [compradorCpfCnpj, setCompradorCpfCnpj] = useState('');
    const [valorVenda, setValorVenda] = useState('');
    const [valorEntradaMoeda, setValorEntradaMoeda] = useState('');
    const [saldoDevedor, setSaldoDevedor] = useState('');
    const [vendedorResponsavel, setVendedorResponsavel] = useState('');

    // Permuta (Veículo de Troca)
    const [temTroca, setTemTroca] = useState(false);
    const [trocaMarca, setTrocaMarca] = useState('');
    const [trocaModelo, setTrocaModelo] = useState('');
    const [trocaPlaca, setTrocaPlaca] = useState('');
    const [trocaChassi, setTrocaChassi] = useState('');
    const [trocaRenavam, setTrocaRenavam] = useState('');
    const [trocaAnoFabricacao, setTrocaAnoFabricacao] = useState('');
    const [trocaAnoModelo, setTrocaAnoModelo] = useState('');
    const [trocaKm, setTrocaKm] = useState('');
    const [trocaCor, setTrocaCor] = useState('');
    const [trocaCombustivel, setTrocaCombustivel] = useState('');
    const [trocaData, setTrocaData] = useState('');
    const [valorTroca, setValorTroca] = useState('');

    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    // Auto-preenchimento ao receber dados do Parser PDF (só quando chega contrato novo,
    // pra não apagar o que foi editado quando a lista de veículos recarrega)
    useEffect(() => {
        if (!parsedData) return;
        const p = parsedData;

        if (p.lojaDetectada) setLoja(p.lojaDetectada);
        setTipo(p.tipo === 'venda' ? 'venda' : 'compra');
        setDataContrato(txt(p.dataContrato));

        setMarca(txt(p.marca));
        setModelo(txt(p.modelo));
        setPlaca(txt(p.placa));
        setChassi(txt(p.chassi));
        setRenavam(txt(p.renavam));
        setAnoFabricacao(txt(p.anoFabricacao));
        setAnoModelo(txt(p.anoModelo));
        setKm(txt(p.km));
        setCor(txt(p.cor));
        setCombustivel(txt(p.combustivel));

        setFornecedorNome(txt(p.nomeParteInversa));
        setFornecedorCpfCnpj(txt(p.cpfCnpjParteInversa));
        setCompradorNome(txt(p.nomeParteInversa));
        setCompradorCpfCnpj(txt(p.cpfCnpjParteInversa));
        setCaptador(txt(p.vendedorCaptador));
        setVendedorResponsavel(txt(p.vendedorCaptador));

        setValorCompra(txt(p.valorTotal));
        setValorVenda(txt(p.valorTotal));
        setFormaLiquidacao(txt(p.formaLiquidacao));
        setValorEntradaMoeda(txt(p.valorEntradaMoeda));
        setSaldoDevedor(txt(p.saldo));

        // o contrato não diz de qual caixa saiu o dinheiro: sempre perguntar de novo
        setOrigemTipo('loja');
        setOrigemManos('');
        setOrigemV3('');

        const t = p.troca;
        setTemTroca(!!p.temTroca);
        setTrocaMarca(txt(t?.marca));
        setTrocaModelo(txt(t?.modelo));
        setTrocaPlaca(txt(t?.placa));
        setTrocaChassi(txt(t?.chassi));
        setTrocaRenavam(txt(t?.renavam));
        setTrocaAnoFabricacao(txt(t?.anoFabricacao));
        setTrocaAnoModelo(txt(t?.anoModelo));
        setTrocaKm(txt(t?.km));
        setTrocaCor(txt(t?.cor));
        setTrocaCombustivel(txt(t?.combustivel));
        setTrocaData(txt(t?.dataNegociacao));
        setValorTroca(txt(t?.valorNegociado));
    }, [parsedData]);

    // Venda: acha no estoque o carro do contrato (placa, depois chassi)
    const veiculoDoContrato = useMemo(() => {
        if (parsedData?.tipo !== 'venda') return undefined;
        const placaContrato = normPlaca(parsedData.placa);
        const chassiContrato = (parsedData.chassi || '').toUpperCase();
        return veiculosExistentes.find(
            (v) =>
                (placaContrato && normPlaca(v.placa) === placaContrato) ||
                (chassiContrato && (v.chassi || '').toUpperCase() === chassiContrato)
        );
    }, [parsedData, veiculosExistentes]);

    useEffect(() => {
        if (veiculoDoContrato && veiculoDoContrato.status !== 'vendido') {
            setVeiculoIdSelecionado(veiculoDoContrato.id);
        }
    }, [veiculoDoContrato]);

    const pagamentosContrato = useMemo(
        () =>
            parsedData?.tipo === 'venda'
                ? parsedData.lancamentos.filter((l) => l.tipo === 'entrada' && l.tipoPagamento && l.tipoPagamento !== 'permuta_veiculo')
                : [],
        [parsedData]
    );

    const duplicadoCompra =
        tipo === 'compra' && normPlaca(placa)
            ? veiculosExistentes.find((v) => normPlaca(v.placa) === normPlaca(placa))
            : undefined;

    const valorCompraNum = Number(valorCompra) || 0;
    const metadeCompra = r2(valorCompraNum / 2);
    const faltaOrigem = r2(valorCompraNum - (Number(origemManos) || 0) - (Number(origemV3) || 0));

    const veiculosEmEstoque = veiculosExistentes.filter((v) => v.status !== 'vendido');
    const veiculoSelecionado = veiculosExistentes.find((v) => v.id === veiculoIdSelecionado);
    const valorVendaNum = num(valorVenda);
    const lucroBrutoPrevisto =
        veiculoSelecionado && valorVendaNum !== undefined
            ? valorVendaNum - Number(veiculoSelecionado.custo_aquisicao_inicial || 0)
            : undefined;
    const entradaCalculada = Math.max((valorVendaNum || 0) - (temTroca ? num(valorTroca) || 0 : 0) - (num(saldoDevedor) || 0), 0);

    const montarOrigemPagamento = (total: number): { loja: 'manos' | 'v3'; valor: number }[] => {
        if (origemTipo === 'meio') {
            const manos = r2(total / 2);
            return [{ loja: 'manos', valor: manos }, { loja: 'v3', valor: r2(total - manos) }];
        }
        if (origemTipo === 'personalizado') {
            const manos = Number(origemManos) || 0;
            const v3 = Number(origemV3) || 0;
            if (Math.abs(manos + v3 - total) > 0.01) {
                throw new Error(`Manos (${brl(manos)}) + V3 (${brl(v3)}) precisa fechar o valor da compra (${brl(total)}).`);
            }
            return [{ loja: 'manos' as const, valor: manos }, { loja: 'v3' as const, valor: v3 }].filter((p) => p.valor > 0);
        }
        return [{ loja, valor: total }];
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSalvando(true);
        setErro('');

        try {
            if (tipo === 'compra') {
                const valNum = Number(valorCompra);
                if (!valorCompra || isNaN(valNum) || valNum <= 0) throw new Error('Informe o valor de compra negociado.');
                if (!marca || !modelo) throw new Error('Marca e Modelo são obrigatórios.');
                const origemPagamento = montarOrigemPagamento(valNum);

                const res = await fetch('/api/societario/fechamento', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ação: 'compra',
                        loja,
                        marca,
                        modelo,
                        placa,
                        chassi,
                        renavam,
                        ano_fabricacao: num(anoFabricacao),
                        ano_modelo: num(anoModelo),
                        km: num(km),
                        cor: cor || undefined,
                        combustivel: combustivel || undefined,
                        fornecedor_nome: fornecedorNome || 'Fornecedor Particular',
                        fornecedor_cpf_cnpj: fornecedorCpfCnpj || undefined,
                        captador_vendedor: captador || undefined,
                        valor_acordado_compra: valNum,
                        forma_liquidacao: formaLiquidacao || undefined,
                        data_contrato: dataContrato || undefined,
                        origem_pagamento: origemPagamento
                    })
                });

                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Erro ao cadastrar compra.');
            } else {
                // Cadastro de Venda
                if (!veiculoIdSelecionado) throw new Error('Selecione o veículo em estoque que está sendo vendido.');
                if (valorVendaNum === undefined || isNaN(valorVendaNum) || valorVendaNum <= 0) throw new Error('Informe o valor final da venda.');
                const valorTrocaNum = num(valorTroca) || 0;
                if (temTroca && valorTrocaNum <= 0) throw new Error('Informe o valor da troca.');
                if (temTroca && !trocaModelo && !trocaPlaca) throw new Error('Informe o modelo ou a placa do carro da troca.');

                const res = await fetch('/api/societario/fechamento', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ação: 'venda',
                        loja,
                        veiculo_id: veiculoIdSelecionado,
                        comprador_nome: compradorNome || 'Cliente Comprador',
                        comprador_cpf_cnpj: compradorCpfCnpj || undefined,
                        vendedor_responsavel: vendedorResponsavel || undefined,
                        valor_venda_fechado: valorVendaNum,
                        valor_entrada_moeda: num(valorEntradaMoeda) ?? entradaCalculada,
                        saldo_devedor: num(saldoDevedor) || 0,
                        data_contrato: dataContrato || undefined,
                        tem_troca: temTroca,
                        troca_marca: temTroca ? trocaMarca || undefined : undefined,
                        troca_modelo: temTroca ? trocaModelo || undefined : undefined,
                        troca_placa: temTroca ? trocaPlaca || undefined : undefined,
                        troca_chassi: temTroca ? trocaChassi || undefined : undefined,
                        troca_renavam: temTroca ? trocaRenavam || undefined : undefined,
                        troca_ano_fabricacao: temTroca ? num(trocaAnoFabricacao) : undefined,
                        troca_ano_modelo: temTroca ? num(trocaAnoModelo) : undefined,
                        troca_km: temTroca ? num(trocaKm) : undefined,
                        troca_cor: temTroca ? trocaCor || undefined : undefined,
                        troca_combustivel: temTroca ? trocaCombustivel || undefined : undefined,
                        troca_data: temTroca ? trocaData || undefined : undefined,
                        valor_veiculo_troca: temTroca ? valorTrocaNum : 0,
                        pagamentos: pagamentosContrato.map((l) => ({
                            tipo_pagamento: l.tipoPagamento,
                            valor: l.valor,
                            descricao: l.descricao,
                            data_pagamento: l.data
                        }))
                    })
                });

                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Erro ao cadastrar venda.');
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            setErro(err.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden relative my-8">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Plus className="w-5 h-5 text-emerald-400" /> Cadastrar Operação de Veículo
                        </h3>
                        {parsedData && (
                            <p className="text-[11px] text-purple-300 mt-0.5">
                                Preenchido pelo contrato{parsedData.empresaRazaoSocial ? ` · ${parsedData.empresaRazaoSocial}` : ''} — revise e salve
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Seleção do Tipo (Compra vs Venda) */}
                <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={() => setTipo('compra')}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                            tipo === 'compra'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                        <FileText className="w-4 h-4" /> 1. Contrato de Compra (Entrada Estoque)
                    </button>

                    <button
                        type="button"
                        onClick={() => setTipo('venda')}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                            tipo === 'venda'
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                        <CheckCircle2 className="w-4 h-4" /> 2. Contrato de Venda (Saída & Fechamento)
                    </button>
                </div>

                {/* Formulário */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs max-h-[70vh] overflow-y-auto">
                    {parsedData && parsedData.alertas.length > 0 && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
                            {parsedData.alertas.map((a, idx) => (
                                <p key={idx} className="text-[11px] text-amber-300 flex items-start gap-1">
                                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {a}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Seleção de Loja (Origem do Caixa) */}
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-300">
                            Loja Responsável pela Operação (Caixa)
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setLoja('manos')}
                                className={`py-2 rounded-lg font-bold text-xs border transition-all ${
                                    loja === 'manos'
                                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                🏬 Manos Veículos
                            </button>
                            <button
                                type="button"
                                onClick={() => setLoja('v3')}
                                className={`py-2 rounded-lg font-bold text-xs border transition-all ${
                                    loja === 'v3'
                                        ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                🏎️ V3 Automóveis
                            </button>
                        </div>
                    </div>

                    {erro && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg">
                            {erro}
                        </div>
                    )}

                    {tipo === 'compra' ? (
                        <>
                            {duplicadoCompra && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>
                                        A placa {normPlaca(placa)} já está cadastrada ({duplicadoCompra.status === 'vendido' ? 'vendida' : duplicadoCompra.origem === 'permuta_troca' ? 'entrou como troca' : 'em estoque'}). Salvar vai ser bloqueado pra não duplicar.
                                    </span>
                                </div>
                            )}

                            {/* Dados do Veículo de Entrada */}
                            <div className="grid grid-cols-2 gap-3">
                                <Campo label="Marca *">
                                    <input type="text" placeholder="ex: GWM, Fiat, Toyota" value={marca} onChange={(e) => setMarca(e.target.value)} required className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Modelo *">
                                    <input type="text" placeholder="ex: Haval H6 GT 1.5 AWD" value={modelo} onChange={(e) => setModelo(e.target.value)} required className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <Campo label="Placa">
                                    <input type="text" placeholder="ex: SXD5H10" value={placa} onChange={(e) => setPlaca(e.target.value)} className={`${inputBase} font-mono uppercase focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Chassi">
                                    <input type="text" placeholder="17 caracteres" value={chassi} onChange={(e) => setChassi(e.target.value)} className={`${inputBase} font-mono uppercase focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Renavam">
                                    <input type="text" value={renavam} onChange={(e) => setRenavam(e.target.value)} className={`${inputBase} font-mono focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Ano Fabricação">
                                    <input type="number" placeholder="ex: 2024" value={anoFabricacao} onChange={(e) => setAnoFabricacao(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Ano Modelo">
                                    <input type="number" placeholder="ex: 2025" value={anoModelo} onChange={(e) => setAnoModelo(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                                <Campo label="KM">
                                    <input type="number" placeholder="ex: 33000" value={km} onChange={(e) => setKm(e.target.value)} className={`${inputBase} font-mono focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Cor">
                                    <input type="text" value={cor} onChange={(e) => setCor(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Combustível">
                                    <input type="text" value={combustivel} onChange={(e) => setCombustivel(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Data do Contrato">
                                    <input type="date" value={dataContrato} onChange={(e) => setDataContrato(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Campo label="Custo de Aquisição (R$) *">
                                    <input type="number" step="0.01" placeholder="215000.00" value={valorCompra} onChange={(e) => setValorCompra(e.target.value)} required className={`${inputBase} text-emerald-400 font-bold font-mono focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Forma de Liquidação">
                                    <input type="text" placeholder="ex: DDA, DOC/TED, PIX" value={formaLiquidacao} onChange={(e) => setFormaLiquidacao(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                            </div>

                            {/* De onde saiu o dinheiro da compra */}
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                                <label className="block font-semibold text-slate-300">De onde saiu o dinheiro da compra</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {([
                                        ['loja', `100% ${NOME_LOJA[loja]}`],
                                        ['meio', 'Meio a meio'],
                                        ['personalizado', 'Personalizado']
                                    ] as [OrigemTipo, string][]).map(([valor, rotulo]) => (
                                        <button
                                            key={valor}
                                            type="button"
                                            onClick={() => setOrigemTipo(valor)}
                                            className={`py-2 rounded-lg font-bold border transition-all ${
                                                origemTipo === valor
                                                    ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            {rotulo}
                                        </button>
                                    ))}
                                </div>

                                {origemTipo === 'meio' && valorCompraNum > 0 && (
                                    <p className="text-[11px] text-slate-400">
                                        Manos Veículos {brl(metadeCompra)} · V3 Automóveis {brl(r2(valorCompraNum - metadeCompra))}
                                    </p>
                                )}

                                {origemTipo === 'personalizado' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <Campo label="Manos Veículos (R$)">
                                            <input type="number" step="0.01" value={origemManos} onChange={(e) => setOrigemManos(e.target.value)} className={`${inputBase} font-mono focus:border-blue-500`} />
                                        </Campo>
                                        <Campo label="V3 Automóveis (R$)">
                                            <input type="number" step="0.01" value={origemV3} onChange={(e) => setOrigemV3(e.target.value)} className={`${inputBase} font-mono focus:border-blue-500`} />
                                        </Campo>
                                        {valorCompraNum > 0 && faltaOrigem !== 0 && (
                                            <p className="col-span-2 text-[11px] text-amber-400">
                                                {faltaOrigem > 0 ? `Falta ${brl(faltaOrigem)} pra fechar a compra.` : `Passou ${brl(-faltaOrigem)} do valor da compra.`}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <Campo label="Fornecedor (quem vendeu pra loja)">
                                    <input type="text" placeholder="ex: João da Silva" value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                                <Campo label="CPF/CNPJ do Fornecedor">
                                    <input type="text" value={fornecedorCpfCnpj} onChange={(e) => setFornecedorCpfCnpj(e.target.value)} className={`${inputBase} font-mono focus:border-blue-500`} />
                                </Campo>
                                <Campo label="Captador (vendedor da loja)">
                                    <input type="text" value={captador} onChange={(e) => setCaptador(e.target.value)} className={`${inputBase} focus:border-blue-500`} />
                                </Campo>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Pareamento do carro do contrato com o estoque */}
                            {parsedData?.tipo === 'venda' && (
                                veiculoDoContrato && veiculoDoContrato.status !== 'vendido' ? (
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg flex items-center gap-2">
                                        <Link2 className="w-4 h-4 shrink-0" />
                                        Pareado com o estoque: [{veiculoDoContrato.placa}] {veiculoDoContrato.marca} {veiculoDoContrato.modelo}
                                    </div>
                                ) : veiculoDoContrato ? (
                                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        A venda da placa {veiculoDoContrato.placa} já foi registrada. Salvar vai ser bloqueado.
                                    </div>
                                ) : (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        <span>
                                            A placa {parsedData.placa || parsedData.chassi} não está no estoque. Suba primeiro o contrato de compra dela
                                            (sem a compra o lucro sai errado) ou escolha o veículo abaixo.
                                        </span>
                                    </div>
                                )
                            )}

                            {/* Seleção do Veículo para Venda */}
                            <Campo label="Veículo do Estoque *">
                                <select
                                    value={veiculoIdSelecionado}
                                    onChange={(e) => setVeiculoIdSelecionado(e.target.value)}
                                    required
                                    className={`${inputBase} focus:border-emerald-500`}
                                >
                                    <option value="">-- Escolha um veículo disponível --</option>
                                    {veiculosEmEstoque.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.placa ? `[${v.placa}]` : '[Sem Placa]'} {v.marca} {v.modelo} (Custo: {brl(Number(v.custo_aquisicao_inicial || 0))})
                                        </option>
                                    ))}
                                </select>
                            </Campo>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <Campo label="Valor Negociado de Venda (R$) *">
                                    <input type="number" step="0.01" placeholder="249000.00" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} required className={`${inputBase} text-emerald-400 font-bold font-mono focus:border-emerald-500`} />
                                </Campo>
                                <Campo label="Data do Contrato">
                                    <input type="date" value={dataContrato} onChange={(e) => setDataContrato(e.target.value)} className={`${inputBase} focus:border-emerald-500`} />
                                </Campo>
                                <Campo label="Vendedor Responsável">
                                    <input type="text" value={vendedorResponsavel} onChange={(e) => setVendedorResponsavel(e.target.value)} className={`${inputBase} focus:border-emerald-500`} />
                                </Campo>
                                <Campo label="Comprador / Cliente">
                                    <input type="text" placeholder="ex: Pack Embalagens Ltda" value={compradorNome} onChange={(e) => setCompradorNome(e.target.value)} className={`${inputBase} focus:border-emerald-500`} />
                                </Campo>
                                <Campo label="CPF/CNPJ do Comprador">
                                    <input type="text" value={compradorCpfCnpj} onChange={(e) => setCompradorCpfCnpj(e.target.value)} className={`${inputBase} font-mono focus:border-emerald-500`} />
                                </Campo>
                                <Campo label="Entrada em Dinheiro (R$)">
                                    <input type="number" step="0.01" placeholder={entradaCalculada.toFixed(2)} value={valorEntradaMoeda} onChange={(e) => setValorEntradaMoeda(e.target.value)} className={`${inputBase} font-mono focus:border-emerald-500`} />
                                </Campo>
                                <Campo label="Saldo Devedor (R$)">
                                    <input type="number" step="0.01" placeholder="0.00" value={saldoDevedor} onChange={(e) => setSaldoDevedor(e.target.value)} className={`${inputBase} font-mono focus:border-emerald-500`} />
                                </Campo>
                            </div>

                            {lucroBrutoPrevisto !== undefined && (
                                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap gap-x-6 gap-y-1">
                                    <span className="text-slate-400">Custo: <strong className="text-white font-mono">{brl(Number(veiculoSelecionado.custo_aquisicao_inicial || 0))}</strong></span>
                                    <span className="text-slate-400">Venda: <strong className="text-white font-mono">{brl(valorVendaNum || 0)}</strong></span>
                                    <span className="text-slate-400">
                                        Lucro bruto: <strong className={`font-mono ${lucroBrutoPrevisto >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{brl(lucroBrutoPrevisto)}</strong>
                                    </span>
                                    <span className="text-slate-400">
                                        Comissão {NOME_LOJA[loja]} ({PCT_COMISSAO_VENDA}%): <strong className="text-orange-300 font-mono">{brl(comissaoAutomatica(valorVendaNum || 0, Number(veiculoSelecionado.custo_aquisicao_inicial || 0)))}</strong>
                                    </span>
                                </div>
                            )}

                            {pagamentosContrato.length > 0 && (
                                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                                    <span className="block font-semibold text-slate-300">Pagamentos do contrato (serão lançados)</span>
                                    {pagamentosContrato.map((l, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-3 text-slate-400">
                                            <span className="truncate">{l.forma || l.tipoPagamento} {l.data ? `· ${l.data.split('-').reverse().join('/')}` : ''}</span>
                                            <span className="font-mono text-white">{brl(l.valor)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Seção de Permuta / Veículo de Troca */}
                            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                                <label className="flex items-center gap-2 font-bold text-amber-400 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={temTroca}
                                        onChange={(e) => setTemTroca(e.target.checked)}
                                        className="rounded border-slate-800 text-emerald-500 focus:ring-0"
                                    />
                                    <ArrowRightLeft className="w-4 h-4" /> Carro recebido na troca (entra no estoque com custo = valor da troca)
                                </label>

                                {temTroca && (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                                        <Campo label="Marca">
                                            <input type="text" placeholder="ex: Fiat" value={trocaMarca} onChange={(e) => setTrocaMarca(e.target.value)} className={`${inputBase} bg-slate-900`} />
                                        </Campo>
                                        <Campo label="Modelo">
                                            <input type="text" placeholder="ex: Toro Ranch 2.0 Diesel" value={trocaModelo} onChange={(e) => setTrocaModelo(e.target.value)} className={`${inputBase} bg-slate-900`} />
                                        </Campo>
                                        <Campo label="Valor da Troca (R$) *">
                                            <input type="number" step="0.01" placeholder="101000.00" value={valorTroca} onChange={(e) => setValorTroca(e.target.value)} className={`${inputBase} bg-slate-900 text-amber-400 font-bold font-mono`} />
                                        </Campo>
                                        <Campo label="Placa">
                                            <input type="text" placeholder="ex: RXO5F25" value={trocaPlaca} onChange={(e) => setTrocaPlaca(e.target.value)} className={`${inputBase} bg-slate-900 font-mono uppercase`} />
                                        </Campo>
                                        <Campo label="Chassi">
                                            <input type="text" value={trocaChassi} onChange={(e) => setTrocaChassi(e.target.value)} className={`${inputBase} bg-slate-900 font-mono uppercase`} />
                                        </Campo>
                                        <Campo label="Renavam">
                                            <input type="text" value={trocaRenavam} onChange={(e) => setTrocaRenavam(e.target.value)} className={`${inputBase} bg-slate-900 font-mono`} />
                                        </Campo>
                                        <Campo label="Ano Fab.">
                                            <input type="number" value={trocaAnoFabricacao} onChange={(e) => setTrocaAnoFabricacao(e.target.value)} className={`${inputBase} bg-slate-900`} />
                                        </Campo>
                                        <Campo label="Ano Modelo">
                                            <input type="number" value={trocaAnoModelo} onChange={(e) => setTrocaAnoModelo(e.target.value)} className={`${inputBase} bg-slate-900`} />
                                        </Campo>
                                        <Campo label="KM">
                                            <input type="number" value={trocaKm} onChange={(e) => setTrocaKm(e.target.value)} className={`${inputBase} bg-slate-900 font-mono`} />
                                        </Campo>
                                        <Campo label="Cor">
                                            <input type="text" value={trocaCor} onChange={(e) => setTrocaCor(e.target.value)} className={`${inputBase} bg-slate-900`} />
                                        </Campo>
                                        <Campo label="Combustível">
                                            <input type="text" value={trocaCombustivel} onChange={(e) => setTrocaCombustivel(e.target.value)} className={`${inputBase} bg-slate-900`} />
                                        </Campo>
                                        <Campo label="Data de Entrada">
                                            <input type="date" value={trocaData} onChange={(e) => setTrocaData(e.target.value)} className={`${inputBase} bg-slate-900`} />
                                        </Campo>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Submit */}
                    <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={salvando}
                            className={`px-5 py-2.5 font-bold text-white rounded-xl transition-all shadow-lg disabled:opacity-50 ${
                                tipo === 'compra' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                            }`}
                        >
                            {salvando ? 'Salvando...' : tipo === 'compra' ? 'Cadastrar Entrada de Compra' : 'Finalizar Venda & Apurar Lucro'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
