'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Target,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  Sparkles,
  Car,
  Calendar,
  ChevronDown,
  Trophy,
  History
} from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { dataService } from '@/lib/dataService';
import { Lead, FinancialMetrics } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { ConsultantDashboard } from '@/components/ConsultantDashboard';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [userRole, setUserRole] = useState<'admin' | 'consultant' | null>(null);
  const [consultantInfo, setConsultantInfo] = useState<{ id: string; name: string } | null>(null);
  const [period, setPeriod] = useState<'today' | 'this_week' | 'this_month' | 'custom'>('this_month');
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [salesRanking, setSalesRanking] = useState<{ name: string; count: number }[]>([]);
  const [recentSalesList, setRecentSalesList] = useState<any[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const authResponse = await supabase.auth.getSession();
        const session = authResponse.data?.session;

        if (!session?.user) {
          window.location.href = '/login';
          return;
        }

        let role: 'admin' | 'consultant' = 'consultant';
        let info = null;

        if (session.user.email === 'alexandre_gorges@hotmail.com') {
          role = 'admin';
        } else {
          const { data: consultant } = await supabase
            .from('consultants_manos_crm')
            .select('id, name, role')
            .eq('auth_id', session.user.id)
            .maybeSingle();

          if (consultant) {
            role = consultant.role as 'admin' | 'consultant';
            info = { id: consultant.id, name: consultant.name };
          }
        }

        setUserRole(role);
        setConsultantInfo(info);

        const [financials, leads, ranking, sales, aiRes] = await Promise.all([
          dataService.getFinancialMetrics(period === 'custom' ? undefined : period, period === 'custom' ? customRange : undefined),
          dataService.getLeads(role === 'consultant' ? info?.id : undefined),
          dataService.getSalesRanking(period === 'custom' ? customRange.start : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
          dataService.getRecentSales(4),
          fetch('/api/health/ai').then(res => res.json()).catch(() => ({ status: 'error' }))
        ]);
        setMetrics(financials);
        setRecentLeads(leads?.slice(0, 4) || []);
        setSalesRanking(ranking);
        setRecentSalesList(sales);
        setAiStatus(aiRes.status === 'ok' ? 'ok' : 'error');
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [period, customRange]);

  if (loading && !metrics) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userRole) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
        <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Verificando Acesso...</p>
        <div className="h-10 w-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(239,68,68,0.2)]" />
      </div>
    );
  }

  if (userRole === 'consultant' && consultantInfo) {
    return <ConsultantDashboard consultantId={consultantInfo.id} consultantName={consultantInfo.name} />;
  }

  return (
    <div className="space-y-12 pb-20">
      <header className="flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full w-fit text-[10px] font-bold uppercase tracking-wider border shadow-md transition-all ${aiStatus === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10 shadow-emerald-500/5' :
            aiStatus === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/10 shadow-red-500/5 animate-pulse' :
              'bg-white/5 text-white/30 border-white/5'
            }`}>
            <Sparkles size={12} className={aiStatus === 'ok' ? 'animate-pulse' : ''} />
            {aiStatus === 'ok' ? 'IA: Conectada' : aiStatus === 'error' ? 'IA: Chave Inválida' : 'IA: Verificando...'}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white font-outfit">
            Visão <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-white to-red-600">Geral</span>
          </h1>
          <p className="text-sm md:text-base text-white/40 font-medium">Performance de leads e ROI em tempo real para Manos Veículos.</p>
        </div>

        <div className="flex items-center gap-4 bg-white/5 p-1.5 rounded-2xl border border-white/10 relative">
          <button
            onClick={() => setPeriod('today')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${period === 'today' ? 'bg-white/5 text-white shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            Hoje
          </button>
          <button
            onClick={() => setPeriod('this_week')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${period === 'this_week' ? 'bg-white/5 text-white shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            Semana
          </button>
          <button
            onClick={() => setPeriod('this_month')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${period === 'this_month' ? 'bg-white/5 text-white shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            Mês
          </button>
          <div className="h-6 w-px bg-white/10 mx-1" />
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${period === 'custom' ? 'bg-red-600 text-white shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            <Calendar size={14} />
            {period === 'custom' ? `${new Date(customRange.start).toLocaleDateString('pt-BR')} - ${new Date(customRange.end).toLocaleDateString('pt-BR')}` : 'Personalizado'}
            <ChevronDown size={14} className={`transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
          </button>

          {showDatePicker && (
            <div className="absolute top-full right-0 mt-3 p-6 glass-card z-50 animate-in fade-in slide-in-from-top-2 duration-300 min-w-[320px] border-red-500/20">
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-white/40 mb-2">Filtrar por Período</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/30 uppercase">Início</label>
                    <input
                      type="date"
                      value={customRange.start}
                      onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-red-500/50 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/30 uppercase">Fim</label>
                    <input
                      type="date"
                      value={customRange.end}
                      onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-red-500/50 outline-none transition-all"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPeriod('custom');
                    setShowDatePicker(false);
                  }}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                >
                  Aplicar Filtro
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <StatsCard
          title="Leads Capturados"
          value={metrics?.leadCount || 0}
          icon={Users}
          color="blue"
          href="/leads?view=list"
        />
        <StatsCard
          title="Custo por Lead"
          value={`R$ ${metrics?.cpl?.toFixed(2) || '0,00'}`}
          icon={DollarSign}
          color="emerald"
          href="/marketing"
        />
        <StatsCard
          title="Leads Pagos (Negociações)"
          value={metrics?.salesCount || 0}
          icon={Target}
          color="amber"
          href="/leads?view=kanban"
        />
        <StatsCard
          title="Leads x Vendas"
          value={metrics ? `${metrics.roi.toFixed(1)}%` : '0.0%'}
          icon={TrendingUp}
          color="indigo"
          href="/marketing"
        />
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <motion.div
          variants={item}
          initial="hidden"
          animate="show"
          className="lg:col-span-8 space-y-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                <Target size={18} />
              </span>
              Leads Recentes
            </h2>
            <Link href="/leads?view=kanban" className="text-sm font-bold text-red-400 hover:text-red-300 transition-colors">Ver Pipeline Completo</Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentLeads.length > 0 ? recentLeads.map((lead, i) => (
              <Link
                key={i}
                href={`/leads?id=${lead.id}`}
                className="glass-card group p-6 flex items-start justify-between hover:border-red-500/30 transition-all cursor-pointer block"
              >
                <div className="flex gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center font-bold text-white group-hover:bg-red-600 group-hover:shadow-[0_0_15px_rgba(227,30,36,0.4)] transition-all">
                    {lead.name[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-white group-hover:text-red-200 transition-colors">{lead.name}</h4>
                    <p className="text-xs text-white/40 flex items-center gap-1.5 mt-1">
                      <Car size={12} /> {lead.vehicle_interest || 'Interesse em Compra'}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[9px] font-black uppercase text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded">
                        {lead.source}
                      </span>
                      <span className="text-[9px] font-bold text-white/20 uppercase tracking-tighter">
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')} {new Date(lead.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-lg font-black text-rose-500 flex items-center justify-end gap-1">
                    {lead.ai_score}
                    <span className="text-[10px]">%</span>
                  </div>
                  <p className="text-[9px] font-bold uppercase text-white/30">Score IA</p>
                </div>
              </Link>
            )) : (
              <div className="col-span-2 glass-card p-10 text-center text-white/30 font-medium">
                Nenhum lead encontrado no banco de dados.
              </div>
            )}
          </div>

          <div className="pt-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <History size={18} />
                </span>
                Vendas Recentes
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentSalesList.length > 0 ? recentSalesList.map((sale, i) => (
                <div
                  key={i}
                  className="glass-card p-5 flex items-center justify-between border-emerald-500/10 bg-emerald-500/[0.02]"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                      $
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">{sale.lead?.name || 'Venda Direta'}</h4>
                      <p className="text-[10px] text-white/40 mt-0.5">Vendido por <b>{sale.consultant?.name || 'Equipe'}</b></p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-emerald-400">R$ {sale.sale_value.toLocaleString()}</div>
                    <div className="text-[9px] font-bold text-white/20 uppercase">{new Date(sale.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                </div>
              )) : (
                <div className="col-span-2 p-6 text-center text-white/20 text-xs font-medium border border-dashed border-white/5 rounded-2xl">
                  Nenhuma venda registrada recentemente.
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={item}
          initial="hidden"
          animate="show"
          className="lg:col-span-4 glass-card p-8 space-y-8"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <Trophy size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Metas Vendas</h3>
              <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Ranking de Vendedores</p>
            </div>
          </div>

          <div className="space-y-4">
            {salesRanking.length > 0 ? salesRanking.slice(0, 5).map((consultant, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-300 text-black' : i === 2 ? 'bg-orange-600 text-white' : 'bg-white/10 text-white/40'}`}>
                      {i + 1}
                    </span>
                    <span className="font-bold text-white/70">{consultant.name}</span>
                  </div>
                  <span className="font-black text-white">
                    {consultant.count} {consultant.name.toLowerCase().includes('felipe') ? 'compras' : 'vendas'}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${i === 0 ? 'bg-amber-500' : 'bg-red-500'} shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                    style={{ width: `${(consultant.count / (salesRanking[0]?.count || 1)) * 100}%` }}
                  />
                </div>
              </div>
            )) : (
              <div className="text-center py-6 text-white/20 text-xs font-medium">
                Nenhuma venda registrada no período.
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-white/5">
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
              <p className="text-[11px] text-red-300 leading-relaxed italic">
                &quot;Seu lucro atual é de <b>R$ {(metrics?.totalProfit || 0).toLocaleString()}</b>. Mantenha o CPL abaixo de R$ 20 para maximizar o ROI este mês.&quot;
              </p>
            </div>
            <button className="w-full mt-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold transition-all flex items-center justify-center gap-2">
              Ver Relatório Detalhado <ArrowUpRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
