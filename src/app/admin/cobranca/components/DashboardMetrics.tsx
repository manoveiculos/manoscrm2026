import { motion } from 'framer-motion';
import { TrendingUp, CheckCircle2, AlertTriangle, DollarSign } from 'lucide-react';
import { DashboardStats } from '@/types';

interface DashboardMetricsProps {
  stats: DashboardStats;
}

export default function DashboardMetrics({ stats }: DashboardMetricsProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const cardsData = [
    {
      id: 'metric-total',
      title: 'Total a Receber (Em Aberto)',
      value: stats.totalAReceber,
      description: 'Aguardando pagamento / Em atraso',
      icon: DollarSign,
      color: 'from-violet-500/5 to-indigo-500/5 border-violet-500/15 text-violet-400',
      badgeColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
      iconBg: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
      badge: 'Mensal',
    },
    {
      id: 'metric-received',
      title: 'Valor Já Recebido',
      value: stats.valorRecebido,
      description: 'Compensado com sucesso',
      icon: CheckCircle2,
      color: 'from-emerald-500/5 to-teal-500/5 border-emerald-500/15 text-emerald-400',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      badge: `${stats.totalAReceber + stats.valorRecebido > 0 
        ? Math.round((stats.valorRecebido / (stats.totalAReceber + stats.valorRecebido)) * 100) 
        : 0}% pago`,
    },
    {
      id: 'metric-overdue',
      title: 'Inadimplência',
      value: stats.inadimplencia,
      description: `Taxa calculada em ${stats.porcentagemInadimplencia.toFixed(1)}%`,
      icon: AlertTriangle,
      color: 'from-red-500/5 to-rose-500/5 border-red-500/15 text-red-400',
      badgeColor: 'bg-red-500/10 text-red-400 border-red-500/20',
      iconBg: 'bg-red-500/10 text-red-400 border-red-500/20',
      badge: `${stats.porcentagemInadimplencia.toFixed(1)}% global`,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in" id="dashboard-metrics-grid">
      {cardsData.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <motion.div
            key={card.title}
            id={card.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.08 }}
            className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br bg-zinc-900/40 backdrop-blur-xl p-5 shadow-2xl hover:border-zinc-700/80 transition-all duration-300 ${card.color.split(' ')[2]}`}
          >
            {/* Subtle glow effect */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.01] rounded-bl-full pointer-events-none" />
            
            <div className="flex items-start justify-between relative z-10">
              <div>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                  {card.title}
                </p>
                <h3 className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight font-sans">
                  {formatCurrency(card.value)}
                </h3>
              </div>
              <div className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${card.iconBg.split(' ')[0]} ${card.iconBg.split(' ')[2]}`}>
                <IconComponent className="w-5.5 h-5.5" />
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400 relative z-10">
              <span className="flex items-center gap-1.5 font-bold tracking-tight">
                <TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
                {card.description}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-mono font-black border uppercase tracking-wider ${card.badgeColor}`}>
                {card.badge}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
