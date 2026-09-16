'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, Loader2, Car, CheckCircle2, ShieldCheck, DollarSign, Calendar, FileText, UserCheck, Lock, X, ArrowRightLeft, Landmark } from 'lucide-react';
import { calcularFechamento, comissaoAutomatica, NOME_LOJA } from '@/lib/services/societarioService';
import { origemDaCompra } from '@/lib/services/societarioAcerto';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

interface RelatorioNegociacaoPdfProps {
    veiculo: any;
    comissaoVendedorEdicao?: number;
    impostoNfEdicao?: number;
    pctAlexandreEdicao?: number;
    pctIvoEdicao?: number;
    gastosEdicao?: Array<{
        categoria: string;
        descricao: string;
        valor: string | number;
        data_custo?: string;
        loja_pagadora?: string;
    }>;
    onClose?: () => void;
}

const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const dataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Pendente';

const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
};

export function RelatorioNegociacaoPdf({
    veiculo,
    comissaoVendedorEdicao,
    impostoNfEdicao,
    pctAlexandreEdicao,
    pctIvoEdicao,
    gastosEdicao,
    onClose
}: RelatorioNegociacaoPdfProps) {
    const [mounted, setMounted] = useState(false);
    const [baixandoPdf, setBaixandoPdf] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!veiculo || !mounted) return null;

    const contratoCompra = Array.isArray(veiculo?.contratos_compra) ? veiculo.contratos_compra[0] : veiculo?.contratos_compra;
    const contratoVenda = Array.isArray(veiculo?.contratos_venda) ? veiculo.contratos_venda[0] : veiculo?.contratos_venda;
    const fechamento = Array.isArray(veiculo?.fechamentos_lucro) ? veiculo.fechamentos_lucro[0] : veiculo?.fechamentos_lucro;

    const custoAquisicao = Number(veiculo.custo_aquisicao_inicial || 0);
    const valorVenda = Number(contratoVenda?.valor_venda_fechado || fechamento?.valor_venda || 0);
    const vendido = !!contratoVenda && valorVenda > 0;

    const comissaoVendedor = comissaoVendedorEdicao !== undefined ? comissaoVendedorEdicao : Number(fechamento?.comissao_vendedor || 0);
    const impostoNf = impostoNfEdicao !== undefined ? impostoNfEdicao : Number(fechamento?.imposto_nf || 0);
    const pctAlexandre = pctAlexandreEdicao !== undefined ? pctAlexandreEdicao : Number(fechamento?.pct_alexandre ?? 50);
    const pctIvo = pctIvoEdicao !== undefined ? pctIvoEdicao : Number(fechamento?.pct_ivo ?? 50);

    // Gastos
    const listaGastos = (gastosEdicao || (veiculo?.custos_adicionais || [])).map((c: any) => ({
        categoria: c.categoria,
        descricao: c.descricao || '',
        valor: Number(c.valor) || 0,
        data_custo: c.data_custo,
        loja_pagadora: c.loja_pagadora || veiculo?.loja_atual || 'manos'
    }));

    const totalCustosExtras = listaGastos.reduce((acc: number, g: any) => acc + (Number(g.valor) || 0), 0);

    // Gastos por loja
    const gastosManos = listaGastos.filter((g: any) => g.loja_pagadora === 'manos').reduce((acc: number, g: any) => acc + (Number(g.valor) || 0), 0);
    const gastosV3 = listaGastos.filter((g: any) => g.loja_pagadora !== 'manos').reduce((acc: number, g: any) => acc + (Number(g.valor) || 0), 0);

    // Fechamento financeiro (DRE)
    const calc = calcularFechamento({
        custoAquisicao,
        valorVenda,
        comissaoVendedor,
        impostoNf,
        totalCustosExtras,
        pctAlexandre,
        pctIvo
    });

    // Entradas e Aportes na Compra
    const entradasCompra: any[] = veiculo.pagamentos_compra || [];
    let aporteManos = 0;
    let aporteV3 = 0;

    if (entradasCompra.length > 0) {
        aporteManos = entradasCompra.filter((e: any) => e.loja === 'manos').reduce((acc: number, e: any) => acc + Number(e.valor || 0), 0);
        aporteV3 = entradasCompra.filter((e: any) => e.loja !== 'manos').reduce((acc: number, e: any) => acc + Number(e.valor || 0), 0);
    } else {
        aporteManos = custoAquisicao / 2;
        aporteV3 = custoAquisicao / 2;
    }

    // Cálculo do Repasse entre as Lojas (Quem paga quem)
    const lojaRecebedoraVenda = contratoVenda?.loja_recebedora || 'manos';
    const isManosRecebeu = lojaRecebedoraVenda === 'manos';

    // O que a V3 tem a receber se a Manos recebeu a venda:
    // (Aporte da V3 na Compra + Gastos que a V3 pagou + Cota de Lucro do Ivo)
    const repasseParaV3 = aporteV3 + gastosV3 + calc.cotaIvo;

    // O que a Manos tem a receber se a V3 recebeu a venda:
    // (Aporte da Manos na Compra + Gastos que a Manos pagou + Cota de Lucro do Alexandre)
    const repasseParaManos = aporteManos + gastosManos + calc.cotaAlexandre;

    const aprovadoAlexandre = veiculo?.aprovado_alexandre_em;
    const aprovadoIvo = veiculo?.aprovado_ivo_em;
    const travada = !!(aprovadoAlexandre && aprovadoIvo);

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPdf = async () => {
        setBaixandoPdf(true);
        try {
            const element = document.getElementById('printable-relatorio-content');
            if (!element) throw new Error('Conteúdo do relatório não encontrado.');

            // Captura Ultra HD 4x DPI com recursos locais (/logo-manos.png e /logo-v3.png)
            const dataUrl = await toPng(element, {
                quality: 1.0,
                pixelRatio: 4,
                cacheBust: false,
                backgroundColor: '#ffffff'
            });

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            const pageHeight = pdf.internal.pageSize.getHeight();

            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 2) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }

            const cleanMarca = (veiculo.marca || 'Veiculo').replace(/[^a-zA-Z0-9]/g, '_');
            const cleanPlaca = (veiculo.placa || 'SemPlaca').replace(/[^a-zA-Z0-9]/g, '');
            const filename = `Relatorio_Negociacao_${cleanMarca}_${cleanPlaca}.pdf`;
            pdf.save(filename);
        } catch (err: any) {
            console.error('Erro ao gerar download de PDF:', err);
            alert('Aviso na conversão do PDF: ' + (err?.message || 'Falha na captura.'));
        } finally {
            setBaixandoPdf(false);
        }
    };

    const modalJSX = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto" id="printable-relatorio-wrapper">
            {/* CSS de Impressão Isolado e Remoção Global de Scrollbars */}
            <style jsx global>{`
                #printable-relatorio-content ::-webkit-scrollbar {
                    display: none !important;
                    width: 0px !important;
                    height: 0px !important;
                }
                #printable-relatorio-content * {
                    -ms-overflow-style: none !important;
                    scrollbar-width: none !important;
                }
                @media print {
                    nav, header, footer, main, .no-print, [role="dialog"]:not(#printable-relatorio-wrapper) {
                        display: none !important;
                    }
                    body, html {
                        background: #ffffff !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        min-height: auto !important;
                        overflow: visible !important;
                    }
                    #printable-relatorio-wrapper {
                        position: static !important;
                        display: block !important;
                        width: 100% !important;
                        height: auto !important;
                        max-height: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        box-shadow: none !important;
                        border: none !important;
                        overflow: visible !important;
                        inset: auto !important;
                        transform: none !important;
                    }
                    #printable-relatorio-scroll-container {
                        max-height: none !important;
                        height: auto !important;
                        overflow: visible !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        background: #ffffff !important;
                    }
                    #printable-relatorio-content {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        border: none !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        border-radius: 0 !important;
                    }
                    .print-card, .print-no-break {
                        background: #ffffff !important;
                        border: 1px solid #cbd5e1 !important;
                        color: #000000 !important;
                        box-shadow: none !important;
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                        margin-bottom: 12px !important;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 8mm 10mm 8mm 10mm;
                    }
                }
            `}</style>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden relative my-8">
                {/* Actions Bar (No Print) */}
                <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between no-print">
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                        <FileText className="w-5 h-5 text-emerald-400" />
                        Relatório Detalhado de Negociação (PDF)
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDownloadPdf}
                            disabled={baixandoPdf}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
                        >
                            {baixandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {baixandoPdf ? 'Gerando PDF...' : 'Baixar Arquivo PDF'}
                        </button>
                        <button
                            onClick={handlePrint}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
                            title="Abrir diálogo de impressão do navegador"
                        >
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Conteúdo do Relatório em Papel Branco */}
                <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 bg-slate-900 print:bg-white" id="printable-relatorio-scroll-container">
                    <div id="printable-relatorio-content" className="p-6 space-y-5 bg-white text-slate-900 rounded-xl">
                        {/* Header do Documento com Dupla Logo Local */}
                        <div className="border-b-2 border-slate-300 pb-4 flex justify-between items-center print-no-break">
                            <div className="flex items-center gap-4">
                                {/* Logo Manos Veículos Local */}
                                <img
                                    src="/logo-manos.png"
                                    alt="Manos Veículos"
                                    className="h-12 w-auto object-contain"
                                />
                                <div className="h-10 w-px bg-slate-300"></div>
                                {/* Logo V3 Automóveis Local */}
                                <img
                                    src="/logo-v3.png"
                                    alt="V3 Automóveis"
                                    className="h-12 w-auto object-contain"
                                />
                            </div>

                            <div className="text-right">
                                <h1 className="text-base font-black text-slate-900 uppercase tracking-wider">
                                    MANOS VEÍCULOS & V3 AUTOMÓVEIS
                                </h1>
                                <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                                    Relatório Detalhado de Fechamento de Negociação
                                </h2>
                                <div className="text-[11px] text-slate-600 mt-1 font-mono">
                                    Data Emissão: <strong>{new Date().toLocaleDateString('pt-BR')}</strong> | Status:{' '}
                                    <strong className={travada ? 'text-emerald-700' : 'text-amber-700'}>
                                        {travada ? 'APROVADO E TRAVADO' : 'PENDENTE DE APROVAÇÃO'}
                                    </strong>
                                </div>
                            </div>
                        </div>

                        {/* 1. Ficha do Veículo */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 space-y-2.5 print-no-break">
                            <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-300 pb-1.5">
                                <Car className="w-4 h-4 text-emerald-700" /> 1. Ficha Técnica do Veículo
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-800">
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Veículo</span>
                                    <span className="font-bold text-sm text-slate-900">{veiculo.marca} {veiculo.modelo}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Placa</span>
                                    <span className="font-mono font-bold text-emerald-700 text-sm">{veiculo.placa || 'SEM PLACA'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Ano / Cor</span>
                                    <span>{veiculo.ano_fabricacao || veiculo.ano_modelo || 'N/I'} · {veiculo.cor || 'N/I'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">KM / Combustível</span>
                                    <span>{veiculo.km ? `${veiculo.km.toLocaleString('pt-BR')} km` : 'N/I'} · {veiculo.combustivel || 'Flex'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Chassi</span>
                                    <span className="font-mono text-[11px]">{veiculo.chassi || 'N/I'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Renavam</span>
                                    <span className="font-mono text-[11px]">{veiculo.renavam || 'N/I'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Status Atual</span>
                                    <span className="capitalize font-semibold">{veiculo.status}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Origem Entrada</span>
                                    <span className="capitalize">{veiculo.origem === 'permuta_troca' ? 'Permuta (Troca)' : 'Compra Direta'}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2 & 3. Grid Compra x Venda */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print-no-break">
                            {/* Contrato Compra */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 space-y-2 text-xs">
                                <h3 className="font-bold text-blue-800 uppercase tracking-wider border-b border-slate-300 pb-1.5 flex justify-between">
                                    <span>2. Operação de Compra (Entrada)</span>
                                    <span className="text-slate-500">{dataBr(contratoCompra?.data_contrato || veiculo.data_entrada)}</span>
                                </h3>
                                <div className="space-y-1.5 text-slate-800">
                                    <div><strong className="text-slate-500">Fornecedor:</strong> {contratoCompra?.fornecedor_nome || 'N/A'} {contratoCompra?.fornecedor_cpf_cnpj ? `(${contratoCompra.fornecedor_cpf_cnpj})` : ''}</div>
                                    <div><strong className="text-slate-500">Captador:</strong> {contratoCompra?.captador_vendedor || 'N/A'}</div>
                                    <div><strong className="text-slate-500">Forma Liquidação:</strong> {contratoCompra?.forma_liquidacao || 'DDA/TED'}</div>
                                    <div><strong className="text-slate-500">Loja do Contrato:</strong> {NOME_LOJA[contratoCompra?.loja_pagadora] || 'Manos Veículos'}</div>
                                    <div className="pt-2 border-t border-slate-300 flex justify-between items-center font-mono">
                                        <span className="font-bold text-slate-700">CUSTO DE COMPRA:</span>
                                        <span className="font-bold text-base text-slate-900">{formatBRL(custoAquisicao)}</span>
                                    </div>
                                </div>

                                {/* Desembolso/Aportes da Compra por Loja */}
                                <div className="mt-2 pt-2 border-t border-slate-300 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Desembolso da Compra por Empresa:</span>
                                    <div className="flex justify-between text-[11px] font-mono">
                                        <span>Manos Veículos (Alexandre):</span>
                                        <span className="font-bold text-slate-900">{formatBRL(aporteManos)}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] font-mono">
                                        <span>V3 Automóveis (Ivo):</span>
                                        <span className="font-bold text-slate-900">{formatBRL(aporteV3)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Contrato Venda */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 space-y-2 text-xs">
                                <h3 className="font-bold text-emerald-800 uppercase tracking-wider border-b border-slate-300 pb-1.5 flex justify-between">
                                    <span>3. Operação de Venda (Saída)</span>
                                    <span className="text-slate-500">{dataBr(contratoVenda?.data_contrato || veiculo.data_venda)}</span>
                                </h3>
                                <div className="space-y-1.5 text-slate-800">
                                    <div><strong className="text-slate-500">Comprador:</strong> {contratoVenda?.comprador_nome || 'Em Estoque'} {contratoVenda?.comprador_cpf_cnpj ? `(${contratoVenda.comprador_cpf_cnpj})` : ''}</div>
                                    <div><strong className="text-slate-500">Vendedor Responsável:</strong> {contratoVenda?.vendedor_responsavel || 'N/A'}</div>
                                    <div><strong className="text-slate-500">Loja Recebedora (Caixa):</strong> <span className="font-bold text-emerald-800">{NOME_LOJA[lojaRecebedoraVenda] || 'Manos Veículos'}</span></div>
                                    {contratoVenda?.valor_entrada_moeda > 0 && (
                                        <div><strong className="text-slate-500">Entrada Dinheiro/Pix:</strong> {formatBRL(contratoVenda.valor_entrada_moeda)}</div>
                                    )}
                                    {contratoVenda?.tem_troca && (
                                        <div>
                                            <strong className="text-slate-500">Veículo na Troca:</strong> {contratoVenda.troca_modelo} ({contratoVenda.troca_placa}) - {formatBRL(contratoVenda.valor_veiculo_troca)}
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-slate-300 flex justify-between items-center font-mono">
                                        <span className="font-bold text-slate-700">VALOR DA VENDA:</span>
                                        <span className="font-bold text-base text-emerald-700">{valorVenda > 0 ? formatBRL(valorVenda) : 'Em Estoque'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 4. Tabela de Custos Adicionais */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 space-y-2.5 print-no-break">
                            <div className="flex justify-between items-center border-b border-slate-300 pb-1.5">
                                <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                                    4. Custos Adicionais Lançados ({listaGastos.length})
                                </h3>
                                <span className="font-mono text-xs font-bold text-amber-900">
                                    Total Custos Extras: {formatBRL(totalCustosExtras)}
                                </span>
                            </div>
                            {listaGastos.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">Nenhum custo adicional registrado para este veículo.</p>
                            ) : (
                                <div className="w-full">
                                    <table className="w-full text-left text-xs border-collapse table-fixed">
                                        <thead>
                                            <tr className="border-b border-slate-300 text-slate-600 uppercase text-[10px]">
                                                <th className="p-1.5 w-[14%]">Data</th>
                                                <th className="p-1.5 w-[16%]">Categoria</th>
                                                <th className="p-1.5 w-[38%]">Descrição do Gasto</th>
                                                <th className="p-1.5 w-[18%]">Loja Pagadora</th>
                                                <th className="p-1.5 w-[14%] text-right">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {listaGastos.map((g: any, idx: number) => (
                                                <tr key={idx} className="text-slate-800">
                                                    <td className="p-1.5 font-mono text-[11px] truncate">{dataBr(g.data_custo)}</td>
                                                    <td className="p-1.5 capitalize font-semibold truncate">{g.categoria}</td>
                                                    <td className="p-1.5 break-words">{g.descricao}</td>
                                                    <td className="p-1.5 font-semibold text-emerald-800 truncate">
                                                        {NOME_LOJA[g.loja_pagadora] || g.loja_pagadora || 'Manos Veículos'}
                                                    </td>
                                                    <td className="p-1.5 font-mono font-bold text-right truncate">{formatBRL(Number(g.valor))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-slate-400 font-bold">
                                                <td colSpan={3} className="p-1.5 text-slate-600 text-[11px]">
                                                    Gastos Pago Manos: <strong className="text-slate-900">{formatBRL(gastosManos)}</strong> | Gastos Pago V3: <strong className="text-slate-900">{formatBRL(gastosV3)}</strong>
                                                </td>
                                                <td className="p-1.5 text-right uppercase text-[10px] text-slate-600">Total Custos:</td>
                                                <td className="p-1.5 text-right font-mono text-amber-900 text-sm">{formatBRL(totalCustosExtras)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* 5. DRE Financeiro (com Imposto e Comissão discriminados) */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 space-y-2.5 print-no-break">
                            <h3 className="text-xs font-bold text-purple-900 uppercase tracking-wider border-b border-slate-300 pb-1.5">
                                5. Demonstrativo Financeiro e Apuração de Lucro (DRE)
                            </h3>
                            <div className="space-y-1.5 text-xs font-mono">
                                <div className="flex justify-between text-slate-900">
                                    <span>(+) Receita Bruta de Venda Fechada:</span>
                                    <span className="font-bold text-emerald-700">{formatBRL(valorVenda)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>(-) Custo de Aquisição Inicial:</span>
                                    <span>{formatBRL(custoAquisicao)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>(-) Custos Extras da Operação (Oficina/Vistoria/Outros):</span>
                                    <span>{formatBRL(calc.totalCustosExtras)}</span>
                                </div>
                                <div className="flex justify-between text-slate-700 font-semibold bg-amber-50 p-1 rounded border border-amber-200">
                                    <span>(-) Comissão do Vendedor (Responsável: {contratoVenda?.vendedor_responsavel || 'N/A'}):</span>
                                    <span className="font-bold text-amber-800">{formatBRL(calc.comissaoVendedor)}</span>
                                </div>
                                <div className="flex justify-between text-slate-700 font-semibold bg-amber-50 p-1 rounded border border-amber-200">
                                    <span>(-) Imposto / Emissão de Nota Fiscal (NF):</span>
                                    <span className="font-bold text-amber-800">{formatBRL(calc.impostoNf)}</span>
                                </div>
                                <div className="pt-2 border-t-2 border-slate-400 flex justify-between items-center text-sm font-bold">
                                    <span className="text-slate-900">(=) LUCRO LÍQUIDO DA NEGOCIAÇÃO:</span>
                                    <span className={calc.lucroLiquido >= 0 ? 'text-emerald-700 font-black text-base' : 'text-rose-700 font-black text-base'}>
                                        {formatBRL(calc.lucroLiquido)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 6. Rateio de Lucro */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 space-y-2.5 print-no-break">
                            <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-slate-300 pb-1.5">
                                6. Rateio da Divisão de Lucro entre Sócios
                            </h3>
                            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                <div className="p-3 bg-white rounded-lg border border-slate-300">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase">Manos Veículos — Alexandre</div>
                                    <div className="text-base font-bold text-emerald-700 mt-1">
                                        {formatBRL(calc.cotaAlexandre)}
                                    </div>
                                    <div className="text-[10px] text-slate-500">Participação: {calc.pctAlexandre}% do Lucro Líquido</div>
                                </div>
                                <div className="p-3 bg-white rounded-lg border border-slate-300">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase">V3 Automóveis — Ivo</div>
                                    <div className="text-base font-bold text-emerald-700 mt-1">
                                        {formatBRL(calc.cotaIvo)}
                                    </div>
                                    <div className="text-[10px] text-slate-500">Participação: {calc.pctIvo}% do Lucro Líquido</div>
                                </div>
                            </div>
                        </div>

                        {/* 7. BALANÇO DE REPASSE E ACERTO ENTRE AS LOJAS (QUEM PAGA QUEM + DEDUÇÃO DE IMPOSTO E COMISSÃO) */}
                        <div className="bg-slate-50 rounded-xl p-4 border-2 border-emerald-600/40 space-y-3 print-no-break">
                            <h3 className="text-xs font-black text-emerald-800 uppercase tracking-wider border-b border-slate-300 pb-2 flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-emerald-700" />
                                7. Demonstrativo de Acerto de Repasse entre Lojas ("Quem paga quanto para quem")
                            </h3>

                            {!vendido ? (
                                <div className="p-3 bg-white rounded-lg text-xs text-slate-600 border border-slate-300">
                                    <strong>Veículo em Estoque:</strong> Investimento realizado na compra e custos extras acumulados:
                                    <div className="mt-1 flex gap-6 font-mono text-slate-900">
                                        <span>Manos: {formatBRL(aporteManos + gastosManos)}</span>
                                        <span>V3: {formatBRL(aporteV3 + gastosV3)}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">Nenhum repasse de caixa pendente até a realização da venda.</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-xs">
                                    <div className="p-2.5 bg-white rounded-lg border border-slate-300 flex justify-between items-center text-slate-800">
                                        <span><strong>Empresa Recebedora do Valor Bruto da Venda ({formatBRL(valorVenda)}):</strong></span>
                                        <span className="font-bold font-mono text-emerald-700">{NOME_LOJA[lojaRecebedoraVenda] || 'Manos Veículos'}</span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                                        {/* Composição do que a loja recebedora (Manos) retém/paga */}
                                        <div className="p-3 bg-white rounded-lg border border-slate-300 space-y-1">
                                            <div className="text-[10px] font-bold text-blue-800 uppercase">Deduções / Retenções da Loja Recebedora:</div>
                                            <div className="flex justify-between text-slate-600"><span>• Aporte de Compra Retido:</span><span>{formatBRL(aporteManos)}</span></div>
                                            <div className="flex justify-between text-slate-600"><span>• Gastos Adicionais Pagos Retidos:</span><span>{formatBRL(gastosManos)}</span></div>
                                            <div className="flex justify-between text-amber-800 font-semibold"><span>• Comissão de Vendedor (Paga/Deduc):</span><span>{formatBRL(calc.comissaoVendedor)}</span></div>
                                            <div className="flex justify-between text-amber-800 font-semibold"><span>• Imposto / Emissão NF (Pago/Deduc):</span><span>{formatBRL(calc.impostoNf)}</span></div>
                                            <div className="flex justify-between text-slate-600"><span>• Cota Lucro Líquido Alexandre:</span><span>{formatBRL(calc.cotaAlexandre)}</span></div>
                                            <div className="pt-1.5 border-t border-slate-300 flex justify-between font-bold text-slate-900">
                                                <span>TOTAL DEDUÇÕES/RETENÇÃO:</span>
                                                <span>{formatBRL(aporteManos + gastosManos + calc.comissaoVendedor + calc.impostoNf + calc.cotaAlexandre)}</span>
                                            </div>
                                        </div>

                                        {/* Composição do que a outra loja (V3) tem direito a receber */}
                                        <div className="p-3 bg-white rounded-lg border border-slate-300 space-y-1">
                                            <div className="text-[10px] font-bold text-emerald-800 uppercase">Direitos da V3 Automóveis (Ivo):</div>
                                            <div className="flex justify-between text-slate-600"><span>• Devolução do Aporte na Compra:</span><span>{formatBRL(aporteV3)}</span></div>
                                            <div className="flex justify-between text-slate-600"><span>• Reembolso Gastos Extras Pagos:</span><span>{formatBRL(gastosV3)}</span></div>
                                            <div className="flex justify-between text-slate-600"><span>• Cota Lucro Líquido Ivo (50%):</span><span>{formatBRL(calc.cotaIvo)}</span></div>
                                            <div className="pt-1.5 border-t border-slate-300 flex justify-between font-bold text-slate-900">
                                                <span>TOTAL REPASSE PARA V3:</span>
                                                <span>{formatBRL(repasseParaV3)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Banner de Repasse Final Destaque */}
                                    <div className="p-3.5 bg-emerald-50 rounded-xl border-2 border-emerald-500 flex flex-col md:flex-row justify-between items-center gap-2">
                                        <div className="text-slate-900 text-xs font-bold flex items-center gap-2">
                                            <ArrowRightLeft className="w-5 h-5 text-emerald-700 shrink-0" />
                                            <span>RESULTADO DO REPASSE DE CAIXA DESTA NEGOCIAÇÃO:</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs uppercase font-extrabold text-emerald-800 block">
                                                {isManosRecebeu
                                                    ? `MANOS VEÍCULOS DEVE PAGAR PARA V3 AUTOMÓVEIS:`
                                                    : `V3 AUTOMÓVEIS DEVE PAGAR PARA MANOS VEÍCULOS:`}
                                            </span>
                                            <span className="text-lg font-black font-mono text-emerald-700">
                                                {isManosRecebeu ? formatBRL(repasseParaV3) : formatBRL(repasseParaManos)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 8. Aprovações e Assinaturas Físicas */}
                        <div className="pt-4 border-t-2 border-slate-300 space-y-6 print-no-break">
                            <div className="flex justify-between items-center text-xs text-slate-600">
                                <div>
                                    <strong>Registro de Visto CRM:</strong>
                                </div>
                                <div className="flex gap-4">
                                    <span>Alexandre (Manos): <strong>{dataHora(aprovadoAlexandre)}</strong></span>
                                    <span>Ivo (V3 Automóveis): <strong>{dataHora(aprovadoIvo)}</strong></span>
                                </div>
                            </div>

                            {/* Linhas de Assinatura */}
                            <div className="pt-6 grid grid-cols-2 gap-12 text-center text-xs text-slate-800">
                                <div className="space-y-1">
                                    <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
                                    <div className="font-bold">Alexandre Gorges</div>
                                    <div className="text-[10px] text-slate-500">Manos Veículos</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
                                    <div className="font-bold">Ivo</div>
                                    <div className="text-[10px] text-slate-500">V3 Automóveis</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalJSX, document.body);
}
