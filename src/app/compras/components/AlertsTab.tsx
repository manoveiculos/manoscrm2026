'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Phone, User, Car, Bell, Trash2, 
  AlertTriangle, CheckCircle2, Activity, ToggleLeft, ToggleRight, Search, X
} from 'lucide-react';

interface AlertaCliente {
  id: string;
  nome_cliente: string;
  telefone_cliente: string;
  marca: string;
  modelo: string;
  valor_minimo: number | null;
  valor_maximo: number | null;
  ano_minimo: number | null;
  ano_maximo: number | null;
  cor: string | null;
  cambio: string | null;
  combustivel: string | null;
  km_minimo: number | null;
  km_maximo: number | null;
  ativo: boolean;
  criado_em: string;
}

const BRANDS = [
  'CHEVROLET', 'FIAT', 'FORD', 'HONDA', 'HYUNDAI', 
  'JEEP', 'RENAULT', 'TOYOTA', 'VOLKSWAGEN', 'OUTROS'
];

export default function AlertsTab() {
  const [alerts, setAlerts] = useState<AlertaCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros listagem
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('TODAS');
  const [filterStatus, setFilterStatus] = useState('TODOS');

  // Formulário
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [valorMinimo, setValorMinimo] = useState('');
  const [valorMaximo, setValorMaximo] = useState('');
  const [anoMinimo, setAnoMinimo] = useState('');
  const [anoMaximo, setAnoMaximo] = useState('');
  const [cor, setCor] = useState('');
  const [cambio, setCambio] = useState('');
  const [combustivel, setCombustivel] = useState('');
  const [kmMinimo, setKmMinimo] = useState('');
  const [kmMaximo, setKmMaximo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch('/api/compras/alertas');
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Erro ao carregar os alertas.');
        }
        setAlerts(data.alerts || []);
      } catch (err: any) {
        setError(err.message || 'Falha ao buscar alertas ativos do banco.');
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
  }, []);

  const filteredAlerts = alerts.filter(alerta => {
    const matchesSearch = 
      alerta.nome_cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alerta.modelo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBrand = filterBrand === 'TODAS' || alerta.marca.toUpperCase() === filterBrand.toUpperCase();
    const matchesStatus = filterStatus === 'TODOS' || 
      (filterStatus === 'ATIVOS' && alerta.ativo) ||
      (filterStatus === 'INATIVOS' && !alerta.ativo);
    return matchesSearch && matchesBrand && matchesStatus;
  });

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/[^\d]/g, '');
    const len = numbers.length;
    if (len < 3) return numbers;
    if (len < 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (len < 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const formatCurrencyInput = (value: string) => {
    const clean = value.replace(/[^\d]/g, '');
    if (!clean) return '';
    const num = parseFloat(clean) / 100;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !telefone || !marca || !modelo) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const parseCurrency = (val: string) => {
      const raw = val.replace(/[^\d]/g, '');
      return raw ? parseFloat(raw) / 100 : null;
    };

    try {
      const res = await fetch('/api/compras/alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_cliente: nome,
          telefone_cliente: telefone,
          marca,
          modelo,
          valor_minimo: parseCurrency(valorMinimo),
          valor_maximo: parseCurrency(valorMaximo),
          ano_minimo: anoMinimo ? Number(anoMinimo) : null,
          ano_maximo: anoMaximo ? Number(anoMaximo) : null,
          cor,
          cambio,
          combustivel,
          km_minimo: kmMinimo ? Number(kmMinimo) : null,
          km_maximo: kmMaximo ? Number(kmMaximo) : null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao criar alerta.');

      setAlerts(prev => [data.alert, ...prev]);
      setSuccessMsg('Monitoramento ativado com sucesso!');
      setNome(''); setTelefone(''); setMarca(''); setModelo('');
      setValorMinimo(''); setValorMaximo(''); setAnoMinimo(''); setAnoMaximo('');
      setCor(''); setCambio(''); setCombustivel(''); setKmMinimo(''); setKmMaximo('');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Falha ao ativar monitoramento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAlert = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/compras/alertas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ativo: !currentStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao atualizar alerta.');
      setAlerts(prev => prev.map(a => a.id === id ? data.alert : a));
    } catch (err) {
      alert('Não foi possível alternar o status do alerta.');
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!confirm('Deseja realmente excluir este alerta?')) return;
    try {
      const res = await fetch(`/api/compras/alertas?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao remover alerta.');
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      alert('Não foi possível remover o alerta.');
    }
  };

  const formatDisplayPhone = (phone: string) => {
    if (!phone) return '';
    const clean = phone.replace(/[^\d]/g, '');
    if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
    return phone;
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {error && (
        <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 text-sm rounded-xl flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Formulário */}
        <section className="lg:col-span-5">
          <div className="glass-panel border border-zinc-850 rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg">Novo Monitoramento</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Cadastre o comprador e a marca/modelo desejados</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Nome do Comprador *</label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input
                    type="text" required placeholder="Ex: João Silveira" value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">WhatsApp Comprador *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input
                    type="text" required placeholder="Ex: (47) 99999-9999" value={telefone}
                    onChange={(e) => setTelefone(formatPhoneNumber(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Marca Desejada</label>
                <div className="relative">
                  <Car className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input
                    type="text" placeholder="Ex: Volkswagen, Fiat, Honda..." value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Modelo / Palavra-Chave *</label>
                <input
                  type="text" required placeholder="Ex: Civic, Corolla, Tiguan..." value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 my-1">
                <div className="h-px bg-zinc-900 flex-1" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Filtros Avançados (Opcional)</span>
                <div className="h-px bg-zinc-900 flex-1" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number" placeholder="Ano Min" value={anoMinimo} onChange={(e) => setAnoMinimo(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                />
                <input
                  type="number" placeholder="Ano Max" value={anoMaximo} onChange={(e) => setAnoMaximo(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number" placeholder="KM Min" value={kmMinimo} onChange={(e) => setKmMinimo(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                />
                <input
                  type="number" placeholder="KM Max" value={kmMaximo} onChange={(e) => setKmMaximo(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text" placeholder="Cor" value={cor} onChange={(e) => setCor(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors col-span-1"
                />
                <select
                  value={cambio} onChange={(e) => setCambio(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl px-2 py-2.5 text-zinc-350 text-xs font-semibold focus:outline-none focus:border-zinc-850 transition-colors cursor-pointer col-span-1"
                >
                  <option value="">Câmbio</option>
                  <option value="AUTOMATICO">Automático</option>
                  <option value="MANUAL">Manual</option>
                </select>
                <select
                  value={combustivel} onChange={(e) => setCombustivel(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl px-2 py-2.5 text-zinc-350 text-xs font-semibold focus:outline-none focus:border-zinc-850 transition-colors cursor-pointer col-span-1"
                >
                  <option value="">Combustível</option>
                  <option value="FLEX">Flex</option>
                  <option value="GASOLINA">Gasolina</option>
                  <option value="DIESEL">Diesel</option>
                  <option value="HIBRIDO">Híbrido</option>
                  <option value="ELETRICO">Elétrico</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Faixa de Preço</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text" placeholder="Mínimo" value={valorMinimo} onChange={(e) => setValorMinimo(formatCurrencyInput(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                  />
                  <span className="text-zinc-500 text-xs">até</span>
                  <input
                    type="text" placeholder="Máximo" value={valorMaximo} onChange={(e) => setValorMaximo(formatCurrencyInput(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit" disabled={submitting}
                className="w-full mt-2 py-3.5 px-6 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Ativando...' : 'Ativar Monitoramento 24h'}
                <Sparkles className="w-4 h-4" />
              </button>
            </form>
          </div>
        </section>

        {/* Listagem */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" /> Fila de Espera Ativa
            </h3>
            <span className="text-xs text-zinc-550 font-medium">
              {alerts.length} cadastrados
            </span>
          </div>

          {!loading && alerts.length > 0 && (
            <div className="glass-panel border border-zinc-900 rounded-2xl p-3 flex flex-col sm:flex-row gap-3 items-center">
              <div className="relative w-full sm:flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                <input
                  type="text" placeholder="Buscar comprador ou modelo..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-9 py-2 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-zinc-550 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <select
                value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
                className="w-full sm:w-40 bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-zinc-350 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="TODAS">TODAS AS MARCAS</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              <select
                value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full sm:w-32 bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-zinc-350 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="TODOS">TODOS</option>
                <option value="ATIVOS">ATIVOS</option>
                <option value="INATIVOS">INATIVOS</option>
              </select>
            </div>
          )}

          {loading ? (
            <div className="glass-panel border border-zinc-900 rounded-2xl p-16 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
              <span className="text-xs text-zinc-400">Carregando monitoramentos...</span>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="glass-panel border border-zinc-900 border-dashed rounded-2xl p-12 text-center text-zinc-500">
              Nenhum alerta ativo encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredAlerts.map((alerta) => (
                <div 
                  key={alerta.id}
                  className={`glass-panel border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all relative overflow-hidden ${
                    alerta.ativo ? 'border-zinc-850 bg-zinc-900/10' : 'border-zinc-900/60 bg-zinc-950/20 opacity-50'
                  }`}
                >
                  {alerta.ativo && <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full m-3 animate-pulse" />}

                  <div className="flex flex-col gap-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-extrabold text-sm text-white block truncate max-w-[150px]">{alerta.nome_cliente}</span>
                        <span className="text-[10px] text-zinc-500 font-semibold block mt-0.5">{formatDisplayPhone(alerta.telefone_cliente)}</span>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase border-zinc-800 bg-zinc-900/50 text-zinc-400">{alerta.marca}</span>
                    </div>

                    <div className="h-px bg-zinc-900/60" />

                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between text-zinc-400">
                        <span>Modelo:</span>
                        <span className="text-zinc-200 font-bold capitalize">{alerta.modelo}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Preço:</span>
                        <span className="text-emerald-400 font-bold">
                          {alerta.valor_minimo || alerta.valor_maximo 
                            ? `${alerta.valor_minimo ? alerta.valor_minimo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'R$ 0'} - ${alerta.valor_maximo ? alerta.valor_maximo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'Sem limite'}`
                            : 'Qualquer valor'}
                        </span>
                      </div>
                    </div>

                    {(alerta.ano_minimo || alerta.ano_maximo || alerta.km_minimo || alerta.km_maximo || alerta.cor || alerta.cambio || alerta.combustivel) && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(alerta.ano_minimo || alerta.ano_maximo) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400">
                            Ano: {alerta.ano_minimo || 'Any'} - {alerta.ano_maximo || 'Any'}
                          </span>
                        )}
                        {alerta.cor && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400 capitalize">Cor: {alerta.cor}</span>}
                        {alerta.cambio && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-850 bg-primary/10 text-primary uppercase">{alerta.cambio === 'AUTOMATICO' ? 'AUT' : 'MAN'}</span>}
                        {alerta.combustivel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-850 bg-emerald-950/30 text-emerald-400 uppercase">{alerta.combustivel}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-900/60 pt-3">
                    <button
                      type="button" onClick={() => handleToggleAlert(alerta.id, alerta.ativo)}
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer border-0 bg-transparent"
                    >
                      {alerta.ativo ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-zinc-650" />}
                      {alerta.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    <button
                      type="button" onClick={() => handleDeleteAlert(alerta.id)}
                      className="p-1.5 rounded-lg border border-zinc-900 hover:border-red-900 bg-zinc-950 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
