'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Target,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  Sparkles,
  Car
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
  const [userRole, setUserRole] = useState<'admin' | 'consultant'>('consultant');
  const [consultantInfo, setConsultantInfo] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // Default role is admin for specific email
        let role: 'admin' | 'consultant' = 'admin';
        let info = null;

        if (session?.user?.email !== 'alexandre_gorges@hotmail.com') {
          const { data: consultant } = await supabase
            .from('consultants_manos_crm')
            .select('id, name, role')
            .eq('auth_id', session?.user.id)
            .maybeSingle();

          if (consultant) {
            role = consultant.role as 'admin' | 'consultant';
            info = { id: consultant.id, name: consultant.name };
          }
        }

        setUserRole(role);
        setConsultantInfo(info);

        const [financials, leads, aiRes] = await Promise.all([
          dataService.getFinancialMetrics(),
          dataService.getLeads(role === 'consultant' ? info?.id : undefined),
          fetch('/api/health/ai').then(res => res.json()).catch(() => ({ status: 'error' }))
        ]);
        setMetrics(financials);
        setRecentLeads(leads?.slice(0, 4) || []);
        setAiStatus(aiRes.status === 'ok' ? 'ok' : 'error');
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (userRole === 'consultant' && consultantInfo) {
    return <ConsultantDashboard consultantId={consultantInfo.id} consultantName={consultantInfo.name} />;
  }

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full w-fit text-[10px] font-bold uppercase tracking-wider border shadow-md transition-all ${aiStatus === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10 shadow-emerald-500/5' :
            aiStatus === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/10 shadow-red-500/5 animate-pulse' :
              'bg-white/5 text-white/30 border-white/5'
            }`}>
            <Sparkles size={12} className={aiStatus === 'ok' ? 'animate-pulse' : ''} />
            {aiStatus === 'ok' ? 'IA: Conectada' : aiStatus === 'error' ? 'IA: Chave Inválida' : 'IA: Verificando...'}
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white font-outfit">
            Visão <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-white to-red-600">Geral</span>
          </h1>
          <p className="text-white/40 font-medium">Performance de leads e ROI em tempo real para Manos Veículos.</p>
        </div>

        <div className="flex items-center gap-4 bg-white/5 p-1.5 rounded-2xl border border-white/10">
          <button className="px-5 py-2.5 rounded-xl bg-white/5 text-xs font-bold text-white shadow-xl">Hoje</button>
          <button className="px-5 py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white transition-colors">Semana</button>
          <button className="px-5 py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white transition-colors">Mês</button>
        </div>
      </header>

      {/* Stats Grid */}
      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <StatsCard
          title="Leads Capturados"
          value={metrics?.leadCount || 0}
          trend={12.5}
          icon={Users}
          color="blue"
          href="/leads?view=list"
        />
        <StatsCard
          title="Custo por Lead"
          value={`R$ ${metrics?.cpl?.toFixed(2) || '0,00'}`}
          trend={-4.2}
          icon={DollarSign}
          color="emerald"
          href="/marketing"
        />
        <StatsCard
          title="Leads Pagos (Vendas)"
          value={metrics?.salesCount || 0}
          trend={2.1}
          icon={Target}
          color="amber"
          href="/leads?view=kanban"
        />
        <StatsCard
          title="ROI Estimado"
          value={`${metrics?.roi?.toFixed(1) || '0.0'}x`}
          trend={15.8}
          icon={TrendingUp}
          color="indigo"
          href="/marketing"
        />
      </motion.section>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Recent Hot Leads */}
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
                        {lead.source === 'Facebook Leads' ? 'Meta Ads' : lead.source}
                      </span>
                      <span className="text-[9px] font-bold text-white/20 uppercase tracking-tighter">
                        {new Date(lead.created_at).toLocaleDateString()}
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
        </motion.div>

        {/* Right Column: Mini ROI Stats */}
        <motion.div
          variants={item}
          initial="hidden"
          animate="show"
          className="lg:col-span-4 glass-card p-8 space-y-8"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <DollarSign size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Metas Financeiras</h3>
              <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Tempo Real</p>
            </div>
          </div>

          <div className="space-y-6">
            {[
              { label: 'Faturamento', value: `R$ ${(metrics?.totalRevenue || 0).toLocaleString()}`, color: 'bg-red-600', pct: 75 },
              { label: 'Margem de Lucro', value: `R$ ${(metrics?.totalProfit || 0).toLocaleString()}`, color: 'bg-emerald-500', pct: 60 },
              { label: 'Meta de Vendas', value: `${metrics?.salesCount || 0} / 20`, color: 'bg-amber-500', pct: ((metrics?.salesCount || 0) / 20) * 100 },
            ].map((stat, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-white/70">{stat.label}</span>
                  <span className="font-black text-white">{stat.value}</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${stat.color} shadow-[0_0_10px_rgba(0,0,0,0.5)]`} style={{ width: `${Math.min(stat.pct, 100)}%` }} />
                </div>
              </div>
            ))}
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
