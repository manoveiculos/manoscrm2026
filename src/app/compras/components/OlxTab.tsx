'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  MapPin,
  Calendar,
  Gauge,
  Flame,
  ExternalLink,
  RefreshCw,
  TrendingDown,
  User,
  Store,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Filter,
  FileText,
  Sliders,
  Bell,
  Settings,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Phone,
  ShieldCheck,
  X,
  Send,
  Info,
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

export interface SavedSearch {
  id: number;
  client_name: string;
  client_phone: string;
  title: string | null;
  keywords: string | null;
  min_year: number | null;
  max_year: number | null;
  max_mileage: number | null;
  min_price: number | null;
  max_price: number | null;
  min_margin: number | null;
  only_particular: number | boolean;
  is_active: number | boolean;
  created_at: string;
}

export interface BotConfig {
  CLIENT_NAME: string;
  CLIENT_PHONE: string;
  CLIENT_VERIFIED: boolean;
  MIN_MARGIN_PERCENT: number;
  MAX_MARGIN_PERCENT: number;
  MIN_PRICE: number;
  MAX_PRICE: number;
  ONLY_PARTICULAR: boolean;
  IGNORE_AUCTION: boolean;
  EXCLUDE_KEYWORDS: string;
  REGIONS: string;
  CHECK_INTERVAL_SECONDS: number;
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

function formatDataPublicacao(raw: string | null | undefined, createdAt?: string): string {
  if (raw && raw.trim()) {
    let clean = raw.trim();
    // Limpa encoding e caracteres de substituição comuns
    clean = clean.replace(/s/g, 'às').replace(/\s+s\s+/g, ' às ');
    if (!clean.includes('às') && !clean.includes('/')) {
      // Se não contiver formatação de data reconhecível, tenta usar created_at
      if (createdAt) {
        try {
          const dt = new Date(createdAt);
          return `${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        } catch {
          return clean;
        }
      }
    }
    return clean;
  }
  if (createdAt) {
    try {
      const dt = new Date(createdAt);
      return `${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return 'Data recente';
    }
  }
  return 'Data recente';
}

export function OlxTab({ onNavigateToTab, userEmail, role }: OlxTabProps) {
  // Sub-abas internas
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'searches' | 'config'>('feed');

  // Estados do Feed
  const [opportunities, setOpportunities] = useState<OlxOpportunity[]>([]);
  const [totalOpportunities, setTotalOpportunities] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalGeral: 0,
    totalOportunidades15: 0,
    totalAbaixoFipe: 0,
    totalParticulares: 0,
    totalQuedasPreco: 0,
  });

  // Paginação e Carregamento Contínuo (12 por vez)
  const pageSize = 12;
  const [carregandoMais, setCarregandoMais] = useState(false);

  // Filtros (Busca limpa por padrão com os mais recentes)
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState('ALL');
  const [minMargin, setMinMargin] = useState<string>('0');
  const [onlyBelowFipe, setOnlyBelowFipe] = useState(false);
  const [onlyParticular, setOnlyParticular] = useState(false);
  const [statusCrm, setStatusCrm] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  // Estado de Conexão do Robô
  const [botStatus, setBotStatus] = useState<{ online: boolean }>({ online: false });
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Modal de Nota (Substituindo Proposta)
  const [modalNotaItem, setModalNotaItem] = useState<OlxOpportunity | null>(null);
  const [notaTexto, setNotaTexto] = useState('');
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [notaSucesso, setNotaSucesso] = useState(false);

  // Modal de Detalhes do Anúncio
  const [detalhesItem, setDetalhesItem] = useState<OlxOpportunity | null>(null);

  // Estados de Buscas Personalizadas (WhatsApp)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loadingSearches, setLoadingSearches] = useState(false);
  const [modalNovaBusca, setModalNovaBusca] = useState(false);
  const [salvandoBusca, setSalvandoBusca] = useState(false);
  const [novaBuscaForm, setNovaBuscaForm] = useState({
    title: '',
    keywords: '',
    min_year: '',
    max_year: '',
    max_mileage: '',
    min_price: '',
    max_price: '',
    min_margin: '',
    only_particular: false,
  });

  // Estados de Configurações Globais
  const [configData, setConfigData] = useState<BotConfig>({
    CLIENT_NAME: 'Alexandre',
    CLIENT_PHONE: '5547988467855',
    CLIENT_VERIFIED: true,
    MIN_MARGIN_PERCENT: 5.0,
    MAX_MARGIN_PERCENT: 45.0,
    MIN_PRICE: 10000,
    MAX_PRICE: 250000,
    ONLY_PARTICULAR: true,
    IGNORE_AUCTION: true,
    EXCLUDE_KEYWORDS: 'leilao, sinistro, recuperado, sucata, batido, bloqueio, alienado',
    REGIONS: 'estado-sc',
    CHECK_INTERVAL_SECONDS: 60,
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [configSalvaComSucesso, setConfigSalvaComSucesso] = useState(false);

  // Carregar oportunidades (12 por vez, com opção de carregar mais)
  async function carregarOportunidades(isReset = true) {
    try {
      if (isReset) {
        setLoading(true);
      } else {
        setCarregandoMais(true);
      }

      const offset = isReset ? 0 : opportunities.length;
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedCity !== 'ALL') params.set('city', selectedCity);
      if (onlyBelowFipe) {
        params.set('only_below_fipe', 'true');
      } else if (minMargin && minMargin !== '0') {
        params.set('min_margin', minMargin);
      }
      if (onlyParticular) params.set('only_particular', 'true');
      if (statusCrm !== 'all') params.set('status_crm', statusCrm);
      params.set('sort_by', sortBy);
      params.set('limit', String(pageSize));
      params.set('offset', String(offset));

      const res = await fetch(`/api/compras/olx?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const novos = data.opportunities || [];
        if (isReset) {
          setOpportunities(novos);
        } else {
          setOpportunities((prev) => [...prev, ...novos]);
        }
        setTotalOpportunities(data.total || 0);
        setCities(data.cities || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Erro ao buscar dados da OLX:', err);
    } finally {
      setLoading(false);
      setCarregandoMais(false);
    }
  }

  function carregarMais() {
    if (carregandoMais || opportunities.length >= totalOpportunities) return;
    carregarOportunidades(false);
  }

  // Checar status do robô Python local
  async function checarBot() {
    try {
      const res = await fetch('/api/compras/olx/bot');
      const data = await res.json();
      setBotStatus({
        online: Boolean(data.online),
      });
    } catch {
      setBotStatus({ online: false });
    }
  }

  // Carregar Buscas Salvas exclusivas do usuário logado
  async function carregarBuscas() {
    try {
      setLoadingSearches(true);
      const url = userEmail
        ? `/api/compras/olx/buscas?user_email=${encodeURIComponent(userEmail)}`
        : '/api/compras/olx/buscas';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSavedSearches(data.searches || []);
        if (data.active_client) {
          setConfigData((prev) => ({
            ...prev,
            CLIENT_NAME: data.active_client.name || prev.CLIENT_NAME,
            CLIENT_PHONE: data.active_client.phone || prev.CLIENT_PHONE,
          }));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar buscas salvas:', err);
    } finally {
      setLoadingSearches(false);
    }
  }

  // Carregar Configurações exclusivas do usuário logado
  async function carregarConfig() {
    try {
      setLoadingConfig(true);
      const url = userEmail
        ? `/api/compras/olx/config?user_email=${encodeURIComponent(userEmail)}`
        : '/api/compras/olx/config';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.config) {
        setConfigData(data.config);
      }
    } catch (err) {
      console.error('Erro ao carregar config:', err);
    } finally {
      setLoadingConfig(false);
    }
  }

  useEffect(() => {
    carregarOportunidades(true);
    checarBot();
  }, [selectedCity, minMargin, onlyBelowFipe, onlyParticular, statusCrm, sortBy]);

  useEffect(() => {
    if (activeSubTab === 'searches') {
      carregarBuscas();
    } else if (activeSubTab === 'config') {
      carregarConfig();
    }
  }, [activeSubTab, userEmail]);

  useEffect(() => {
    if (userEmail) {
      carregarConfig();
      carregarBuscas();
    }
  }, [userEmail]);

  // Atualizar Status do CRM
  async function handleMudarStatus(id: string, novoStatus: string) {
    try {
      const res = await fetch('/api/compras/olx', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status_crm: novoStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setOpportunities((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status_crm: novoStatus as any } : item))
        );
      }
    } catch (err) {
      console.error('Erro ao atualizar status CRM:', err);
    }
  }

  // Abrir Modal de Nota
  function abrirModalNota(item: OlxOpportunity) {
    setModalNotaItem(item);
    setNotaTexto(item.observacoes || '');
    setNotaSucesso(false);
  }

  // Salvar Nota do Veículo
  async function handleSalvarNota() {
    if (!modalNotaItem) return;
    setSalvandoNota(true);
    try {
      const res = await fetch('/api/compras/olx', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modalNotaItem.id,
          observacoes: notaTexto.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOpportunities((prev) =>
          prev.map((item) =>
            item.id === modalNotaItem.id
              ? { ...item, observacoes: notaTexto.trim() || null }
              : item
          )
        );
        setNotaSucesso(true);
        setTimeout(() => {
          setModalNotaItem(null);
          setNotaSucesso(false);
        }, 800);
      }
    } catch (err) {
      console.error('Erro ao salvar nota:', err);
      alert('Falha ao salvar a nota. Tente novamente.');
    } finally {
      setSalvandoNota(false);
    }
  }

  // Copiar resumo formatado para WhatsApp
  function copiarParaWhatsApp(item: OlxOpportunity) {
    const texto = `🚗 *${item.titulo}*
💰 *Preço Pedido:* ${formatBRL(item.preco)}
📊 *Tabela FIPE:* ${formatBRL(item.preco_fipe)}
🔥 *Margem:* ${item.margem_percent?.toFixed(1)}% OFF (Economia de ${formatBRL(item.margem_valor)})
📍 *Local:* ${item.localizacao}
📅 *Ano:* ${item.ano || 'N/I'} | *Km:* ${item.km ? item.km.toLocaleString('pt-BR') : 'N/I'} | *Câmbio:* ${item.cambio || 'N/I'}
🕒 *Publicado:* ${formatDataPublicacao(item.publicado_em, item.created_at)}
🔗 *Link:* ${item.url}`;

    navigator.clipboard.writeText(texto);
    setCopiadoId(item.id);
    setTimeout(() => setCopiadoId(null), 2500);
  }

  // Criar Nova Busca Salva
  async function handleCriarBusca(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoBusca(true);
    try {
      const res = await fetch('/api/compras/olx/buscas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail || '',
          client_name: configData.CLIENT_NAME,
          client_phone: configData.CLIENT_PHONE,
          title: novaBuscaForm.title.trim() || novaBuscaForm.keywords.trim() || 'Busca Geral',
          keywords: novaBuscaForm.keywords.trim(),
          min_year: novaBuscaForm.min_year ? parseInt(novaBuscaForm.min_year, 10) : null,
          max_year: novaBuscaForm.max_year ? parseInt(novaBuscaForm.max_year, 10) : null,
          max_mileage: novaBuscaForm.max_mileage ? parseInt(novaBuscaForm.max_mileage, 10) : null,
          min_price: novaBuscaForm.min_price ? parseFloat(novaBuscaForm.min_price) : null,
          max_price: novaBuscaForm.max_price ? parseFloat(novaBuscaForm.max_price) : null,
          min_margin: novaBuscaForm.min_margin ? parseFloat(novaBuscaForm.min_margin) : 0,
          only_particular: novaBuscaForm.only_particular,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setModalNovaBusca(false);
        setNovaBuscaForm({
          title: '',
          keywords: '',
          min_year: '',
          max_year: '',
          max_mileage: '',
          min_price: '',
          max_price: '',
          min_margin: '',
          only_particular: false,
        });
        carregarBuscas();
      } else {
        alert(data.message || 'Erro ao criar busca.');
      }
    } catch (err) {
      console.error('Erro ao salvar busca:', err);
    } finally {
      setSalvandoBusca(false);
    }
  }

  // Excluir Busca Salva
  async function handleExcluirBusca(id: number) {
    if (!confirm('Deseja realmente remover este monitoramento de busca?')) return;
    try {
      await fetch(`/api/compras/olx/buscas?id=${id}`, { method: 'DELETE' });
      setSavedSearches((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Erro ao excluir busca:', err);
    }
  }

  // Alternar Ativo/Inativo Busca Salva
  async function handleToggleBusca(id: number) {
    try {
      await fetch(`/api/compras/olx/buscas?id=${id}`, { method: 'PATCH' });
      setSavedSearches((prev) =>
        prev.map((b) => (b.id === id ? { ...b, is_active: !b.is_active } : b))
      );
    } catch (err) {
      console.error('Erro ao alternar busca:', err);
    }
  }

  // Salvar Configurações
  async function handleSalvarConfig(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoConfig(true);
    setConfigSalvaComSucesso(false);
    try {
      const res = await fetch('/api/compras/olx/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...configData,
          user_email: userEmail || '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfigSalvaComSucesso(true);
        setTimeout(() => setConfigSalvaComSucesso(false), 3500);
      } else {
        alert(data.message || 'Erro ao salvar configurações.');
      }
    } catch (err) {
      console.error('Erro ao gravar configurações:', err);
      alert('Falha na comunicação ao salvar configurações.');
    } finally {
      setSalvandoConfig(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Evita bloqueio da CDN da OLX por Referer */}
      <meta name="referrer" content="no-referrer" />

      {/* Cabeçalho Principal com Sub-Abas do Sistema Completo */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                <Flame className="w-3.5 h-3.5 fill-current" />
                Garimpo OLX SC
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white">
              Monitor de Oportunidades & Buscas Inteligentes
            </h1>
            <p className="text-xs text-slate-400">
              Varredura contínua de Santa Catarina com cálculo automático de margem FIPE e alertas em tempo real.
            </p>
          </div>

          {/* Estado do Robô: Apenas Online ou Offline */}
          <div className="flex items-center">
            {botStatus.online ? (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold shadow-lg shadow-emerald-500/5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span>Robô Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-bold">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                <span>Robô Offline</span>
              </div>
            )}
          </div>
        </div>

        {/* Barra de Sub-Navegação (Oportunidades, Buscas Personalizadas, Configurações) */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-4">
          <button
            type="button"
            onClick={() => setActiveSubTab('feed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeSubTab === 'feed'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Oportunidades & Anúncios
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                activeSubTab === 'feed' ? 'bg-slate-950 text-amber-400' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {totalOpportunities}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('searches')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeSubTab === 'searches'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Buscas Personalizadas (WhatsApp)
            {savedSearches.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                  activeSubTab === 'searches' ? 'bg-slate-950 text-emerald-400' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {savedSearches.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('config')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeSubTab === 'config'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Configurações & Cliente
          </button>
        </div>
      </div>

      {/* SUB-ABA 1: FEED DE OPORTUNIDADES & ANÚNCIOS */}
      {activeSubTab === 'feed' && (
        <div className="space-y-6">
          {/* Métricas Rápidas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div
              onClick={() => { setMinMargin('0'); setOnlyBelowFipe(false); setStatusCrm('all'); setOnlyParticular(false); }}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 cursor-pointer transition select-none group"
            >
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total em SC</span>
              <p className="text-2xl font-black text-white mt-1 group-hover:text-amber-400 transition">
                {stats.totalGeral}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Anúncios no banco</span>
            </div>

            <div
              onClick={() => {
                setOnlyBelowFipe((prev) => !prev);
                setMinMargin('0');
              }}
              className={`bg-slate-900 border rounded-2xl p-4 cursor-pointer transition select-none group ${
                onlyBelowFipe
                  ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-500/10'
                  : 'border-emerald-500/30 hover:border-emerald-500'
              }`}
            >
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Abaixo da Tabela FIPE
              </span>
              <p className="text-2xl font-black text-emerald-400 mt-1">
                {stats.totalAbaixoFipe || stats.totalOportunidades15}
              </p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {onlyBelowFipe ? 'Filtro ativo (clique p/ remover)' : 'Todos os veículos abaixo da FIPE'}
              </span>
            </div>

            <div
              onClick={() => setOnlyParticular((prev) => !prev)}
              className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-4 cursor-pointer transition select-none group"
            >
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3" /> Particulares
              </span>
              <p className="text-2xl font-black text-white mt-1 group-hover:text-blue-400 transition">
                {stats.totalParticulares}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Direto do proprietário</span>
            </div>

            <div
              onClick={() => setSortBy('recent')}
              className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 cursor-pointer transition select-none group"
            >
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Quedas de Preço
              </span>
              <p className="text-2xl font-black text-emerald-400 mt-1">{stats.totalQuedasPreco}</p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Vendedor baixou valor</span>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Busca Textual */}
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') carregarOportunidades(true);
                  }}
                  placeholder="Buscar modelo, versão ou placa (ex: Civic, Onix, C4)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Filtro de Cidade */}
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

              {/* Filtro de Margem */}
              <div className="md:col-span-2">
                <select
                  value={onlyBelowFipe ? 'below_fipe' : minMargin}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'below_fipe') {
                      setOnlyBelowFipe(true);
                      setMinMargin('0');
                    } else {
                      setOnlyBelowFipe(false);
                      setMinMargin(val);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="0">Margem: Todas</option>
                  <option value="below_fipe">📉 Todos Abaixo da FIPE</option>
                  <option value="10">Margem: &ge; 10% OFF</option>
                  <option value="15">Margem: &ge; 15% OFF</option>
                  <option value="20">Margem: &ge; 20% OFF</option>
                  <option value="25">Margem: &ge; 25% OFF</option>
                  <option value="30">Margem: &ge; 30% OFF</option>
                </select>
              </div>

              {/* Ordenação */}
              <div className="md:col-span-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-amber-500"
                >
                  <option value="recent">Ordenar: Mais Recentes</option>
                  <option value="margin_desc">Ordenar: Maior Margem (%)</option>
                  <option value="price_asc">Ordenar: Menor Preço (R$)</option>
                  <option value="price_desc">Ordenar: Maior Preço (R$)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={onlyParticular}
                    onChange={(e) => setOnlyParticular(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                  />
                  <span>Apenas Vendedores Particulares</span>
                </label>

                <div className="h-4 w-px bg-slate-800" />

                {/* Filtro de Status do CRM */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 mr-1 font-medium">Status:</span>
                  {(['all', 'novo', 'em_analise', 'contatado', 'descartado'] as const).map(
                    (st) => {
                      const isSelected = statusCrm === st;
                      const label =
                        st === 'all'
                          ? 'Todos'
                          : st === 'novo'
                          ? 'Novo'
                          : st === 'em_analise'
                          ? 'Em Analise'
                          : st === 'contatado'
                          ? 'Contatado'
                          : 'Descartado';

                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStatusCrm(st)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            isSelected
                              ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => carregarOportunidades(true)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar Feed
              </button>
            </div>
          </div>

          {/* Informação de Quantidade e Total */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Exibindo <strong>{opportunities.length}</strong> de <strong>{totalOpportunities}</strong> veículos mais recentes
            </span>
            <span className="text-slate-500 text-[11px]">
              Carregamento contínuo (12 por vez)
            </span>
          </div>

          {/* Grid de Carros Garimpados (10 por página) */}
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
                const dataPublicacaoFormatada = formatDataPublicacao(item.publicado_em, item.created_at);

                return (
                  <div
                    key={item.id}
                    className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-xl hover:border-slate-700 transition flex flex-col justify-between ${
                      isSuperDeal ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800'
                    }`}
                  >
                    <div>
                      {/* Foto do Carro com Badges Sobrepostos */}
                      <div
                        onClick={() => setDetalhesItem(item)}
                        className="relative h-48 w-full bg-slate-950 overflow-hidden group cursor-pointer"
                      >
                        {item.foto_url ? (
                          <img
                            src={item.foto_url}
                            alt={item.titulo}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                              const parent = (e.currentTarget as HTMLElement).parentElement;
                              if (parent && !parent.querySelector('.fallback-sem-foto')) {
                                const placeholder = document.createElement('div');
                                placeholder.className = 'w-full h-full flex items-center justify-center text-slate-700 text-xs fallback-sem-foto';
                                placeholder.innerText = 'Sem Foto Disponível';
                                parent.appendChild(placeholder);
                              }
                            }}
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
                        <div className="absolute bottom-3 left-3">
                          {item.is_particular ? (
                            <span className="px-2 py-0.5 rounded-lg bg-blue-500/90 text-white font-bold text-[10px] flex items-center gap-1 shadow">
                              <User className="w-3 h-3" /> Particular
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-800/90 text-slate-300 font-bold text-[10px] flex items-center gap-1 shadow border border-slate-700">
                              <Store className="w-3 h-3" /> Lojista
                            </span>
                          )}
                        </div>

                        {/* Overlay Ver Fotos */}
                        <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] text-white opacity-0 group-hover:opacity-100 transition">
                          Clique p/ detalhes
                        </div>
                      </div>

                      {/* Corpo do Card */}
                      <div className="p-4 space-y-3">
                        {/* DATA E HORA DE PUBLICAÇÃO DO ANÚNCIO (Destaque Exigido) */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
                          <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>{dataPublicacaoFormatada}</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                            Postado na OLX
                          </span>
                        </div>

                        {/* Título & Cidade */}
                        <div>
                          <h3
                            onClick={() => setDetalhesItem(item)}
                            className="text-sm font-bold text-white line-clamp-2 hover:text-amber-400 transition cursor-pointer"
                            title={item.titulo}
                          >
                            {item.titulo}
                          </h3>
                          <div className="flex items-center gap-1 text-slate-400 text-xs mt-1">
                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">{item.localizacao || 'Santa Catarina'}</span>
                          </div>
                        </div>

                        {/* Tags de Especificações */}
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          {item.ano && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {item.ano}
                            </span>
                          )}
                          {item.km !== null && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1">
                              <Gauge className="w-3 h-3 text-slate-500" />
                              {item.km.toLocaleString('pt-BR')} km
                            </span>
                          )}
                          {item.cambio && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800">
                              {item.cambio}
                            </span>
                          )}
                        </div>

                        {/* Comparativo de Preço: Pedido vs FIPE */}
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Preço Pedido</span>
                            <p className="text-base font-black text-white">{formatBRL(item.preco)}</p>
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

                        {/* EXIBIÇÃO DA NOTA SALVA (se houver) */}
                        {item.observacoes && item.observacoes.trim() && (
                          <div
                            onClick={() => abrirModalNota(item)}
                            className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2 cursor-pointer hover:bg-amber-500/15 transition"
                            title="Clique para editar a nota"
                          >
                            <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-[10px] text-amber-400 uppercase tracking-wider block">
                                Nota Salva:
                              </span>
                              <p className="line-clamp-2 text-xs italic">{item.observacoes}</p>
                            </div>
                          </div>
                        )}
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

                        {/* BOTÃO NOTA (SUBSTITUIU PROPOSTA CONFORME PEDIDO) */}
                        <button
                          type="button"
                          onClick={() => abrirModalNota(item)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${
                            item.observacoes && item.observacoes.trim()
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 font-bold'
                              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                          title="Adicionar ou editar anotação sobre o veículo para lembrar no futuro"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                          <span>Nota</span>
                          {item.observacoes && item.observacoes.trim() && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          )}
                        </button>

                        {/* Botão Copiar Texto WhatsApp */}
                        <button
                          type="button"
                          onClick={() => copiarParaWhatsApp(item)}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Copiar texto para WhatsApp"
                        >
                          {copiadoId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Dropdown de Status no CRM */}
                      <select
                        value={item.status_crm}
                        onChange={(e) => handleMudarStatus(item.id, e.target.value)}
                        className={`text-xs font-semibold rounded-xl px-2.5 py-1.5 border focus:outline-none transition ${
                          item.status_crm === 'novo'
                            ? 'bg-slate-800 text-slate-200 border-slate-700'
                            : item.status_crm === 'em_analise'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : item.status_crm === 'contatado'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            : item.status_crm === 'comprado'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        <option value="novo">⚪ Novo</option>
                        <option value="em_analise">🟡 Em Análise</option>
                        <option value="contatado">🔵 Contatado</option>
                        <option value="comprado">🟢 Comprado</option>
                        <option value="descartado">🔴 Descartado</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* BOTÃO CARREGAR MAIS ANÚNCIOS (+12) */}
          {!loading && opportunities.length > 0 && (
            <div className="flex flex-col items-center justify-center gap-3 pt-6 pb-2 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                Mostrando <strong className="text-white">{opportunities.length}</strong> de{' '}
                <strong className="text-white">{totalOpportunities}</strong> anúncios catalogados
              </div>

              {opportunities.length < totalOpportunities ? (
                <button
                  type="button"
                  onClick={carregarMais}
                  disabled={carregandoMais}
                  className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-500/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {carregandoMais ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Carregando mais 12 veículos...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Carregar Mais Anúncios (+12)</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="text-xs text-slate-500 font-medium bg-slate-900/60 px-4 py-2 rounded-xl border border-slate-800">
                  ✓ Todos os {totalOpportunities} anúncios foram carregados
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB-ABA 2: BUSCAS PERSONALIZADAS COM ALERTAS WHATSAPP */}
      {activeSubTab === 'searches' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-400" />
                  Monitoramento & Buscas Personalizadas para Clientes
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cadastre critérios específicos de clientes para o robô disparar notificações automáticas no WhatsApp
                  assim que um carro com esses requisitos for anunciado na OLX.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalNovaBusca(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
              >
                <Plus className="w-4 h-4" />
                Criar Nova Busca para Cliente
              </button>
            </div>

            {/* Banner de Identificação do Destinatário Ativo */}
            <div className="p-3.5 bg-slate-950 border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-sm font-bold">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">
                    Destinatário configurado para alertas:
                  </span>
                  <span className="text-white font-bold text-sm">
                    {configData.CLIENT_NAME} ({configData.CLIENT_PHONE})
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveSubTab('config')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold underline text-left"
              >
                Alterar dados de contato na aba Configurações &rarr;
              </button>
            </div>
          </div>

          {/* Lista de Buscas Salvas */}
          {loadingSearches ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs">Carregando buscas salvas...</p>
            </div>
          ) : savedSearches.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-3 bg-slate-900/40 border border-slate-800 rounded-3xl p-6">
              <Bell className="w-10 h-10 mx-auto text-emerald-500/30" />
              <h3 className="text-sm font-bold text-slate-200">Nenhuma busca personalizada ativa</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Crie buscas com modelos, faixas de valor e margem para que os alertas cheguem automaticamente no WhatsApp.
              </p>
              <button
                type="button"
                onClick={() => setModalNovaBusca(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
              >
                Cadastrar Primeira Busca
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedSearches.map((busca) => {
                const isActive = Boolean(busca.is_active);
                return (
                  <div
                    key={busca.id}
                    className={`bg-slate-900 border rounded-2xl p-4 shadow-xl flex flex-col justify-between space-y-3 transition ${
                      isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                            {busca.client_name}
                          </span>
                          <h4 className="text-sm font-black text-white">{busca.title || 'Sem título'}</h4>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isActive ? 'Ativo' : 'Pausado'}
                        </span>
                      </div>

                      {busca.keywords && (
                        <div className="mt-2 text-xs text-slate-300 bg-slate-950 p-2 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Palavras-chave:</span>
                          <span className="font-semibold text-emerald-300">{busca.keywords}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-slate-400">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Preço:</span>
                          <span className="font-bold text-slate-200">
                            {busca.min_price || busca.max_price
                              ? `${formatBRL(busca.min_price)} a ${formatBRL(busca.max_price)}`
                              : 'Qualquer valor'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Ano:</span>
                          <span className="font-bold text-slate-200">
                            {busca.min_year || busca.max_year
                              ? `${busca.min_year || '...'} até ${busca.max_year || '...'}`
                              : 'Qualquer ano'}
                          </span>
                        </div>
                        {busca.max_mileage && (
                          <div>
                            <span className="text-slate-500 block text-[10px]">Km Máximo:</span>
                            <span className="font-bold text-slate-200">
                              {busca.max_mileage.toLocaleString('pt-BR')} km
                            </span>
                          </div>
                        )}
                        {busca.min_margin !== null && busca.min_margin !== undefined && busca.min_margin > 0 && (
                          <div>
                            <span className="text-slate-500 block text-[10px]">Margem Mínima:</span>
                            <span className="font-bold text-amber-400">&ge; {busca.min_margin}% OFF</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => handleToggleBusca(busca.id)}
                        className="text-slate-400 hover:text-white flex items-center gap-1.5 transition"
                      >
                        {isActive ? (
                          <>
                            <ToggleRight className="w-5 h-5 text-emerald-400" />
                            <span>Monitorando</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-5 h-5 text-slate-600" />
                            <span>Pausado</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExcluirBusca(busca.id)}
                        className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                        title="Excluir busca"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-ABA 3: CONFIGURAÇÕES & CLIENTE */}
      {activeSubTab === 'config' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-purple-400" />
              Configurações do Monitor e Cliente WhatsApp
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Defina o destinatário dos alertas, as margens de tolerância de oportunidade FIPE e regras anti-golpe.
            </p>
          </div>

          <form onSubmit={handleSalvarConfig} className="space-y-6">
            {/* Bloco 1: Destinatário */}
            <div className="border-t border-slate-800 pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <Phone className="w-4 h-4" /> 1. Destinatário dos Alertas no WhatsApp
                </h3>
                {configData.CLIENT_VERIFIED && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> WhatsApp Verificado
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Cliente / Responsável</label>
                  <input
                    type="text"
                    required
                    value={configData.CLIENT_NAME}
                    onChange={(e) => setConfigData({ ...configData, CLIENT_NAME: e.target.value })}
                    placeholder="Ex: Alexandre"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Usado para saudar nas notificações.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">WhatsApp com DDD (somente números)</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-700 bg-slate-800 text-slate-300 font-bold text-xs">
                      🇧🇷 +55
                    </span>
                    <input
                      type="text"
                      required
                      value={configData.CLIENT_PHONE}
                      onChange={(e) => setConfigData({ ...configData, CLIENT_PHONE: e.target.value })}
                      placeholder="Ex: 5547988467855"
                      className="w-full bg-slate-950 border border-slate-700 rounded-r-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">DDI 55 + DDD + Celular (9 dígitos).</p>
                </div>
              </div>
            </div>

            {/* Bloco 2: Regras Globais de Margem e FIPE */}
            <div className="border-t border-slate-800 pt-5 space-y-4">
              <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Flame className="w-4 h-4 fill-current" /> 2. Regras Globais de Margem e FIPE
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Margem Mínima para Alerta (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      required
                      value={configData.MIN_MARGIN_PERCENT}
                      onChange={(e) =>
                        setConfigData({ ...configData, MIN_MARGIN_PERCENT: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2 text-[11px] text-slate-500">% abaixo FIPE</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Desconto mínimo em relação à FIPE para notificar.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Margem Máxima / Suspeita de Golpe (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      required
                      value={configData.MAX_MARGIN_PERCENT}
                      onChange={(e) =>
                        setConfigData({ ...configData, MAX_MARGIN_PERCENT: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2 text-[11px] text-slate-500">% abaixo FIPE</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Acima de 45% costuma ser golpe de entrada ou leilão maquiado.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Preço Mínimo Global (R$)</label>
                  <input
                    type="number"
                    required
                    value={configData.MIN_PRICE}
                    onChange={(e) => setConfigData({ ...configData, MIN_PRICE: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Descarta anúncios com valor simbólico ou apenas entrada.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Preço Máximo Global (R$)</label>
                  <input
                    type="number"
                    required
                    value={configData.MAX_PRICE}
                    onChange={(e) => setConfigData({ ...configData, MAX_PRICE: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Bloco 3: Filtros de Vendedor e Anti-Golpe */}
            <div className="border-t border-slate-800 pt-5 space-y-4">
              <h3 className="text-xs font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> 3. Filtros de Vendedor e Anti-Golpe
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                  <div>
                    <div className="text-xs font-bold text-white">Apenas Particulares</div>
                    <div className="text-[10px] text-slate-400">Ignorar revendas e lojistas</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configData.ONLY_PARTICULAR}
                      onChange={(e) => setConfigData({ ...configData, ONLY_PARTICULAR: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                  <div>
                    <div className="text-xs font-bold text-white">Descartar Leilão Confirmado</div>
                    <div className="text-[10px] text-slate-400">Ignora se a OLX reportar leilão</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configData.IGNORE_AUCTION}
                      onChange={(e) => setConfigData({ ...configData, IGNORE_AUCTION: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Palavras-chave de Exclusão (separadas por vírgula)
                </label>
                <textarea
                  rows={2}
                  value={configData.EXCLUDE_KEYWORDS}
                  onChange={(e) => setConfigData({ ...configData, EXCLUDE_KEYWORDS: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Anúncios que contenham esses termos no título ou na descrição são descartados na hora.
                </p>
              </div>
            </div>

            {/* Bloco 4: Região e Agendamento */}
            <div className="border-t border-slate-800 pt-5 space-y-4">
              <h3 className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" /> 4. Localização e Frequência
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Regiões da OLX</label>
                  <input
                    type="text"
                    required
                    value={configData.REGIONS}
                    onChange={(e) => setConfigData({ ...configData, REGIONS: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Ex: <code>estado-sc</code> (Santa Catarina inteira).</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Intervalo entre Varreduras (s)</label>
                  <input
                    type="number"
                    min="15"
                    required
                    value={configData.CHECK_INTERVAL_SECONDS}
                    onChange={(e) =>
                      setConfigData({ ...configData, CHECK_INTERVAL_SECONDS: parseInt(e.target.value, 10) || 60 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Padrão recomendado: 60 segundos.</p>
                </div>
              </div>
            </div>

            {/* Botão Salvar Configurações */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              {configSalvaComSucesso && (
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-4 h-4" /> Configurações gravadas com sucesso!
                </span>
              )}

              <button
                type="submit"
                disabled={salvandoConfig}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black shadow-lg shadow-purple-600/20 transition flex items-center gap-2 disabled:opacity-50"
              >
                {salvandoConfig ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Salvar Configurações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOTA DO VEÍCULO (SUBSTITUINDO PROPOSTA) */}
      {modalNotaItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <FileText className="w-4 h-4" />
                <span>Anotação do Veículo (Lembrete Futuro)</span>
              </div>
              <button
                type="button"
                onClick={() => setModalNotaItem(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1">
              <h4 className="text-xs font-bold text-white line-clamp-1">{modalNotaItem.titulo}</h4>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Pedido: <strong className="text-white">{formatBRL(modalNotaItem.preco)}</strong></span>
                <span>FIPE: <strong className="text-slate-300">{formatBRL(modalNotaItem.preco_fipe)}</strong></span>
                <span className="text-amber-400 font-bold">{modalNotaItem.margem_percent?.toFixed(1)}% OFF</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Descreva suas observações para consulta posterior:
              </label>
              <textarea
                rows={5}
                value={notaTexto}
                onChange={(e) => setNotaTexto(e.target.value)}
                placeholder="Ex: Conversei com o proprietário no WhatsApp, faz R$ 38.000 à vista no dinheiro. Pneus dianteiros novos. Buscar quarta-feira pela manhã para vistoria..."
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed"
                autoFocus
              />
              <p className="text-[10px] text-slate-400">
                Esta nota fica gravada permanentemente no histórico do carro no CRM para consulta do Alexandre e do Ledra.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalNotaItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSalvarNota}
                disabled={salvandoNota}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition disabled:opacity-50"
              >
                {salvandoNota ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : notaSucesso ? (
                  <Check className="w-3.5 h-3.5 text-emerald-950" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                {notaSucesso ? 'Nota Gravada!' : 'Salvar Nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHES COMPLETOS DO ANÚNCIO (FOTOS & SPECS) */}
      {detalhesItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2 truncate">
                <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-amber-500 text-slate-950">
                  {detalhesItem.margem_percent?.toFixed(1)}% OFF
                </span>
                <span className="text-xs font-bold text-white truncate">{detalhesItem.titulo}</span>
              </div>
              <button
                type="button"
                onClick={() => setDetalhesItem(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Foto Principal */}
              {detalhesItem.foto_url && (
                <div className="relative h-64 w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
                  <img
                    src={detalhesItem.foto_url}
                    alt={detalhesItem.titulo}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Data e Hora de Publicação */}
              <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <strong>Publicado:</strong> {formatDataPublicacao(detalhesItem.publicado_em, detalhesItem.created_at)}
                </span>
                <span className="text-slate-400">{detalhesItem.localizacao}</span>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Ano</span>
                  <span className="font-bold text-white">{detalhesItem.ano || 'N/I'}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Quilometragem</span>
                  <span className="font-bold text-white">
                    {detalhesItem.km ? `${detalhesItem.km.toLocaleString('pt-BR')} km` : 'N/I'}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Câmbio</span>
                  <span className="font-bold text-white">{detalhesItem.cambio || 'N/I'}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Combustível</span>
                  <span className="font-bold text-white">{detalhesItem.combustivel || 'N/I'}</span>
                </div>
              </div>

              {/* Preços */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Preço Pedido</span>
                  <p className="text-lg font-black text-white">{formatBRL(detalhesItem.preco)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Tabela FIPE</span>
                  <p className="text-base font-bold text-slate-300">{formatBRL(detalhesItem.preco_fipe)}</p>
                  {detalhesItem.margem_valor && (
                    <span className="text-xs font-bold text-amber-400">
                      Economia: {formatBRL(detalhesItem.margem_valor)}
                    </span>
                  )}
                </div>
              </div>

              {/* Nota Existente */}
              {detalhesItem.observacoes && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl text-xs text-amber-200">
                  <span className="font-bold text-amber-400 text-[10px] uppercase block mb-1">
                    Nota Registrada:
                  </span>
                  <p className="italic">{detalhesItem.observacoes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <a
                href={detalhesItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-2 transition"
              >
                <span>Abrir Anúncio na OLX</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const it = detalhesItem;
                    setDetalhesItem(null);
                    abrirModalNota(it);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Editar Nota
                </button>

                <button
                  type="button"
                  onClick={() => setDetalhesItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR NOVA BUSCA PARA CLIENTE */}
      {modalNovaBusca && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-auto animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Bell className="w-4 h-4" />
                <span>Nova Busca Personalizada para Cliente</span>
              </div>
              <button
                type="button"
                onClick={() => setModalNovaBusca(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCriarBusca} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Título ou Rótulo da Busca</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Corolla ou Civic até R$ 90k"
                  value={novaBuscaForm.title}
                  onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Modelos ou Palavras-chave (separadas por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Civic, Corolla, Hilux, Gol (ou vazio para todos)"
                  value={novaBuscaForm.keywords}
                  onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, keywords: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Preço Mínimo (R$)</label>
                  <input
                    type="number"
                    placeholder="Ex: 25000"
                    value={novaBuscaForm.min_price}
                    onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, min_price: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Preço Máximo (R$)</label>
                  <input
                    type="number"
                    placeholder="Ex: 95000"
                    value={novaBuscaForm.max_price}
                    onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, max_price: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Ano Mínimo</label>
                  <input
                    type="number"
                    placeholder="Ex: 2016"
                    value={novaBuscaForm.min_year}
                    onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, min_year: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Ano Máximo</label>
                  <input
                    type="number"
                    placeholder="Ex: 2024"
                    value={novaBuscaForm.max_year}
                    onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, max_year: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Km Máximo</label>
                  <input
                    type="number"
                    placeholder="Ex: 80000 (opcional)"
                    value={novaBuscaForm.max_mileage}
                    onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, max_mileage: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Margem Mínima FIPE (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Ex: 15 (opcional)"
                    value={novaBuscaForm.min_margin}
                    onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, min_margin: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={novaBuscaForm.only_particular}
                  onChange={(e) => setNovaBuscaForm({ ...novaBuscaForm, only_particular: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Apenas Anúncios de Particulares</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalNovaBusca(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoBusca}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {salvandoBusca ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Ativar Monitoramento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
