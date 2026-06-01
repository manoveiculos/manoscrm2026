'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, MapPin, Calendar, Gauge, Phone, Info,
  ListFilter, Sparkles, ExternalLink, Calculator, Trash2, AlertTriangle
} from 'lucide-react';
import FipeLinkModal from './FipeLinkModal';
import FacebookLeadDrawer from './FacebookLeadDrawer';

export interface FacebookLead {
  mensagem_id: string;
  whatsapp_instancia: string;
  whatsapp_remetente: string;
  contato_nome_whatsapp: string;
  data_envio: string;
  data_envio_formatada: string;
  nome: string;
  telefone: string;
  cidade: string;
  veiculo: string;
  ano: string;
  km: string;
  valor_pedido: string;
  aceita_fipe: string;
  origem: string;
  resumo: string;
  fipe_price: number | null;
  fipe_model: string | null;
  fipe_code: string | null;
  fipe_pct: number | null;
  deal_score: number | null;
  is_estimated: boolean;
  status_negociacao?: string;
  observacao_negociacao?: string;
}

interface FacebookTabProps {
  onNavigateToTab?: (tab: string, params?: any) => void;
  userEmail?: string | null;
}

export default function FacebookTab({ onNavigateToTab, userEmail }: FacebookTabProps) {
  const [leads, setLeads] = useState<FacebookLead[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('ALL');
  const [onlyFipeAccepted, setOnlyFipeAccepted] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'discount' | 'score' | 'price'>('recent');
  const [filterNegotiation, setFilterNegotiation] = useState<string>('ALL');

  // Modais / Gavetas
  const [selectedLead, setSelectedLead] = useState<FacebookLead | null>(null);
  const [fipeSearchModalOpen, setFipeSearchModalOpen] = useState(false);
  const [leadForFipeSearch, setLeadForFipeSearch] = useState<FacebookLead | null>(null);

  // Carrega leads usando a chave de segurança padrão nas requisições da API
  const loadLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/compras/facebook?admin_key=manos_intel_secret_key');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar ofertas do Facebook.');
      }
      setLeads(data.leads || []);
      setCities(data.cities || []);
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const handleDeleteLead = async (lead: FacebookLead) => {
    if (!window.confirm(`Deseja realmente apagar o lead de ${lead.nome || 'cliente'} (${lead.veiculo})?`)) return;
    try {
      const res = await fetch(`/api/compras/facebook?admin_key=manos_intel_secret_key&mensagem_id=${lead.mensagem_id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLeads(prev => prev.filter(l => l.mensagem_id !== lead.mensagem_id));
        if (selectedLead?.mensagem_id === lead.mensagem_id) {
          setSelectedLead(null);
        }
      } else {
        alert(data.error || 'Erro ao excluir o lead.');
      }
    } catch (err) {
      alert('Falha ao conectar com o servidor.');
    }
  };

  const handleOpenFipeSearch = (lead: FacebookLead) => {
    setLeadForFipeSearch(lead);
    setFipeSearchModalOpen(true);
  };

  const handleFipeLinked = (updatedLead: FacebookLead) => {
    setLeads(prev => prev.map(l => l.mensagem_id === updatedLead.mensagem_id ? updatedLead : l));
    if (selectedLead?.mensagem_id === updatedLead.mensagem_id) {
      setSelectedLead(updatedLead);
    }
  };

  const filteredLeads = useMemo(() => {
    let result = leads.filter(lead => {
      const matchesSearch = 
        (lead.veiculo?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (lead.nome?.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCity = selectedCity === 'ALL' || 
        (lead.cidade?.trim().toLowerCase() === selectedCity.trim().toLowerCase());

      const matchesFipe = !onlyFipeAccepted || 
        (lead.aceita_fipe?.trim().toLowerCase() === 'sim');

      const leadStatus = lead.status_negociacao || 'PENDENTE';
      const matchesNegotiation = filterNegotiation === 'ALL' ||
        (filterNegotiation === 'PENDENTE' && (!lead.status_negociacao || lead.status_negociacao === 'PENDENTE')) ||
        (leadStatus === filterNegotiation);

      return matchesSearch && matchesCity && matchesFipe && matchesNegotiation;
    });

    if (sortBy === 'discount') {
      result.sort((a, b) => (a.fipe_pct ?? 999) - (b.fipe_pct ?? 999));
    } else if (sortBy === 'score') {
      result.sort((a, b) => (b.deal_score ?? -1) - (a.deal_score ?? -1));
    } else if (sortBy === 'price') {
      const getPrice = (l: any) => {
        const clean = l.valor_pedido?.replace(/[^\d]/g, '');
        return clean ? parseInt(clean, 10) : Infinity;
      };
      result.sort((a, b) => getPrice(a) - getPrice(b));
    }
    return result;
  }, [leads, searchQuery, selectedCity, onlyFipeAccepted, sortBy, filterNegotiation]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const fipeSim = filteredLeads.filter(l => l.aceita_fipe?.trim().toLowerCase() === 'sim').length;
    
    const umDiaAtras = new Date();
    umDiaAtras.setDate(umDiaAtras.getDate() - 1);
    const leadsRecentes = filteredLeads.filter(l => l.data_envio && new Date(l.data_envio) >= umDiaAtras).length;

    return { total, fipeSim, leadsRecentes };
  }, [filteredLeads]);

  const handleGoToCalculator = (e: React.MouseEvent, lead: FacebookLead) => {
    e.stopPropagation();
    const brand = lead.veiculo.trim().split(' ')[0];
    const model = lead.veiculo.trim().split(' ').slice(1).join(' ');
    const year = lead.ano ? lead.ano.replace(/[^\d]/g, '').slice(0, 4) : '2018';
    const kmVal = lead.km ? lead.km.replace(/[^\d]/g, '') : '80000';

    if (onNavigateToTab) {
      onNavigateToTab('calculator', { brand, model, year_model: year, km: kmVal });
    } else {
      window.location.href = `/compras?tab=calculator&brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&year_model=${year}&km=${kmVal}`;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel border border-zinc-900 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total de Leads</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-white">{loading ? '...' : stats.total}</span>
          </div>
        </div>
        <div className="glass-panel border border-zinc-900 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Aceitam FIPE</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-emerald-400">{loading ? '...' : stats.fipeSim}</span>
          </div>
        </div>
        <div className="glass-panel border border-zinc-900 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Últimas 24h</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-blue-400">{loading ? '...' : stats.leadsRecentes}</span>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="glass-panel border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-3 flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Busca de Veículo ou Cliente</label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Pesquisar Voyage, Compass..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-800 transition-colors"
              />
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cidade</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3.5 text-zinc-350 text-sm font-semibold focus:outline-none focus:border-zinc-800 transition-colors cursor-pointer"
            >
              <option value="ALL">TODAS AS CIDADES</option>
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Ordenar por</label>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3.5 text-zinc-350 text-sm font-semibold focus:outline-none focus:border-zinc-800 transition-colors cursor-pointer"
            >
              <option value="recent">MAIS RECENTES</option>
              <option value="discount">MAIOR DESCONTO (FIPE)</option>
              <option value="score">MELHOR DEAL SCORE</option>
              <option value="price">MENOR VALOR PEDIDO</option>
            </select>
          </div>

          <div className="lg:col-span-3 flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Negociação</label>
            <select
              value={filterNegotiation}
              onChange={(e) => setFilterNegotiation(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3.5 text-zinc-350 text-sm font-semibold focus:outline-none focus:border-zinc-800 transition-colors cursor-pointer"
            >
              <option value="ALL">TODOS OS STATUS</option>
              <option value="PENDENTE">PENDENTE / SEM CONTATO</option>
              <option value="EM_NEGOCIACAO">EM NEGOCIAÇÃO</option>
              <option value="CHAMAR_FUTURO">CHAMAR NO FUTURO</option>
              <option value="DESCARTADO">DESCARTADO</option>
              <option value="COMPRADO">COMPRADO</option>
            </select>
          </div>

          <div className="lg:col-span-2 flex items-center justify-start pb-3">
            <label className="flex items-center gap-3 cursor-pointer select-none text-zinc-300 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={onlyFipeAccepted}
                onChange={(e) => setOnlyFipeAccepted(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-primary focus:ring-primary focus:ring-offset-black cursor-pointer"
              />
              <span className="text-[10px] font-bold uppercase tracking-wider">Aceita FIPE</span>
            </label>
          </div>
        </div>
      </section>

      {/* Tabela de Leads */}
      <section className="glass-panel border border-zinc-900 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-24 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs text-zinc-550">Buscando ofertas...</span>
          </div>
        ) : error ? (
          <div className="p-16 flex flex-col items-center justify-center text-center gap-4 bg-red-950/5">
            <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-24 flex flex-col items-center justify-center text-center gap-4">
            <span className="text-xs text-zinc-550 italic">Nenhum lead encontrado com os filtros selecionados.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-900 bg-zinc-950/60 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  <th className="px-6 py-4">Veículo</th>
                  <th className="px-6 py-4">Ano</th>
                  <th className="px-6 py-4">KM</th>
                  <th className="px-6 py-4">Valor Pedido</th>
                  <th className="px-6 py-4">Cidade</th>
                  <th className="px-6 py-4">Negociação</th>
                  <th className="px-6 py-4">Data Envio</th>
                  <th className="px-6 py-4">FIPE Oficial</th>
                  <th className="px-6 py-4 text-center">Calculadora</th>
                  <th className="px-6 py-4 text-center">Excluir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/60">
                {filteredLeads.map((lead) => {
                  const isFipeSim = lead.aceita_fipe?.trim().toLowerCase() === 'sim';
                  return (
                    <tr 
                      key={lead.mensagem_id}
                      onClick={() => setSelectedLead(lead)}
                      className={`hover:bg-zinc-900/40 transition-all cursor-pointer group relative ${
                        isFipeSim ? 'border-l-2 border-l-emerald-500' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors block">
                          {lead.veiculo}
                        </span>
                        <span className="text-[10px] text-zinc-550 block mt-0.5">
                          Cliente: {lead.nome || 'Não informado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-300 font-semibold">{lead.ano || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-zinc-350">{lead.km ? `${lead.km} km` : 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-white font-extrabold">{lead.valor_pedido || 'N/A'}</td>
                       <td className="px-6 py-4 text-sm text-zinc-400 capitalize">{lead.cidade || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black border whitespace-nowrap uppercase tracking-wider ${
                          lead.status_negociacao === 'CHAMAR_FUTURO' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                          lead.status_negociacao === 'DESCARTADO' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                          lead.status_negociacao === 'EM_NEGOCIACAO' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                          lead.status_negociacao === 'COMPRADO' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                          'bg-zinc-900/50 border-zinc-850 text-zinc-400'
                        }`}>
                          {lead.status_negociacao === 'CHAMAR_FUTURO' ? 'Chamar Futuro' :
                           lead.status_negociacao === 'DESCARTADO' ? 'Descartado' :
                           lead.status_negociacao === 'EM_NEGOCIACAO' ? 'Em Negociação' :
                           lead.status_negociacao === 'COMPRADO' ? 'Comprado' :
                           'Pendente'}
                        </span>
                        {lead.observacao_negociacao && (
                          <span className="block text-[10px] text-zinc-550 mt-1 max-w-[150px] truncate" title={lead.observacao_negociacao}>
                            {lead.observacao_negociacao}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500">{lead.data_envio_formatada}</td>
                      <td className="px-6 py-4 text-sm text-zinc-350">
                        {lead.fipe_price ? (
                          <div>
                            <span className="font-bold text-zinc-300">
                              {lead.fipe_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                            </span>
                            {lead.fipe_pct !== null && (
                              <span className={`block text-[10px] font-bold mt-0.5 ${lead.fipe_pct <= 90 ? 'text-lime-400' : lead.fipe_pct <= 100 ? 'text-emerald-400' : 'text-amber-500'}`}>
                                {lead.fipe_pct - 100 > 0 ? `+${lead.fipe_pct - 100}%` : `${lead.fipe_pct - 100}%`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-zinc-650 text-xs italic block">Não cotado</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleOpenFipeSearch(lead); }}
                              className="inline-flex items-center gap-1 text-[10px] font-extrabold text-primary hover:text-primary/80 transition-colors bg-transparent border-0 cursor-pointer p-0 w-fit"
                            >
                              Localizar FIPE
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => handleGoToCalculator(e, lead)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-extrabold cursor-pointer"
                        >
                          <Calculator className="w-3.5 h-3.5 text-primary" />
                          Calcular
                          {lead.deal_score !== null && (
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black border ml-1 ${
                              lead.deal_score >= 85 ? 'bg-lime-500/10 border-lime-500/20 text-lime-400' :
                              lead.deal_score >= 70 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                              lead.deal_score >= 50 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                              'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                              {lead.deal_score}
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDeleteLead(lead)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modais */}
      <FipeLinkModal 
        isOpen={fipeSearchModalOpen}
        lead={leadForFipeSearch}
        onClose={() => { setFipeSearchModalOpen(false); setLeadForFipeSearch(null); }}
        onLinked={handleFipeLinked}
      />

      <FacebookLeadDrawer 
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onOpenFipeSearch={handleOpenFipeSearch}
        onDelete={handleDeleteLead}
        onNavigateToTab={onNavigateToTab}
        onUpdateLead={handleFipeLinked}
        userEmail={userEmail}
      />
    </div>
  );
}
