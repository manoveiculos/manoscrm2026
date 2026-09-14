'use client';

import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, Sparkles, ArrowRightLeft, FileText } from 'lucide-react';
import { ParsedContratoResult } from '@/lib/services/societarioPdfParser';

interface ModuloIngestaoPdfProps {
    onParsed: (data: ParsedContratoResult) => void;
}

const brl = (v?: number) => (v === undefined ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBr = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '-');

function Info({ label, valor, mono }: { label: string; valor?: string | number; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
            <span className={`block text-xs text-white truncate ${mono ? 'font-mono' : ''}`}>{valor ?? '-'}</span>
        </div>
    );
}

export function ModuloIngestaoPdf({ onParsed }: ModuloIngestaoPdfProps) {
    const [carregando, setCarregando] = useState(false);
    const [resultado, setResultado] = useState<ParsedContratoResult | null>(null);
    const [nomeArquivo, setNomeArquivo] = useState('');
    const [textoExtraido, setTextoExtraido] = useState('');
    const [verTexto, setVerTexto] = useState(false);
    const [textoManual, setTextoManual] = useState('');
    const [modoTexto, setModoTexto] = useState(false);
    const [arrastando, setArrastando] = useState(false);
    const [erro, setErro] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const enviar = async (init: RequestInit, nome: string) => {
        setCarregando(true);
        setErro('');
        setResultado(null);
        setTextoExtraido('');
        setVerTexto(false);
        setNomeArquivo(nome);
        try {
            const res = await fetch('/api/societario/parse-pdf', { method: 'POST', ...init });
            const json = await res.json();
            if (!json.success) {
                throw new Error(json.error || 'Erro ao extrair dados do contrato.');
            }

            setResultado(json.data);
            setTextoExtraido(json.textoExtraido || '');
            onParsed(json.data);
        } catch (err: any) {
            setErro(err.message);
        } finally {
            setCarregando(false);
        }
    };

    const processarArquivo = (file?: File | null) => {
        if (!file || carregando) return;
        const formData = new FormData();
        formData.append('file', file);
        enviar({ body: formData }, file.name);
    };

    const processarTexto = () =>
        enviar(
            { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: textoManual }) },
            'Texto colado'
        );

    const leituraCompleta = !!resultado && resultado.tipo !== 'desconhecido' && !!(resultado.placa || resultado.chassi) && resultado.valorTotal !== undefined;
    const rotuloCliente = resultado?.tipo === 'venda' ? 'Comprador' : 'Fornecedor';

    return (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-sm mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">Ingestão & Extração Inteligente de Contratos</h3>
                        <p className="text-xs text-slate-400">Suba um contrato por vez: identifica compra ou venda e preenche o formulário</p>
                    </div>
                </div>

                <button
                    onClick={() => setModoTexto(!modoTexto)}
                    className="text-xs font-semibold text-purple-400 hover:text-purple-300 underline"
                >
                    {modoTexto ? 'Usar Upload de PDF' : 'Colar Texto do Contrato'}
                </button>
            </div>

            {erro && (
                <div className="p-3 mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {erro}
                </div>
            )}

            {!modoTexto ? (
                /* Zona de Drag & Drop */
                <label
                    onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                    onDragLeave={() => setArrastando(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setArrastando(false);
                        processarArquivo(e.dataTransfer.files?.[0]);
                    }}
                    className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all group ${
                        arrastando ? 'border-purple-500 bg-purple-500/5' : 'border-slate-800 hover:border-purple-500/50 bg-slate-950/60'
                    }`}
                >
                    <UploadCloud className={`w-8 h-8 mb-2 transition-colors ${carregando ? 'text-purple-400 animate-pulse' : 'text-slate-500 group-hover:text-purple-400'}`} />
                    <span className="text-xs font-semibold text-slate-300 group-hover:text-white text-center">
                        {carregando ? `Lendo ${nomeArquivo}...` : 'Clique ou arraste o PDF do Contrato de Compra ou Venda'}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 text-center">Placa, chassi, renavam, ano, KM, cor, valores, cliente, vendedor, pagamentos e troca</span>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".pdf,.txt"
                        onChange={(e) => {
                            processarArquivo(e.target.files?.[0]);
                            // permite subir o mesmo arquivo de novo
                            if (inputRef.current) inputRef.current.value = '';
                        }}
                        disabled={carregando}
                        className="hidden"
                    />
                </label>
            ) : (
                /* Entrada Manual de Texto */
                <div className="space-y-3">
                    <textarea
                        rows={4}
                        placeholder="Cole aqui o conteúdo textual do contrato de compra ou venda..."
                        value={textoManual}
                        onChange={(e) => setTextoManual(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <button
                        onClick={processarTexto}
                        disabled={carregando || !textoManual.trim()}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition-all disabled:opacity-50"
                    >
                        {carregando ? 'Extraindo...' : 'Analisar Texto do Contrato'}
                    </button>
                </div>
            )}

            {/* Resultado do Parser */}
            {resultado && (
                <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {leituraCompleta ? (
                            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" /> Contrato lido: {nomeArquivo}
                            </span>
                        ) : (
                            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4" /> Leitura incompleta — confira no formulário
                            </span>
                        )}
                        <span
                            className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                                resultado.tipo === 'venda'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : resultado.tipo === 'compra'
                                        ? 'bg-blue-500/15 text-blue-300'
                                        : 'bg-amber-500/15 text-amber-300'
                            }`}
                        >
                            {resultado.tipo === 'desconhecido' ? 'Tipo não identificado' : `Contrato de ${resultado.tipo}`}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Info label="Placa" valor={resultado.placa} mono />
                        <Info label="Veículo" valor={resultado.marcaModelo} />
                        <Info label="Ano" valor={resultado.anoFabricacao ? `${resultado.anoFabricacao}/${resultado.anoModelo ?? ''}` : undefined} />
                        <Info label="Valor negociado" valor={brl(resultado.valorTotal)} mono />
                        <Info label="Chassi" valor={resultado.chassi} mono />
                        <Info label="Renavam" valor={resultado.renavam} mono />
                        <Info label="KM / Cor" valor={[resultado.km?.toLocaleString('pt-BR'), resultado.cor].filter(Boolean).join(' · ') || undefined} />
                        <Info label="Data" valor={dataBr(resultado.dataContrato)} />
                        <Info label={rotuloCliente} valor={resultado.nomeParteInversa} />
                        <Info label="CPF/CNPJ" valor={resultado.cpfCnpjParteInversa} mono />
                        <Info label="Vendedor da loja" valor={resultado.vendedorCaptador} />
                        <Info label="Pagamento" valor={resultado.formaLiquidacao} />
                    </div>

                    {resultado.temTroca && resultado.troca && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                <ArrowRightLeft className="w-3.5 h-3.5" /> Troca: {resultado.troca.descricao || 'veículo usado'} — {brl(resultado.troca.valorNegociado)}
                            </span>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Info label="Placa" valor={resultado.troca.placa} mono />
                                <Info label="Chassi" valor={resultado.troca.chassi} mono />
                                <Info label="Ano" valor={resultado.troca.anoFabricacao ? `${resultado.troca.anoFabricacao}/${resultado.troca.anoModelo ?? ''}` : undefined} />
                                <Info label="KM / Cor" valor={[resultado.troca.km?.toLocaleString('pt-BR'), resultado.troca.cor].filter(Boolean).join(' · ') || undefined} />
                            </div>
                            {resultado.valorEntradaMoeda !== undefined && (
                                <p className="text-[11px] text-amber-200/80">
                                    Venda {brl(resultado.valorTotal)} = troca {brl(resultado.troca.valorNegociado)} + dinheiro {brl(resultado.valorEntradaMoeda)}
                                    {resultado.saldo ? ` + saldo ${brl(resultado.saldo)}` : ''}
                                </p>
                            )}
                        </div>
                    )}

                    {resultado.alertas.length > 0 && (
                        <div className="space-y-1">
                            {resultado.alertas.map((a, idx) => (
                                <p key={idx} className="text-[11px] text-amber-400 flex items-start gap-1">
                                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {a}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                            onClick={() => onParsed(resultado)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition-all"
                        >
                            Abrir formulário preenchido
                        </button>
                        {textoExtraido && (
                            <button
                                onClick={() => setVerTexto(!verTexto)}
                                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                            >
                                <FileText className="w-3 h-3" /> {verTexto ? 'Esconder' : 'Ver'} texto extraído
                            </button>
                        )}
                    </div>

                    {verTexto && (
                        <pre className="max-h-64 overflow-auto p-3 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400 whitespace-pre-wrap">
                            {textoExtraido}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
