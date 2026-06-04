import React from 'react';
import { Calendar, Gauge, Clock } from 'lucide-react';

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

interface OpportunityCardProps {
  opp: Opportunity;
  onSelect: (opp: Opportunity) => void;
  onInterest: (opp: Opportunity, e: React.MouseEvent) => void;
}

export const OpportunityCard: React.FC<OpportunityCardProps> = ({ opp, onSelect, onInterest }) => {
  const getRatingStyles = (rating: string) => {
    switch (rating) {
      case 'EXCELENTE':
        return {
          bg: 'bg-lime-500/10 border-lime-500/20 text-lime-400',
          border: 'border-lime-500/30',
          glow: 'shadow-[0_0_15px_rgba(132,204,22,0.15)]',
          circleColor: '#84cc16'
        };
      case 'BOM':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
          border: 'border-emerald-500/30',
          glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
          circleColor: '#10b981'
        };
      case 'MEDIO':
        return {
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          border: 'border-zinc-800',
          glow: '',
          circleColor: '#f59e0b'
        };
      case 'RUIM':
        return {
          bg: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
          border: 'border-orange-500/20',
          glow: '',
          circleColor: '#f97316'
        };
      case 'EVITAR':
        return {
          bg: 'bg-red-500/10 border-red-500/20 text-red-400',
          border: 'border-red-500/30',
          glow: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]',
          circleColor: '#ef4444'
        };
      default:
        return {
          bg: 'bg-zinc-800/40 border-zinc-850 text-zinc-400',
          border: 'border-zinc-900',
          glow: '',
          circleColor: '#71717a'
        };
    }
  };

  const getGroupBadgeStyles = (group: string) => {
    switch (group) {
      case 'Ally Repasses':
      case 'ALLY REPASSES':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'Alto Vale VIP':
      case 'ALTO VALE VIP':
      case 'REPASSE ALTO VALE VIP':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'Carvalho e Júnior':
      case 'CARVALHO E JÚNIOR':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      default:
        return 'text-zinc-400 bg-zinc-900 border-zinc-850';
    }
  };

  const formatarData = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const ano = date.getFullYear();
      const hora = String(date.getHours()).padStart(2, '0');
      const minuto = String(date.getMinutes()).padStart(2, '0');
      return `Publicado em ${dia}/${mes}/${ano} às ${hora}:${minuto}hrs`;
    } catch {
      return 'N/A';
    }
  };

  const styles = getRatingStyles(opp.rating);
  const formattedFipe = opp.fipe_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const formattedAsk = opp.ask_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  const radius = 28;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (opp.deal_score / 100) * circumference;

  const postedDate = opp.posted_at ? new Date(opp.posted_at) : null;
  const isOlderThan3Days = postedDate 
    ? (Math.abs(new Date().getTime() - postedDate.getTime()) / (1000 * 60 * 60 * 24)) > 3
    : false;

  const cardBorderClass = isOlderThan3Days 
    ? 'border-red-500/30 bg-red-950/5 hover:border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.08)]' 
    : `${styles.border} ${styles.glow}`;

  return (
    <div 
      onClick={() => onSelect(opp)}
      className={`glass-panel border rounded-2xl p-5 md:p-6 flex flex-col justify-between gap-5 relative overflow-hidden transition-all hover:bg-zinc-900/15 hover:border-zinc-700 cursor-pointer ${cardBorderClass}`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-950/20 rounded-full blur-3xl pointer-events-none" />

      {/* Topo do card */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getGroupBadgeStyles(opp.grupo_anuncio)}`}>
              {opp.grupo_anuncio}
            </span>
            {opp.recovered_accident && (
              <span className="text-[8px] font-extrabold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded uppercase">
                Sinistrado / Leilão
              </span>
            )}
            {isOlderThan3Days && (
              <span className="text-[8px] font-extrabold text-red-500 bg-red-950/50 border border-red-500/40 px-1.5 py-0.5 rounded uppercase flex items-center gap-1 animate-pulse">
                ⚠️ +3 Dias Anunciado
              </span>
            )}
          </div>
          <h3 className="font-extrabold text-lg text-white leading-tight mt-1">{opp.model}</h3>
          <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-0.5">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-zinc-500" /> {opp.year_model}</span>
            <span className="text-zinc-800">•</span>
            <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-zinc-500" /> {opp.km.toLocaleString('pt-BR')} km</span>
            <span className="text-zinc-800">•</span>
            <span className="flex items-center gap-1 text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-zinc-500 animate-pulse-soft" /> {formatarData(opp.posted_at)}
            </span>
          </p>
        </div>

        {/* Circular Deal Score */}
        <div className="relative shrink-0 flex items-center justify-center">
          <svg className="w-16 h-16 transform -rotate-90">
            <circle cx="32" cy="32" r={radius} stroke="#18181b" strokeWidth={strokeWidth} fill="transparent" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              stroke={styles.circleColor}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-sm font-black text-white leading-none">{opp.deal_score}</span>
            <span className="text-[8px] font-bold text-zinc-550 tracking-wide uppercase mt-0.5">Score</span>
          </div>
        </div>
      </div>

      {/* Preços e Ações */}
      <div className="flex justify-between items-end bg-zinc-950 border border-zinc-900 rounded-xl p-4 text-xs">
        <div>
          <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">Repasse:</span>
          <span className="text-white font-black text-xl block mt-0.5">{formattedAsk}</span>
        </div>
        <div className="text-right flex flex-col items-end">
          <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">Deságio FIPE:</span>
          <span className={`font-black text-base mt-0.5 block ${opp.fipe_pct <= 80 ? 'text-lime-400' : opp.fipe_pct <= 90 ? 'text-emerald-400' : 'text-zinc-300'}`}>
            -{100 - opp.fipe_pct}% <span className="text-[10px] font-medium text-zinc-500">({formattedFipe})</span>
          </span>
        </div>
      </div>

      <button
        onClick={(e) => onInterest(opp, e)}
        className="w-full py-3 px-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 group cursor-pointer"
      >
        Registrar Interesse
      </button>
    </div>
  );
};
