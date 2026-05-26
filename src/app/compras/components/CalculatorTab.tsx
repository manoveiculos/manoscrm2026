'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  Sparkles, 
  Gauge, 
  AlertTriangle,
  Info,
  TrendingDown,
  Wrench,
  Percent,
  CheckCircle2,
  Calendar,
  Layers,
  ListFilter,
  RefreshCw
} from 'lucide-react';

interface FipeResult {
  fipe_code: string;
  model_official: string;
  fipe_price_official: number;
  confidence: number;
  is_estimated?: boolean;
}

interface SimilarOffer {
  id: string;
  model: string;
  year_model: number;
  ask_price: number;
  net_price: number;
  fipe_price_official: number;
  fipe_price?: number;
  created_at: string;
}

interface CorrectionSuggestion {
  brand: string;
  model: string;
  message: string;
}

interface CalculatorTabProps {
  initialParams?: {
    brand: string;
    model: string;
    year_model: string;
    km: string;
  } | null;
}

export default function CalculatorTab({ initialParams }: CalculatorTabProps) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [yearModel, setYearModel] = useState('2018');
  const [km, setKm] = useState('80000');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);

  const [fipeData, setFipeData] = useState<FipeResult | null>(null);
  const [similarOffers, setSimilarOffers] = useState<SimilarOffer[]>([]);
  const [optionsList, setOptionsList] = useState<FipeResult[] | null>(null);
  const [correctionSuggestion, setCorrectionSuggestion] = useState<CorrectionSuggestion | null>(null);

  const [prepCost, setPrepCost] = useState<number>(2500);
  const [condition, setCondition] = useState<string>('bom');

  const marginPercent = useMemo(() => {
    if (!similarOffers || similarOffers.length === 0) return 15;
    
    const margins = similarOffers.map(offer => {
      const fipe = offer.fipe_price_official || offer.fipe_price || 0;
      const purchase = offer.net_price || offer.ask_price || 0;
      if (fipe > 0 && purchase > 0) {
        return ((fipe - purchase) / fipe) * 100;
      }
      return null;
    }).filter((m): m is number => m !== null && m >= 3 && m <= 30);

    if (margins.length === 0) return 15;
    const sum = margins.reduce((acc, m) => acc + m, 0);
    return Math.round((sum / margins.length) * 10) / 10;
  }, [similarOffers]);

  // Efeito para sincronizar com cliques em outras abas (via state)
  useEffect(() => {
    if (initialParams) {
      if (initialParams.brand) setBrand(initialParams.brand);
      if (initialParams.model) setModel(initialParams.model);
      if (initialParams.year_model) setYearModel(initialParams.year_model);
      if (initialParams.km) setKm(initialParams.km);

      setTimeout(() => {
        handleSearch(undefined, initialParams.brand, initialParams.model);
      }, 150);
    }
  }, [initialParams]);

  // Efeito para carregar parâmetros da URL (caso acesse direto com query string)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlBrand = params.get('brand');
      const urlModel = params.get('model');
      const urlYear = params.get('year_model');
      const urlKm = params.get('km');

      if ((urlBrand || urlModel) && !initialParams) {
        if (urlBrand) setBrand(urlBrand);
        if (urlModel) setModel(urlModel);
        if (urlYear) setYearModel(urlYear);
        if (urlKm) setKm(urlKm);

        setTimeout(() => {
          handleSearch(undefined, urlBrand || undefined, urlModel || undefined);
        }, 150);
      }
    }
  }, []);

  const handleSearch = async (e?: React.FormEvent, overrideBrand?: string, overrideModel?: string) => {
    if (e) e.preventDefault();
    const activeBrand = overrideBrand || brand;
    const activeModel = overrideModel || model;

    if (!activeBrand || !activeModel || !yearModel || !km) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchDone(false);
    setFipeData(null);
    setOptionsList(null);
    setCorrectionSuggestion(null);

    try {
      const res = await fetch(
        `/api/compras/avaliacao?brand=${encodeURIComponent(activeBrand)}&model=${encodeURIComponent(
          activeModel
        )}&year_model=${yearModel}&km=${km}`
      );
      
      const data = await res.json();
      if (!res.ok || (data.success === false && !data.isCorrectionSuggested)) {
        throw new Error(data.error || 'Erro ao consultar a FIPE oficial.');
      }

      if (data.isCorrectionSuggested) {
        setCorrectionSuggestion({
          brand: data.suggestion.brand,
          model: data.suggestion.model,
          message: data.message
        });
        setSearchDone(true);
      } else if (data.hasMultipleMatches) {
        setOptionsList(data.options || []);
        setSearchDone(true);
      } else {
        setFipeData(data.fipe);
        setSimilarOffers(data.similarOffers || []);
        setSearchDone(true);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar dados de avaliação.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCorrection = async (suggestedBrand: string, suggestedModel: string) => {
    const formattedBrand = suggestedBrand.charAt(0) + suggestedBrand.slice(1).toLowerCase();
    setBrand(formattedBrand);
    setModel(suggestedModel);
    setCorrectionSuggestion(null);
    await handleSearch(undefined, suggestedBrand, suggestedModel);
  };

  const handleSelectOption = async (fipeCode: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/compras/avaliacao?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(
          model
        )}&year_model=${yearModel}&km=${km}&fipe_code=${fipeCode}`
      );
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar o modelo selecionado.');
      }

      setFipeData(data.fipe);
      setSimilarOffers(data.similarOffers || []);
      setOptionsList(null);
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar dados da avaliação selecionada.');
    } finally {
      setLoading(false);
    }
  };

  const precificacao = useMemo(() => {
    if (!fipeData) return null;

    const baseFipe = fipeData.fipe_price_official;
    const ano = parseInt(yearModel, 10);
    const kmAtual = parseInt(km, 10) || 0;

    const currentYear = new Date().getFullYear();
    const age = Math.max(currentYear - ano, 1);
    const expectedKm = age * 12000;
    const kmDiff = kmAtual - expectedKm;

    let kmAdjustmentPercent = 0;
    if (kmDiff > 0) {
      kmAdjustmentPercent = -(kmDiff / 1000) * 0.05;
      if (kmAdjustmentPercent < -15) kmAdjustmentPercent = -15;
    } else {
      kmAdjustmentPercent = (Math.abs(kmDiff) / 1000) * 0.03;
      if (kmAdjustmentPercent > 8) kmAdjustmentPercent = 8;
    }

    let conditionAdjustmentPercent = 0;
    switch (condition) {
      case 'excelente': conditionAdjustmentPercent = 0; break;
      case 'bom': conditionAdjustmentPercent = -2; break;
      case 'regular': conditionAdjustmentPercent = -6; break;
      case 'ruim': conditionAdjustmentPercent = -15; break;
      default: conditionAdjustmentPercent = -2;
    }

    const estimatedRetailPrice = baseFipe * (1 + (kmAdjustmentPercent + conditionAdjustmentPercent) / 100);
    const marginAmount = estimatedRetailPrice * (marginPercent / 100);
    const recommendedPurchasePrice = Math.max(estimatedRetailPrice - marginAmount - prepCost, 0);
    const purchaseToFipeRatio = baseFipe > 0 ? (recommendedPurchasePrice / baseFipe) * 100 : 0;

    return {
      age,
      expectedKm,
      kmDiff,
      kmAdjustmentPercent,
      conditionAdjustmentPercent,
      estimatedRetailPrice,
      marginAmount,
      recommendedPurchasePrice,
      purchaseToFipeRatio
    };
  }, [fipeData, yearModel, km, marginPercent, prepCost, condition]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
      {/* Lado Esquerdo: Formulário */}
      <section className="lg:col-span-4 flex flex-col gap-6">
        <div className="glass-panel border border-zinc-800 rounded-2xl p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Avaliar Veículo</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Simulação de compra e precificação</p>
            </div>
          </div>

          <form onSubmit={(e) => handleSearch(e)} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Marca</label>
              <input 
                type="text" 
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: Volkswagen, Chevrolet..."
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Modelo</label>
              <input 
                type="text" 
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex: Amarok, Strada, Tracker..."
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Ano Modelo</label>
                <input 
                  type="number" 
                  value={yearModel}
                  onChange={(e) => setYearModel(e.target.value)}
                  placeholder="Ex: 2012"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Quilometragem</label>
                <input 
                  type="number" 
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="Ex: 160000"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-4 px-6 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Consultando FIPE...' : 'Pesquisar Preço FIPE'} 
              <Sparkles className="w-4 h-4" />
            </button>
          </form>

          {error && (
            <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="glass-panel border border-zinc-900 rounded-2xl p-5 text-xs text-zinc-400 flex gap-3">
          <Info className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-zinc-300 mb-1">Como calculamos a desvalorização?</p>
            <ul className="list-disc list-inside space-y-1">
              <li>KM médio nacional esperado: 12.000 km por ano.</li>
              <li>Km excessente: -0.05% a cada 1.000 km rodados a mais.</li>
              <li>Carro pouco rodado: +0.03% a cada 1.000 km economizados.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Lado Direito: Resultados */}
      <section className="lg:col-span-8 flex flex-col gap-6">
        {!searchDone && !loading && (
          <div className="glass-panel border border-zinc-800 rounded-2xl p-16 flex flex-col items-center justify-center text-center gap-4">
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500">
              <Calculator className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Aguardando Avaliação</h3>
              <p className="text-sm text-zinc-400 mt-1 max-w-sm">Insira os dados do carro no formulário ao lado para carregar a FIPE oficial e simular os custos.</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="glass-panel border border-zinc-800 rounded-2xl p-16 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div>
              <h3 className="font-bold text-white text-lg">Analisando Inteligência de Mercado</h3>
              <p className="text-sm text-zinc-400 mt-1">Conectando ao banco de dados FIPE e analisando histórico de repasses...</p>
            </div>
          </div>
        )}

        {searchDone && correctionSuggestion && !loading && (
          <div className="glass-panel border border-amber-500/20 bg-amber-950/5 rounded-2xl p-6 md:p-8 flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 shrink-0">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-xl">Você quis dizer {correctionSuggestion.brand.charAt(0) + correctionSuggestion.brand.slice(1).toLowerCase()} {correctionSuggestion.model.toUpperCase()}?</h3>
                <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{correctionSuggestion.message}</p>
              </div>
            </div>
            <div className="h-px bg-zinc-900" />
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-left w-full sm:w-auto">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold tracking-wider">Sugestão de Busca</span>
                <span className="text-sm font-bold text-zinc-200 mt-1 block">
                  {correctionSuggestion.brand.toUpperCase()} — {correctionSuggestion.model.toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleApplyCorrection(correctionSuggestion.brand, correctionSuggestion.model)}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Corrigir e Buscar Agora
              </button>
            </div>
          </div>
        )}

        {searchDone && optionsList && optionsList.length > 0 && !fipeData && !loading && (
          <div className="glass-panel border border-zinc-800 rounded-2xl p-6 md:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                <ListFilter className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Múltiplos Modelos Encontrados</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Selecione a versão exata do veículo correspondente à busca para calcular o preço sugerido:</p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto pr-1">
              {optionsList.map((opt) => (
                <button
                  key={opt.fipe_code}
                  type="button"
                  onClick={() => handleSelectOption(opt.fipe_code)}
                  className="w-full p-4 rounded-xl border border-zinc-900 bg-zinc-950/40 hover:border-zinc-800 text-left transition-colors flex justify-between items-center group cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors block leading-snug">{opt.model_official}</span>
                    <span className="text-[10px] text-zinc-500 block mt-1">Código FIPE: {opt.fipe_code}</span>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <span className="text-[9px] text-zinc-500 block uppercase">{opt.is_estimated ? 'Estimativa' : 'Referência'}</span>
                    <span className="text-sm font-bold mt-0.5 block text-emerald-400">
                      {opt.fipe_price_official.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {searchDone && fipeData && precificacao && !loading && (
          <>
            <div className="glass-panel border border-zinc-800 rounded-2xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-900">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border bg-emerald-500/5 ${fipeData.is_estimated ? 'border-amber-500/20 text-amber-400 bg-amber-500/5' : 'border-emerald-500/20 text-emerald-400'}`}>
                    {fipeData.is_estimated ? 'Preço Estimado (FIPE Instável)' : `Fipe Oficial (${fipeData.fipe_code})`}
                  </span>
                  <h3 className="text-2xl font-extrabold text-white mt-3 leading-tight">{fipeData.model_official}</h3>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" /> Ano Modelo: {yearModel} 
                    <span className="text-zinc-700">•</span> 
                    <Gauge className="w-3.5 h-3.5 text-zinc-500" /> Quilometragem: {parseInt(km, 10).toLocaleString('pt-BR')} km
                  </p>
                </div>
                
                <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col items-end shrink-0">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Referência FIPE</span>
                  <span className="text-xl font-black text-zinc-100 mt-1">
                    {fipeData.fipe_price_official.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-5">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-primary" /> Margem do Lojista (Inteligente)
                  </h4>
                  <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-zinc-400 text-sm font-semibold block">Margem de Lucro</span>
                        <span className="text-[10px] text-zinc-500 block mt-1">
                          {similarOffers.length > 0 ? `Média sobre ${similarOffers.length} anúncios` : 'Estimada de forma padrão'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-primary block leading-none">{marginPercent}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span className="text-zinc-400">Preparação & Manutenção</span>
                      <span className="text-zinc-100 font-bold">
                        {prepCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="15000" 
                      step="500"
                      value={prepCost} 
                      onChange={(e) => setPrepCost(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-zinc-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-zinc-400" /> Conservação do Carro
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'excelente', label: 'Excelente', desc: 'Sem retoques (Fipe 100%)', val: '0%' },
                      { id: 'bom', label: 'Bom', desc: 'Retoques normais (-2%)', val: '-2%' },
                      { id: 'regular', label: 'Regular', desc: 'Detalhes/Pintura (-6%)', val: '-6%' },
                      { id: 'ruim', label: 'Ruim', desc: 'Exige mecânica (-15%)', val: '-15%' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCondition(item.id)}
                        className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          condition === item.id 
                            ? 'border-primary bg-primary/5 text-white' 
                            : 'border-zinc-900 bg-zinc-950/40 hover:border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-bold text-xs">{item.label}</span>
                          <span className={`text-[10px] font-semibold ${condition === item.id ? 'text-primary' : 'text-zinc-500'}`}>{item.val}</span>
                        </div>
                        <span className="text-[9px] mt-1 opacity-70 leading-none">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-3.5">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Breakdown de Avaliação</h4>
                <div className="flex flex-col gap-2.5 text-xs text-zinc-400">
                  <div className="flex justify-between">
                    <span>FIPE</span>
                    <span className="text-zinc-200">{fipeData.fipe_price_official.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Desgaste KM</span>
                    <span className={`font-semibold ${precificacao.kmAdjustmentPercent >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {precificacao.kmAdjustmentPercent >= 0 ? '+' : ''}{precificacao.kmAdjustmentPercent.toFixed(2)}% ({
                        (fipeData.fipe_price_official * (precificacao.kmAdjustmentPercent / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      })
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Conservação</span>
                    <span className="text-amber-400 font-semibold">
                      {precificacao.conditionAdjustmentPercent}% ({
                        (fipeData.fipe_price_official * (precificacao.conditionAdjustmentPercent / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      })
                    </span>
                  </div>
                  <div className="h-px bg-zinc-900 my-1" />
                  <div className="flex justify-between font-bold text-zinc-200">
                    <span>Venda (Varejo) Estimada</span>
                    <span className="text-white">{precificacao.estimatedRetailPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>Margem do Lojista ({marginPercent}%)</span>
                    <span className="text-zinc-400">-{precificacao.marginAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>Preparação</span>
                    <span className="text-zinc-400">-{prepCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-white text-base">Preço de Compra Recomendado</h4>
                    <p className="text-xs text-zinc-400 mt-1">Valor sugerido de oferta (repasse).</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">+ / - FIPE:</span>
                      <span className="text-xs font-extrabold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                        {precificacao.purchaseToFipeRatio - 100 > 0 
                          ? `+${(precificacao.purchaseToFipeRatio - 100).toFixed(1)}%` 
                          : `${(precificacao.purchaseToFipeRatio - 100).toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end bg-black/60 border border-zinc-900 rounded-xl px-6 py-4">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Sugestão de Oferta</span>
                  <span className="text-3xl font-black text-white mt-1.5">
                    {precificacao.recommendedPurchasePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-panel border border-zinc-900 rounded-2xl p-6 flex flex-col gap-5">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-primary" /> Ofertas Históricas Reais
              </h3>
              {similarOffers.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">Não foram encontradas ofertas anteriores no banco de dados.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {similarOffers.map((offer) => {
                    const discountFipeNum = offer.fipe_price_official && offer.net_price 
                      ? Math.round((offer.net_price / offer.fipe_price_official) * 100) - 100
                      : null;

                    return (
                      <div key={offer.id} className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 rounded-xl p-4 flex flex-col justify-between gap-3 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-xs text-white uppercase">{offer.model}</h4>
                            <p className="text-[10px] text-zinc-500 mt-1">Ano: {offer.year_model} • Coletado em: {new Date(offer.created_at).toLocaleDateString('pt-BR')}</p>
                          </div>
                          {discountFipeNum !== null && (
                            <span className={`text-[9px] font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded ${discountFipeNum <= -10 ? 'text-lime-400' : 'text-emerald-400'}`}>
                              {discountFipeNum > 0 ? `+${discountFipeNum}%` : `${discountFipeNum}%`}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-end border-t border-zinc-900/60 pt-2 text-xs">
                          <div>
                            <span className="text-[9px] text-zinc-500 block uppercase">Pedida</span>
                            <span className="text-zinc-300 font-semibold">{offer.ask_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-zinc-500 block uppercase">Líquido</span>
                            <span className="text-white font-bold">{offer.net_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
