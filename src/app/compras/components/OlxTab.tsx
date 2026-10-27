'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  MapPin,
  Calendar,
  Gauge,
  Flame,
  ExternalLink,
  Calculator,
  RefreshCw,
  TrendingDown,
  User,
  Store,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Play,
  Square,
  Sparkles,
  Filter,
} from 'lucide-react';

export interface OlxOpportunity {
  id: string;
  ad_id: string;
  url: string;
  titulo: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  km: number | null;
  combustivel: string | null;
  cambio: string | null;
  preco: number;
  preco_fipe: number | null;
  margem_percent: number | null;
  margem_valor: number | null;
  localizacao: string;
  foto_url: string | null;
  publicado_em: string | null;
  is_particular: boolean;
  has_leilao: boolean;
  status_classificacao: string;
  is_queda_preco: boolean;
  preco_anterior: number | null;
  avisos: string[];
  status_crm: 'novo' | 'em_analise' | 'contatado' | 'descartado' | 'comprado';
  responsavel_nome: string | null;
  observacoes: string | null;
  created_at: string;
}

interface OlxTabProps {
  onNavigateToTab?: (tab: string, params?: any) => void;
  userEmail?: string | null;
  role?: 'admin' | 'consultant';
}

function formatBRL(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return 'R$ —';
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OlxTab({ onNavigateToTab, userEmail, role }: OlxTabProps) {
  const [opportunities, setOpportunities] = useState<OlxOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalGeral: 0,
    totalOportunidades15: 0,
    totalParticulares: 0,
    totalQuedasPreco: 0,
  });

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState('ALL');
  const [minMargin, setMinMargin] = useState<string>('15');
  const [onlyParticular, setOnlyParticular] = useState(false);
  const [statusCrm, setStatusCrm] = useState('all');
  const [sortBy, setSortBy] = useState('margin_desc');

  // Controle do Bot Local
  const [botStatus, setBotStatus] = useState<{ online: boolean; running?: boolean }>({ online: false });
  const [acionandoBot, setAcionandoBot] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Carregar oportunidades
  async function carregarOportunidades() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedCity !== 'ALL') params.set('city', selectedCity);
      if (minMargin) params.set('min_margin', minMargin);
      if (onlyParticular) params.set('only_particular', 'true');
      if (statusCrm !== 'all') params.set('status_crm', statusCrm);
      params.set('sort_by', sortBy);

      const res = await fetch(`/api/compras/olx?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOpportunities(data.opportunities || []);
        setCities(data.cities || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Erro ao buscar dados da OLX:', err);
    } finally {
      setLoading(false);
    }
  }

  // Checar status do robô Python local
  async function checarBot() {
    try {
      const res = await fetch('/api/compras/olx/bot');
      const data = await res.json();
      setBotStatus({
        online: Boolean(data.online),
        running: Boolean(data.bot?.running),
      });
    } catch {
      setBotStatus({ online: false });
    }
  }

  useEffect(() => {
    carregarOportunidades();
    checarBot();
  }, [selectedCity, minMargin, onlyParticular, statusCrm, sortBy]);

  // Ações do Robô
  async function dispararAcaoBot(action: 'start' | 'stop' | 'scan_now') {
    setAcionandoBot(true);
    try {
      await fetch('/api/compras/olx/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await checarBot();
      if (action === 'scan_now') {
        setTimeout(carregarOportunidades, 3000);
      }
    } catch (err) {
      console.error('Erro ao acionar robô:', err);
    } finally {
      setAcionandoBot(false);
    }
  }

  // Atualizar Status do CRM (Novo, Em Análise, Contatado, Descartado)
  async function handleMudarStatus(id: string, novoStatus: string) {
    try {
      const res = await fetch('/api/compras/olx', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status_crm: novoStatus,
          responsavel_nome: userEmail ? userEmail.split('@')[0] : 'Consultor',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOpportunities((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status_crm: novoStatus as any } : o))
        );
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  }

  // Copiar Proposta Formatada para WhatsApp
  function handleCopiarProposta(item: OlxOpportunity) {
    const texto = `Olá! Vi seu anúncio do ${item.titulo} na OLX. Tenho real interesse e pagamento à vista. O carro ainda está disponível para visita?`;
    navigator.clipboard.writeText(texto);
    setCopiadoId(item.id);
    setTimeout(() => setCopiadoId(null), 2500);
  }

  return (
    <div className="space-y-6">
      {/* Topo: KPIs e Status do Robô Garimpeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* KPI 1: Oportunidades de Ouro */}
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" /> Margem &ge; 15% FIPE
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold">
              SC
            </span>
          </div>
          <p className="text-2xl font-black text-amber-300 mt-2">{stats.totalOportunidades15}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Carros com alta margem</p>
        </div>

        {/* KPI 2: Total Monitorado */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] uppercase font-bold text-slate-400">Total Anúncios na Base</span>
          <p className="text-2xl font-black text-white mt-2">{stats.totalGeral}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Varredura contínua OLX SC</p>
        </div>

        {/* KPI 3: Particulares */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-blue-400" /> Particulares
            </span>
            <span className="text-[10px] text-blue-400 font-bold">
              {stats.totalGeral > 0 ? `${Math.round((stats.totalParticulares / stats.totalGeral) * 100)}%` : '0%'}
            </span>
          </div>
          <p className="text-2xl font-black text-blue-400 mt-2">{stats.totalParticulares}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Proprietários diretos</p>
        </div>

        {/* KPI 4: Queda de Preço */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> Baixaram Preço
          </span>
          <p className="text-2xl font-black text-emerald-400 mt-2">{stats.totalQuedasPreco}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Vendedores apressados</p>
        </div>

        {/* KPI 5: Painel do Robô */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Status Robô Local</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                botStatus.online
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${botStatus.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {botStatus.online ? (botStatus.running ? 'Varrendo' : 'Online') : 'Offline'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            <button
              type="button"
              disabled={acionandoBot || !botStatus.online}
              onClick={() => dispararAcaoBot('scan_now')}
              className="flex-1 py-1.5 px-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 text-amber-300 font-bold text-[11px] border border-amber-500/30 flex items-center justify-center gap-1 transition"
              title="Executar ciclo de varredura imediato"
            >
              <RefreshCw className={`w-3 h-3 ${acionandoBot ? 'animate-spin' : ''}`} />
              Varredura
            </button>

            {botStatus.running ? (
              <button
                type="button"
                disabled={acionandoBot}
                onClick={() => dispararAcaoBot('stop')}
                className="py-1.5 px-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-bold text-[11px] border border-rose-500/30 transition"
                title="Pausar monitoramento contínuo"
              >
                <Square className="w-3 h-3" />
              </button>
            ) : (
              <button
                type="button"
                disabled={acionandoBot || !botStatus.online}
                onClick={() => dispararAcaoBot('start')}
                className="py-1.5 px-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 text-emerald-300 font-bold text-[11px] border border-emerald-500/30 transition"
                title="Iniciar monitoramento 24/7"
              >
                <Play className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Busca Textual */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && carregarOportunidades()}
              placeholder="Buscar modelo, versão ou placa (ex: Civic, Onix, C4)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Filtro Cidade */}
          <div className="md:col-span-3">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">📍 Todas as Cidades de SC</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Margem Mínima */}
          <div className="md:col-span-2">
            <select
              value={minMargin}
              onChange={(e) => setMinMargin(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-500"
            >
              <option value="">Margem: Todas</option>
              <option value="15">🔥 &ge; 15% Abaixo FIPE</option>
              <option value="20">🔥 &ge; 20% Abaixo FIPE</option>
              <option value="25">🔥 &ge; 25% Abaixo FIPE</option>
              <option value="30">🔥 &ge; 30% Abaixo FIPE</option>
            </select>
          </div>

          {/* Ordenação */}
          <div className="md:col-span-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="margin_desc">Ordenar: Maior Margem (%)</option>
              <option value="recent">Ordenar: Mais Recentes</option>
              <option value="price_asc">Ordenar: Menor Preço</option>
              <option value="price_desc">Ordenar: Maior Preço</option>
            </select>
          </div>
        </div>

        {/* Filtros Secundários: Particulares e Status CRM */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition select-none">
              <input
                type="checkbox"
                checked={onlyParticular}
                onChange={(e) => setOnlyParticular(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <span className="font-semibold text-xs">Apenas Vendedores Particulares</span>
            </label>

            <span className="text-slate-600">|</span>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-semibold">Status:</span>
              {(['all', 'novo', 'em_analise', 'contatado', 'descartado'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusCrm(st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition capitalize ${
                    statusCrm === st
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'Todos' : st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={carregarOportunidades}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar Feed
          </button>
        </div>
      </div>

      {/* Grid de Carros Garimpados */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Carregando oportunidades da OLX SC...</p>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="py-20 text-center text-slate-500 space-y-2 bg-slate-900/40 border border-slate-800 rounded-3xl">
          <Flame className="w-10 h-10 mx-auto text-amber-500/30" />
          <p className="text-base font-bold text-slate-300">Nenhum anúncio encontrado com esses filtros.</p>
          <p className="text-xs text-slate-500">Tente reduzir a margem mínima ou limpar a busca textual.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {opportunities.map((item) => {
            const margem = item.margem_percent || 0;
            const isSuperDeal = margem >= 20;

            return (
              <div
                key={item.id}
                className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-xl hover:border-slate-700 transition flex flex-col justify-between ${
                  isSuperDeal ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800'
                }`}
              >
                <div>
                  {/* Foto do Carro com Badges Sobrepostos */}
                  <div className="relative h-48 w-full bg-slate-950 overflow-hidden group">
                    {item.foto_url ? (
                      <img
                        src={item.foto_url}
                        alt={item.titulo}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-700 text-xs">
                        Sem Foto Disponível
                      </div>
                    )}

                    {/* Badge Margem */}
                    {item.margem_percent && item.margem_percent > 0 && (
                      <div className="absolute top-3 right-3 bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded-xl text-xs shadow-lg flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 fill-current" />
                        {item.margem_percent.toFixed(1)}% ABAIXO FIPE
                      </div>
                    )}

                    {/* Badge Queda de Preço */}
                    {item.is_queda_preco && (
                      <div className="absolute top-3 left-3 bg-emerald-500 text-slate-950 font-black px-2.5 py-1 rounded-xl text-[11px] shadow-lg flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" /> Baixou Preço
                      </div>
                    )}

                    {/* Badge Particular ou Lojista */}
                    <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md text-white font-semibold px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 border border-white/10">
                      {item.is_particular ? (
                        <>
                          <User className="w-3 h-3 text-blue-400" /> Particular
                        </>
                      ) : (
                        <>
                          <Store className="w-3 h-3 text-amber-400" /> Lojista
                        </>
                      )}
                    </div>
                  </div>

                  {/* Conteúdo do Anúncio */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-white text-sm leading-tight line-clamp-2 hover:text-amber-400 transition">
                        {item.titulo}
                      </h3>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        {item.localizacao}
                      </p>
                    </div>

                    {/* Ficha Rápida: Ano, Km, Câmbio */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-300">
                      {item.ano && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          Ano {item.ano}
                        </span>
                      )}
                      {item.km && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {item.km.toLocaleString('pt-BR')} km
                        </span>
                      )}
                      {item.cambio && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {item.cambio}
                        </span>
                      )}
                    </div>

                    {/* Comparativo de Preço: Pedido vs FIPE */}
                    <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Preço Pedido</span>
                        <p className="text-base font-black text-white">
                          {formatBRL(item.preco)}
                        </p>
                        {item.preco_anterior && (
                          <span className="text-[10px] text-slate-500 line-through">
                            De {formatBRL(item.preco_anterior)}
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Tabela FIPE</span>
                        <p className="text-sm font-semibold text-slate-300">
                          {formatBRL(item.preco_fipe)}
                        </p>
                        {item.margem_valor && item.margem_valor > 0 && (
                          <span className="text-[10px] font-bold text-amber-400">
                            Margem: {formatBRL(item.margem_valor)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rodapé de Ações Rápidas */}
                <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1">
                    {/* Botão Ver na OLX */}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                      OLX
                    </a>

                    {/* Botão Simular Proposta na Calculadora do CRM */}
                    {onNavigateToTab && (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToTab('calculator', {
                            brand: item.marca || '',
                            model: item.modelo || item.titulo,
                            year_model: String(item.ano || ''),
                            km: String(item.km || ''),
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/20 flex items-center gap-1.5 transition"
                        title="Simular na Calculadora de Compra"
                      >
                        <Calculator className="w-3.5 h-3.5 text-amber-400" />
                        Proposta
                      </button>
                    )}

                    {/* Botão Copiar Texto WhatsApp */}
                    <button
                      type="button"
                      onClick={() => handleCopiarProposta(item)}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                      title="Copiar mensagem de abordagem para WhatsApp"
                    >
                      {copiadoId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Seletor de Status CRM */}
                  <select
                    value={item.status_crm}
                    onChange={(e) => handleMudarStatus(item.id, e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="novo">⚪ Novo</option>
                    <option value="em_analise">🟡 Em Análise</option>
                    <option value="contatado">🔵 Contatado</option>
                    <option value="comprado">🟢 Comprado</option>
                    <option value="descartado">🔴 Descartar</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
