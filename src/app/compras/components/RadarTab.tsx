import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, Layers, AlertTriangle } from 'lucide-react';
import { OpportunityCard } from './OpportunityCard';
import { DetailDrawer } from './DetailDrawer';
import { InterestModal } from './InterestModal';

interface Opportunity {
  id: string;
  brand: string;
  model: string;
  year_model: number;
  km: number;
  ask_price: number;
  fipe_price: number;
  fipe_price_official: number | null;
  fipe_pct: number;
  deal_score: number;
  rating: 'EXCELENTE' | 'BOM' | 'MEDIO' | 'RUIM' | 'EVITAR';
  reasons: { type: 'fipe' | 'bonus' | 'penalty' | 'info'; text: string }[];
  seller_name: string | null;
  seller_phone: string | null;
  location: string | null;
  posted_at: string;
  recovered_accident: boolean;
  notes: string | null;
  grupo_anuncio: string;
}

export const RadarTab: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [minYear, setMinYear] = useState('');
  const [maxYear, setMaxYear] = useState('');
  const [maxKm, setMaxKm] = useState('ALL');
  const [maxFipePct, setMaxFipePct] = useState('ALL');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'ALL' | 'EXCELENTE' | 'BOM' | 'DESAGIO'>('ALL');

  // Modals e Drawers
  const [selectedOppForDrawer, setSelectedOppForDrawer] = useState<Opportunity | null>(null);
  const [selectedOppForInterest, setSelectedOppForInterest] = useState<Opportunity | null>(null);

  useEffect(() => {
    async function fetchOpportunities() {
      try {
        const res = await fetch('/api/compras/oportunidades?limit=150');
        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Erro ao carregar oportunidades.');
        }
        setOpportunities(data.opportunities || []);
      } catch (err: any) {
        setError(err.message || 'Falha ao buscar oportunidades.');
      } finally {
        setLoading(false);
      }
    }
    fetchOpportunities();
  }, []);

  const uniqueBrands = useMemo(() => {
    const brands = opportunities.map(o => o.brand ? o.brand.toUpperCase() : 'OUTROS');
    const unique = Array.from(new Set(brands)).filter(b => b && b !== 'OUTROS');
    unique.sort();
    const topBrands = ['VOLKSWAGEN', 'CHEVROLET', 'FIAT', 'FORD', 'HONDA', 'TOYOTA', 'VW', 'GM'];
    return ['ALL', ...topBrands.filter(b => unique.includes(b)), ...unique.filter(b => !topBrands.includes(b)), 'OUTROS'];
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    let result = opportunities.filter(o => {
      if (activeQuickFilter === 'EXCELENTE' && o.rating !== 'EXCELENTE') return false;
      if (activeQuickFilter === 'BOM' && o.rating !== 'BOM') return false;

      const matchesSearch = o.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.brand ? o.brand.toLowerCase().includes(searchQuery.toLowerCase()) : false);
      const matchesBrand = selectedBrand === 'ALL' || 
        (selectedBrand === 'OUTROS' && (!o.brand || o.brand.toUpperCase() === 'OUTROS')) ||
        (o.brand ? o.brand.toUpperCase() === selectedBrand : false);
      
      const year = o.year_model;
      const matchesMinYear = !minYear || year >= parseInt(minYear, 10);
      const matchesMaxYear = !maxYear || year <= parseInt(maxYear, 10);
      const matchesKm = maxKm === 'ALL' || (maxKm === 'OVER_100000' ? o.km > 100000 : o.km <= parseInt(maxKm, 10));
      const matchesFipePct = maxFipePct === 'ALL' || (o.fipe_pct !== null && o.fipe_pct <= parseInt(maxFipePct, 10));

      return matchesSearch && matchesBrand && matchesMinYear && matchesMaxYear && matchesKm && matchesFipePct;
    });

    if (activeQuickFilter === 'DESAGIO') {
      result.sort((a, b) => (a.fipe_pct ?? 100) - (b.fipe_pct ?? 100));
    } else {
      result.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
    }
    return result;
  }, [opportunities, searchQuery, selectedBrand, minYear, maxYear, maxKm, maxFipePct, activeQuickFilter]);

  const stats = useMemo(() => {
    const total = filteredOpportunities.length;
    const excelentes = filteredOpportunities.filter(o => o.deal_score >= 85).length;
    const bons = filteredOpportunities.filter(o => o.deal_score >= 70 && o.deal_score < 85).length;
    const offersWithFipe = filteredOpportunities.filter(o => o.fipe_price > 0);
    let avgDiscount = 0;
    if (offersWithFipe.length > 0) {
      avgDiscount = Math.round(offersWithFipe.reduce((acc, o) => acc + (100 - o.fipe_pct), 0) / offersWithFipe.length);
    }
    return { total, excelentes, bons, avgDiscount };
  }, [filteredOpportunities]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedBrand('ALL');
    setMinYear('');
    setMaxYear('');
    setMaxKm('ALL');
    setMaxFipePct('ALL');
    setActiveQuickFilter('ALL');
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Stats Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {[
          { id: 'ALL', label: 'Total de Ofertas', val: stats.total, color: 'text-white', badge: 'Filtradas', active: activeQuickFilter === 'ALL' },
          { id: 'EXCELENTE', label: 'Excelentes', val: stats.excelentes, color: 'text-lime-400', badge: 'Score >= 85', active: activeQuickFilter === 'EXCELENTE' },
          { id: 'BOM', label: 'Bons Negócios', val: stats.bons, color: 'text-emerald-400', badge: 'Score 70-84', active: activeQuickFilter === 'BOM' },
          { id: 'DESAGIO', label: 'Média de Deságio', val: `-${stats.avgDiscount}%`, color: 'text-zinc-100', badge: 'Sobre FIPE', active: activeQuickFilter === 'DESAGIO' }
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => setActiveQuickFilter(item.id as any)}
            className={`glass-panel border rounded-2xl p-5 flex flex-col justify-between gap-4 text-left transition-all cursor-pointer ${
              item.active ? 'border-zinc-500 bg-zinc-900/40' : 'border-zinc-900 hover:border-zinc-700'
            }`}
          >
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{item.label}</span>
            <div className="flex items-end justify-between w-full">
              <span className={`text-3xl font-black ${item.color}`}>{loading ? '...' : item.val}</span>
              <span className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded">{item.badge}</span>
            </div>
          </button>
        ))}
      </section>

      {/* Filtros */}
      <section className="glass-panel border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 w-full">
        <div className="flex flex-col lg:flex-row flex-wrap items-end gap-3 w-full">
          <div className="flex-1 min-w-[200px] flex flex-col gap-1.5 w-full">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Busca Rápida</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Modelo, versão..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 text-zinc-200 text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          <div className="w-full sm:w-auto sm:flex-1 min-w-[140px] flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Marca</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full h-11 bg-zinc-950 border border-zinc-900 rounded-xl px-4 text-zinc-300 text-sm font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas</option>
              {uniqueBrands.filter(b => b !== 'ALL').map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto min-w-[140px] flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Ano (De/Até)</label>
            <div className="flex gap-2">
              <select value={minYear} onChange={(e) => setMinYear(e.target.value)} className="w-full h-11 bg-zinc-950 border border-zinc-900 rounded-xl px-2 text-zinc-200 text-xs focus:outline-none cursor-pointer text-center">
                <option value="">Min</option>
                {Array.from({length: 17}, (_, i) => 2010 + i).map(year => (
                  <option key={`min-${year}`} value={year}>{year}</option>
                ))}
              </select>
              <select value={maxYear} onChange={(e) => setMaxYear(e.target.value)} className="w-full h-11 bg-zinc-950 border border-zinc-900 rounded-xl px-2 text-zinc-200 text-xs focus:outline-none cursor-pointer text-center">
                <option value="">Max</option>
                {Array.from({length: 17}, (_, i) => 2010 + i).map(year => (
                  <option key={`max-${year}`} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-full sm:w-auto sm:flex-1 min-w-[140px] flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">KM Máxima</label>
            <select value={maxKm} onChange={(e) => setMaxKm(e.target.value)} className="w-full h-11 bg-zinc-950 border border-zinc-900 rounded-xl px-4 text-zinc-300 text-sm font-semibold focus:outline-none cursor-pointer">
              <option value="ALL">Qualquer KM</option>
              <option value="30000">Até 30.000 km</option>
              <option value="60000">Até 60.000 km</option>
              <option value="100000">Até 100.000 km</option>
              <option value="OVER_100000">Acima 100k</option>
            </select>
          </div>

          <div className="w-full sm:w-auto sm:flex-1 min-w-[180px] flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Desconto Mínimo</label>
            <select value={maxFipePct} onChange={(e) => setMaxFipePct(e.target.value)} className="w-full h-11 bg-zinc-950 border border-zinc-900 rounded-xl px-4 text-zinc-300 text-sm font-semibold focus:outline-none cursor-pointer">
              <option value="ALL">Qualquer Margem</option>
              <option value="90">Mais de 10% desc.</option>
              <option value="85">Mais de 15% desc.</option>
              <option value="80">Mais de 20% desc.</option>
            </select>
          </div>
          
          <button
            type="button"
            onClick={clearAllFilters}
            className="w-full sm:w-auto shrink-0 h-11 px-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpar
          </button>
        </div>
      </section>

      {/* Lista */}
      {loading ? (
        <div className="glass-panel border border-zinc-850 rounded-2xl p-20 flex flex-col items-center justify-center text-center gap-4 w-full">
          <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <h3 className="font-bold text-white text-lg">Avaliando Oportunidades</h3>
        </div>
      ) : error ? (
        <div className="glass-panel border border-red-500/20 bg-red-950/5 rounded-2xl p-16 flex flex-col items-center justify-center text-center gap-4 w-full">
          <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />
          <p className="text-sm text-red-450">{error}</p>
        </div>
      ) : filteredOpportunities.length === 0 ? (
        <div className="glass-panel border border-zinc-850 rounded-2xl p-20 flex flex-col items-center justify-center text-center gap-4 w-full text-zinc-500">
          <Layers className="w-8 h-8" />
          <h3 className="font-bold text-white text-lg">Nenhuma Oportunidade Encontrada</h3>
        </div>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full pb-10">
          {filteredOpportunities.map(opp => (
            <OpportunityCard 
              key={opp.id} 
              opp={opp} 
              onSelect={setSelectedOppForDrawer}
              onInterest={(o, e) => {
                e.stopPropagation();
                setSelectedOppForInterest(o);
              }}
            />
          ))}
        </section>
      )}

      {/* Drawer e Modal */}
      <DetailDrawer 
        isOpen={!!selectedOppForDrawer} 
        onClose={() => setSelectedOppForDrawer(null)} 
        opp={selectedOppForDrawer}
        onInterest={(o) => {
          setSelectedOppForDrawer(null);
          setSelectedOppForInterest(o);
        }}
      />
      
      <InterestModal 
        isOpen={!!selectedOppForInterest} 
        onClose={() => setSelectedOppForInterest(null)} 
        opp={selectedOppForInterest}
      />
    </div>
  );
};
