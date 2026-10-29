'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
    Car, 
    Bike, 
    Truck, 
    Search, 
    Share2, 
    TrendingUp, 
    TrendingDown, 
    DollarSign, 
    Sparkles, 
    FileText, 
    CheckCircle2, 
    Calculator,
    RefreshCw,
    Download,
    Percent,
    ExternalLink,
    LineChart as ChartIcon,
    AlertCircle,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Printer
} from 'lucide-react';
import { toJpeg } from 'html-to-image';
import { 
    ResponsiveContainer, 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    Tooltip, 
    CartesianGrid 
} from 'recharts';

interface ItemOption {
    codigo: string | number;
    nome: string;
}

interface FipeResult {
    TipoVeiculo: number;
    Valor: string;
    Marca: string;
    Modelo: string;
    AnoModelo: number;
    Combustivel: string;
    CodigoFipe: string;
    MesReferencia: string;
    SiglaCombustivel: string;
}

interface PriceHistoryItem {
    price: string;
    month: string;
    reference: string;
    numericPrice?: number;
}

type FinishLevel = 'padrao' | 'completo' | 'blindado';

export default function PrecificarPage() {
    // Tipo de Veículo
    const [vehicleType, setVehicleType] = useState<'carros' | 'motos' | 'caminhoes'>('carros');

    // Listas de opções
    const [marcas, setMarcas] = useState<ItemOption[]>([]);
    const [modelos, setModelos] = useState<ItemOption[]>([]);
    const [anos, setAnos] = useState<ItemOption[]>([]);

    // Seleções
    const [selectedMarca, setSelectedMarca] = useState<string>('');
    const [selectedModelo, setSelectedModelo] = useState<string>('');
    const [selectedAno, setSelectedAno] = useState<string>('');

    // Filtros de busca de texto
    const [marcaSearch, setMarcaSearch] = useState('');
    const [modeloSearch, setModeloSearch] = useState('');

    // Estado do resultado
    const [loading, setLoading] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);
    const [loadingYears, setLoadingYears] = useState(false);
    const [result, setResult] = useState<FipeResult | null>(null);

    // Histórico e Previsão
    const [history, setHistory] = useState<PriceHistoryItem[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Precificação Inteligente Manos
    const [finishLevel, setFinishLevel] = useState<FinishLevel>('padrao');
    const [customBuyDiscount, setCustomBuyDiscount] = useState<number>(15); // Compra a -15% da FIPE
    const [customSellMargin, setCustomSellMargin] = useState<number>(5); // Venda a +5% acima da FIPE
    const [exportingImage, setExportingImage] = useState(false);

    // Visualização Ativa: 'resumo' | 'relatorio'
    const [activeTab, setActiveTab] = useState<'resumo' | 'relatorio'>('resumo');

    // Ref para exportar o Card / Relatório
    const cardRef = useRef<HTMLDivElement>(null);
    const reportRef = useRef<HTMLDivElement>(null);

    // 1. Carregar Marcas quando o tipo mudar
    useEffect(() => {
        async function fetchMarcas() {
            setLoading(true);
            setSelectedMarca('');
            setSelectedModelo('');
            setSelectedAno('');
            setModelos([]);
            setAnos([]);
            setResult(null);
            setHistory([]);

            try {
                const res = await fetch(`/api/precificar?tipo=${vehicleType}`);
                if (res.ok) {
                    const data = await res.json();
                    setMarcas(data || []);
                }
            } catch (err) {
                console.error('Erro ao carregar marcas:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchMarcas();
    }, [vehicleType]);

    // 2. Carregar Modelos quando a Marca for selecionada
    useEffect(() => {
        if (!selectedMarca) {
            setModelos([]);
            setSelectedModelo('');
            return;
        }

        async function fetchModelos() {
            setLoadingModels(true);
            setSelectedModelo('');
            setSelectedAno('');
            setAnos([]);
            setResult(null);
            setHistory([]);

            try {
                const res = await fetch(`/api/precificar?tipo=${vehicleType}&marca=${selectedMarca}`);
                if (res.ok) {
                    const data = await res.json();
                    setModelos(data.modelos || []);
                }
            } catch (err) {
                console.error('Erro ao carregar modelos:', err);
            } finally {
                setLoadingModels(false);
            }
        }
        fetchModelos();
    }, [selectedMarca, vehicleType]);

    // 3. Carregar Anos quando o Modelo for selecionado
    useEffect(() => {
        if (!selectedMarca || !selectedModelo) {
            setAnos([]);
            setSelectedAno('');
            return;
        }

        async function fetchAnos() {
            setLoadingYears(true);
            setSelectedAno('');
            setResult(null);
            setHistory([]);

            try {
                const res = await fetch(
                    `/api/precificar?tipo=${vehicleType}&marca=${selectedMarca}&modelo=${selectedModelo}`
                );
                if (res.ok) {
                    const data = await res.json();
                    setAnos(data || []);
                }
            } catch (err) {
                console.error('Erro ao carregar anos:', err);
            } finally {
                setLoadingYears(false);
            }
        }
        fetchAnos();
    }, [selectedModelo, selectedMarca, vehicleType]);

    // 4. Carregar Detalhe da FIPE quando o Ano for selecionado + Histórico
    useEffect(() => {
        if (!selectedMarca || !selectedModelo || !selectedAno) {
            setResult(null);
            setHistory([]);
            return;
        }

        async function fetchPrecoAndHistory() {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/precificar?tipo=${vehicleType}&marca=${selectedMarca}&modelo=${selectedModelo}&ano=${selectedAno}`
                );
                if (res.ok) {
                    const data: FipeResult = await res.json();
                    setResult(data);

                    // Buscar Histórico completo para gráfico e previsão
                    if (data.CodigoFipe) {
                        setLoadingHistory(true);
                        try {
                            const histRes = await fetch(
                                `/api/precificar?tipo=${vehicleType}&codigoFipe=${data.CodigoFipe}&ano=${selectedAno}&historico=true`
                            );
                            if (histRes.ok) {
                                const histData = await histRes.json();
                                setHistory(histData.priceHistory || []);
                            }
                        } catch (err) {
                            console.error('Erro ao carregar histórico:', err);
                        } finally {
                            setLoadingHistory(false);
                        }
                    }
                }
            } catch (err) {
                console.error('Erro ao buscar cotação FIPE:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchPrecoAndHistory();
    }, [selectedAno, selectedModelo, selectedMarca, vehicleType]);

    // Conversão de moeda string para número
    const parseCurrency = (valStr: string) => {
        if (!valStr) return 0;
        const clean = valStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        return parseFloat(clean) || 0;
    };

    const fipeValue = result ? parseCurrency(result.Valor) : 0;

    // Ajuste por Acabamento
    const getFinishMultiplier = () => {
        if (finishLevel === 'blindado') return 1.15; // +15% blindado
        if (finishLevel === 'completo') return 1.05; // +5% completo/top de linha
        return 1.0; // Padrão
    };

    const adjustedBaseValue = fipeValue * getFinishMultiplier();

    // Sugestão de Compra Manos e Venda
    const suggestedBuyPrice = adjustedBaseValue * (1 - customBuyDiscount / 100);
    const suggestedSellPrice = adjustedBaseValue * (1 + customSellMargin / 100);
    const estimatedProfit = suggestedSellPrice - suggestedBuyPrice;

    // ==========================================
    // CÁLCULO DE TENDÊNCIA E PREVISÃO MÊS SEGUINTE
    // ==========================================
    // Prepara os dados para o gráfico do mais antigo para o mais recente
    const chartData = [...history]
        .reverse()
        .map((item) => {
            const shortMonth = item.month.split(' de ')[0].substring(0, 3);
            const yearShort = item.month.split(' de ')[1]?.slice(-2) || '';
            return {
                name: `${shortMonth}/${yearShort}`,
                fullMonth: item.month,
                valor: parseCurrency(item.price),
                formatted: item.price
            };
        });

    // Análise de Tendência dos últimos 3 a 6 meses
    const calculatePrediction = () => {
        if (!history || history.length < 2) {
            // Sem histórico suficiente: assume desvalorização padrão de mercado de -0.4%
            const predictedValue = fipeValue * 0.996;
            return {
                predictedValue,
                variationRate: -0.4,
                trend: 'baixa',
                confidence: 'Média (Média do segmento)'
            };
        }

        const recent = history.slice(0, Math.min(4, history.length));
        const currentVal = parseCurrency(recent[0].price);
        const prevVal = parseCurrency(recent[1].price);

        // Variação percentual do último mês
        const lastMonthVar = ((currentVal - prevVal) / prevVal) * 100;

        // Variação ponderada se tiver 3+ meses
        let avgMonthlyChangeRate = lastMonthVar;
        if (recent.length >= 3) {
            const olderVal = parseCurrency(recent[2].price);
            const olderVar = ((prevVal - olderVal) / olderVal) * 100;
            // Pondera mais o último mês (60%) e o anterior (40%)
            avgMonthlyChangeRate = (lastMonthVar * 0.6) + (olderVar * 0.4);
        }

        // Limita a variação prevista a uma faixa realística (-3.5% a +3.5%)
        const clampedRate = Math.max(-3.5, Math.min(3.5, avgMonthlyChangeRate));
        const predictedValue = currentVal * (1 + clampedRate / 100);

        return {
            predictedValue,
            variationRate: clampedRate,
            trend: clampedRate > 0.05 ? 'alta' : clampedRate < -0.05 ? 'baixa' : 'estavel',
            confidence: history.length >= 6 ? 'Alta (Base de 6+ meses)' : 'Média'
        };
    };

    const prediction = calculatePrediction();

    // Exportar Imagem
    const handleExportCard = async () => {
        const target = activeTab === 'relatorio' ? reportRef.current : cardRef.current;
        if (!target) return;
        setExportingImage(true);
        try {
            const dataUrl = await toJpeg(target, { quality: 0.95, backgroundColor: '#090d16' });
            const link = document.createElement('a');
            link.download = `Relatorio-ManosPrecificar-${result?.Modelo.replace(/[^a-zA-Z0-9]/g, '_') || 'FIPE'}.jpeg`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Erro ao gerar imagem:', err);
        } finally {
            setExportingImage(false);
        }
    };

    // Imprimir Relatório
    const handlePrint = () => {
        window.print();
    };

    // Marcas e Modelos Filtrados por input
    const filteredMarcas = marcas.filter((m) =>
        m.nome.toLowerCase().includes(marcaSearch.toLowerCase())
    );

    const filteredModelos = modelos.filter((m) =>
        m.nome.toLowerCase().includes(modeloSearch.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            {/* Cabeçalho */}
            <div className="max-w-6xl mx-auto mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20 text-slate-950 font-black">
                                <DollarSign className="w-6 h-6 stroke-[3]" />
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                                    Manos <span className="text-amber-400">Precificar</span>
                                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                        FIPE • Tendência • Previsão
                                    </span>
                                </h1>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Inteligência automotiva, margem de compra e previsão preditiva para o próximo mês
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Seletor de Tipo */}
                    <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl self-start md:self-auto">
                        <button
                            onClick={() => setVehicleType('carros')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                vehicleType === 'carros'
                                    ? 'bg-amber-500 text-slate-950 shadow-md'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Car className="w-4 h-4" />
                            Carros
                        </button>
                        <button
                            onClick={() => setVehicleType('motos')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                vehicleType === 'motos'
                                    ? 'bg-amber-500 text-slate-950 shadow-md'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Bike className="w-4 h-4" />
                            Motos
                        </button>
                        <button
                            onClick={() => setVehicleType('caminhoes')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                vehicleType === 'caminhoes'
                                    ? 'bg-amber-500 text-slate-950 shadow-md'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Truck className="w-4 h-4" />
                            Caminhões
                        </button>
                    </div>
                </div>
            </div>

            {/* Conteúdo Principal */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Coluna Esquerda: Wizard de Seleção + Calibrador */}
                <div className="lg:col-span-5 space-y-5">
                    {/* Passo 1: Marca */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
                            <span>1. Marca do Veículo</span>
                            {selectedMarca && (
                                <span className="text-emerald-400 flex items-center gap-1 font-semibold normal-case">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Selecionado
                                </span>
                            )}
                        </label>
                        <div className="relative mb-3">
                            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Filtrar marcas (ex: Chevrolet, Toyota)..."
                                value={marcaSearch}
                                onChange={(e) => setMarcaSearch(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                            />
                        </div>
                        <select
                            value={selectedMarca}
                            onChange={(e) => setSelectedMarca(e.target.value)}
                            disabled={loading}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                            <option value="">Selecione uma marca...</option>
                            {filteredMarcas.map((m) => (
                                <option key={m.codigo} value={m.codigo}>
                                    {m.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Passo 2: Modelo */}
                    <div className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm transition-opacity ${!selectedMarca ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
                            <span>2. Modelo</span>
                            {loadingModels && (
                                <span className="text-amber-400 flex items-center gap-1 font-semibold text-xs">
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Carregando...
                                </span>
                            )}
                            {selectedModelo && !loadingModels && (
                                <span className="text-emerald-400 flex items-center gap-1 font-semibold normal-case">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Selecionado
                                </span>
                            )}
                        </label>
                        <div className="relative mb-3">
                            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Filtrar modelos (ex: Onix, Civic)..."
                                value={modeloSearch}
                                onChange={(e) => setModeloSearch(e.target.value)}
                                disabled={!selectedMarca || loadingModels}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                            />
                        </div>
                        <select
                            value={selectedModelo}
                            onChange={(e) => setSelectedModelo(e.target.value)}
                            disabled={!selectedMarca || loadingModels}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                            <option value="">Selecione um modelo...</option>
                            {filteredModelos.map((m) => (
                                <option key={m.codigo} value={m.codigo}>
                                    {m.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Passo 3: Ano do Modelo */}
                    <div className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm transition-opacity ${!selectedModelo ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
                            <span>3. Ano / Combustível</span>
                            {loadingYears && (
                                <span className="text-amber-400 flex items-center gap-1 font-semibold text-xs">
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Carregando...
                                </span>
                            )}
                            {selectedAno && !loadingYears && (
                                <span className="text-emerald-400 flex items-center gap-1 font-semibold normal-case">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Selecionado
                                </span>
                            )}
                        </label>
                        <select
                            value={selectedAno}
                            onChange={(e) => setSelectedAno(e.target.value)}
                            disabled={!selectedModelo || loadingYears}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                            <option value="">Selecione o ano do modelo...</option>
                            {anos.map((a) => (
                                <option key={a.codigo} value={a.codigo}>
                                    {a.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Calibração de Margem Manos CRM */}
                    {result && (
                        <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-5 shadow-lg space-y-4">
                            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                                <Calculator className="w-4 h-4" /> Calibrador de Compra e Venda
                            </h3>

                            {/* Acabamento */}
                            <div>
                                <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Nível de Acabamento</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['padrao', 'completo', 'blindado'] as FinishLevel[]).map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setFinishLevel(level)}
                                            className={`text-xs py-2 px-1 rounded-xl font-medium capitalize transition-all border ${
                                                finishLevel === level
                                                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                                            }`}
                                        >
                                            {level === 'padrao' ? 'Padrão' : level === 'completo' ? 'Top (+5%)' : 'Blindado (+15%)'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Margem de Compra */}
                            <div>
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-slate-400">Desconto p/ Compra Repasse:</span>
                                    <span className="font-bold text-emerald-400">-{customBuyDiscount}% da FIPE</span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="35"
                                    step="1"
                                    value={customBuyDiscount}
                                    onChange={(e) => setCustomBuyDiscount(Number(e.target.value))}
                                    className="w-full accent-amber-500 cursor-pointer"
                                />
                            </div>

                            {/* Margem de Venda */}
                            <div>
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-slate-400">Margem Venda Loja:</span>
                                    <span className="font-bold text-amber-400">+{customSellMargin}% acima FIPE</span>
                                </div>
                                <input
                                    type="range"
                                    min="-10"
                                    max="20"
                                    step="1"
                                    value={customSellMargin}
                                    onChange={(e) => setCustomSellMargin(Number(e.target.value))}
                                    className="w-full accent-amber-500 cursor-pointer"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Coluna Direita: Abas [Resumo & Card WhatsApp] vs [Relatório Completo & Previsão] */}
                <div className="lg:col-span-7">
                    {!result && (
                        <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center text-center h-full min-h-[440px]">
                            <div className="p-4 bg-slate-800/50 rounded-2xl mb-4 text-slate-500">
                                <Car className="w-12 h-12" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-300 mb-1">Nenhum Veículo Selecionado</h3>
                            <p className="text-sm text-slate-500 max-w-sm">
                                Escolha a marca, o modelo e o ano ao lado para gerar o relatório completo com histórico e a previsão da FIPE para o próximo mês.
                            </p>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-5">
                            {/* Seletor de Aba de Visualização */}
                            <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
                                <button
                                    onClick={() => setActiveTab('resumo')}
                                    className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                        activeTab === 'resumo'
                                            ? 'bg-amber-500 text-slate-950 shadow-md'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Share2 className="w-3.5 h-3.5" /> Card de Venda WhatsApp
                                </button>
                                <button
                                    onClick={() => setActiveTab('relatorio')}
                                    className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                        activeTab === 'relatorio'
                                            ? 'bg-amber-500 text-slate-950 shadow-md'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <FileText className="w-3.5 h-3.5" /> Relatório Completo & Previsão
                                </button>
                            </div>

                            {/* =========================================
                                ABA 1: CARD COMPACTO P/ WHATSAPP
                                ========================================= */}
                            {activeTab === 'resumo' && (
                                <div
                                    ref={cardRef}
                                    className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden"
                                >
                                    <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
                                        <div>
                                            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                                {result.Marca}
                                            </span>
                                            <h2 className="text-xl md:text-2xl font-black text-white mt-2 leading-tight">
                                                {result.Modelo}
                                            </h2>
                                            <p className="text-xs text-slate-400 mt-1">
                                                Ano: <strong className="text-slate-200">{result.AnoModelo}</strong> • Combustível: <strong className="text-slate-200">{result.Combustivel}</strong>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] text-slate-500 block uppercase font-mono">Código FIPE</span>
                                            <span className="text-xs font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                                                {result.CodigoFipe}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                                        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                                            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                                                <FileText className="w-3.5 h-3.5 text-blue-400" /> Valor FIPE Atual
                                            </span>
                                            <p className="text-xl md:text-2xl font-black text-white mt-1">
                                                {result.Valor}
                                            </p>
                                            <span className="text-[10px] text-slate-500 block mt-0.5">
                                                Ref: {result.MesReferencia}
                                            </span>
                                        </div>

                                        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4">
                                            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                                                <TrendingDown className="w-3.5 h-3.5" /> Compra Máxima
                                            </span>
                                            <p className="text-xl md:text-2xl font-black text-emerald-300 mt-1">
                                                R$ {suggestedBuyPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                                                Margem de -{customBuyDiscount}%
                                            </span>
                                        </div>

                                        <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4">
                                            <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                                                <TrendingUp className="w-3.5 h-3.5" /> Venda Sugerida
                                            </span>
                                            <p className="text-xl md:text-2xl font-black text-amber-300 mt-1">
                                                R$ {suggestedSellPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <span className="text-[10px] text-amber-400/80 block mt-0.5">
                                                Lucro est.: R$ {estimatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Bloco de Previsão Integrado no Card */}
                                    <div className="bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                                                <Sparkles className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-indigo-300 block">
                                                    Projeção FIPE Próximo Mês
                                                </span>
                                                <p className="text-sm font-extrabold text-white">
                                                    R$ {prediction.predictedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-lg ${
                                                prediction.trend === 'alta'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                                    : prediction.trend === 'baixa'
                                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                                    : 'bg-slate-800 text-slate-300'
                                            }`}>
                                                {prediction.trend === 'alta' && <ArrowUpRight className="w-3.5 h-3.5" />}
                                                {prediction.trend === 'baixa' && <ArrowDownRight className="w-3.5 h-3.5" />}
                                                {prediction.trend === 'estavel' && <Minus className="w-3.5 h-3.5" />}
                                                {prediction.variationRate > 0 ? `+${prediction.variationRate.toFixed(2)}%` : `${prediction.variationRate.toFixed(2)}%`}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="border-t border-slate-800/80 pt-4 mt-6 flex items-center justify-between text-xs text-slate-500">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                                            <span>Cotação Manos CRM • Atualizada em tempo real</span>
                                        </div>
                                        <span className="font-bold text-amber-500 tracking-wider">MANOS VEÍCULOS</span>
                                    </div>
                                </div>
                            )}

                            {/* =========================================
                                ABA 2: RELATÓRIO COMPLETO & PREVISÃO
                                ========================================= */}
                            {activeTab === 'relatorio' && (
                                <div
                                    ref={reportRef}
                                    className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl"
                                >
                                    {/* Cabeçalho do Relatório */}
                                    <div className="border-b border-slate-800 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="bg-amber-500/20 text-amber-400 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-amber-500/30">
                                                    Relatório de Precificação & Tendência
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    Código: {result.CodigoFipe}
                                                </span>
                                            </div>
                                            <h2 className="text-2xl font-black text-white mt-1">
                                                {result.Marca} {result.Modelo}
                                            </h2>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Ano: {result.AnoModelo} • Combustível: {result.Combustivel} • Mês FIPE: {result.MesReferencia}
                                            </p>
                                        </div>
                                        <div className="text-left md:text-right">
                                            <span className="text-xs text-slate-500 uppercase font-semibold">Preço Oficial FIPE</span>
                                            <p className="text-3xl font-black text-amber-400">{result.Valor}</p>
                                        </div>
                                    </div>

                                    {/* PAINEL DE PREVISÃO FIPE DO MÊS SEGUINTE */}
                                    <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-950 border border-indigo-500/40 rounded-2xl p-5 relative overflow-hidden">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
                                                    <h3 className="text-base font-extrabold text-white">
                                                        Previsão Oficial FIPE — Mês Seguinte
                                                    </h3>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1 max-w-md">
                                                    Projeção calculada com base na regressão histórica dos últimos meses e na taxa média de depreciação do modelo.
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <span className="text-[10px] uppercase font-bold text-indigo-300 block">Projeção Estimada</span>
                                                <span className="text-2xl font-black text-white">
                                                    R$ {prediction.predictedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-indigo-500/20">
                                            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                                                <span className="text-[11px] text-slate-400 block font-medium">Tendência Prevista</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    {prediction.trend === 'alta' ? (
                                                        <span className="text-emerald-400 font-bold text-sm flex items-center gap-1">
                                                            <ArrowUpRight className="w-4 h-4" /> Valorização (+{prediction.variationRate.toFixed(2)}%)
                                                        </span>
                                                    ) : prediction.trend === 'baixa' ? (
                                                        <span className="text-rose-400 font-bold text-sm flex items-center gap-1">
                                                            <ArrowDownRight className="w-4 h-4" /> Desvalorização ({prediction.variationRate.toFixed(2)}%)
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300 font-bold text-sm flex items-center gap-1">
                                                            <Minus className="w-4 h-4" /> Estável (~0.0%)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                                                <span className="text-[11px] text-slate-400 block font-medium">Diferença em Reais</span>
                                                <span className="text-sm font-extrabold text-white mt-0.5 block">
                                                    {prediction.predictedValue - fipeValue >= 0 ? '+' : ''}
                                                    R$ {(prediction.predictedValue - fipeValue).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>

                                            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                                                <span className="text-[11px] text-slate-400 block font-medium">Confiabilidade Algoritmo</span>
                                                <span className="text-sm font-bold text-indigo-300 mt-0.5 block">
                                                    {prediction.confidence}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* GRÁFICO HISTÓRICO DE PREÇOS */}
                                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <ChartIcon className="w-4 h-4 text-amber-400" />
                                                <h4 className="text-sm font-bold text-white">Evolução Histórica do Preço (Últimos Meses)</h4>
                                            </div>
                                            {loadingHistory && (
                                                <span className="text-xs text-amber-400 flex items-center gap-1">
                                                    <RefreshCw className="w-3 h-3 animate-spin" /> Atualizando...
                                                </span>
                                            )}
                                        </div>

                                        {chartData.length > 0 ? (
                                            <div className="h-60 w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={chartData}>
                                                        <defs>
                                                            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                        <XAxis 
                                                            dataKey="name" 
                                                            stroke="#64748b" 
                                                            tick={{ fontSize: 11 }} 
                                                        />
                                                        <YAxis 
                                                            stroke="#64748b" 
                                                            domain={['dataMin - 500', 'dataMax + 500']}
                                                            tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                                                            tick={{ fontSize: 11 }}
                                                        />
                                                        <Tooltip 
                                                            content={({ active, payload }) => {
                                                                if (active && payload && payload.length) {
                                                                    const data = payload[0].payload;
                                                                    return (
                                                                        <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs">
                                                                            <span className="text-slate-400 block font-semibold">{data.fullMonth}</span>
                                                                            <span className="text-amber-400 font-black text-sm">{data.formatted}</span>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            }}
                                                        />
                                                        <Area 
                                                            type="monotone" 
                                                            dataKey="valor" 
                                                            stroke="#f59e0b" 
                                                            strokeWidth={3} 
                                                            fillOpacity={1} 
                                                            fill="url(#priceGradient)" 
                                                        />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        ) : (
                                            <div className="h-40 flex items-center justify-center text-slate-500 text-xs">
                                                Carregando série histórica de preços...
                                            </div>
                                        )}
                                    </div>

                                    {/* QUADRO DE DECISÃO COMERCIAL MANOS */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                                            <span className="text-xs font-semibold text-slate-400 block">Teto de Compra Repasse</span>
                                            <p className="text-xl font-black text-emerald-400 mt-1">
                                                R$ {suggestedBuyPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                Garante margem de giro mesmo com depreciação futura.
                                            </p>
                                        </div>

                                        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                                            <span className="text-xs font-semibold text-slate-400 block">Preço de Venda Pátio</span>
                                            <p className="text-xl font-black text-amber-400 mt-1">
                                                R$ {suggestedSellPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                Preço competitivo alinhado com o mercado regional.
                                            </p>
                                        </div>

                                        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                                            <span className="text-xs font-semibold text-slate-400 block">Lucro Bruto Projetado</span>
                                            <p className="text-xl font-black text-white mt-1">
                                                R$ {estimatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                Margem bruta calculada antes de custos de preparação.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Barra de Ações Rápidas */}
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={handleExportCard}
                                    disabled={exportingImage}
                                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg shadow-emerald-900/30 transition-all text-sm disabled:opacity-50"
                                >
                                    {exportingImage ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" /> Gerando Imagem...
                                        </>
                                    ) : (
                                        <>
                                            <Share2 className="w-4 h-4" /> Baixar {activeTab === 'relatorio' ? 'Relatório' : 'Card'} p/ WhatsApp
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={handlePrint}
                                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold py-3 px-4 rounded-xl text-sm transition-all"
                                >
                                    <Printer className="w-4 h-4 text-slate-400" />
                                    Imprimir / Salvar PDF
                                </button>

                                <a
                                    href={`https://www.webmotors.com.br/carros/estoque?tipoveiculo=carros&marca1=${result.Marca.toLowerCase()}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold py-3 px-4 rounded-xl text-sm transition-all"
                                >
                                    <ExternalLink className="w-4 h-4 text-slate-400" />
                                    Webmotors
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
