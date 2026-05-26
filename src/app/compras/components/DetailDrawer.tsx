import React from 'react';
import { X, Calendar, Gauge, ShieldCheck, CheckCircle2, AlertTriangle, FileText, Phone, MapPin } from 'lucide-react';

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

interface DetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  opp: Opportunity | null;
  onInterest: (opp: Opportunity) => void;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({ isOpen, onClose, opp, onInterest }) => {
  if (!isOpen || !opp) return null;

  const getReasonIcon = (type: string) => {
    switch (type) {
      case 'bonus':
        return <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />;
      case 'penalty':
        return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />;
      case 'fipe':
        return <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />;
    }
  };

  const formattedFipe = opp.fipe_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const formattedAsk = opp.ask_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return (
    <div className="fixed inset-0 z-45 flex justify-end bg-black/60 backdrop-blur-sm">
      <div 
        onClick={onClose} 
        className="absolute inset-0 cursor-pointer"
      />

      <div className="bg-[#0c0c0f] border-l border-zinc-800 w-full max-w-lg h-full overflow-y-auto relative z-10 flex flex-col justify-between shadow-2xl p-6 md:p-8">
        
        {/* Top Header */}
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-start gap-4">
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded uppercase">
                {opp.grupo_anuncio}
              </span>
              <h3 className="font-extrabold text-2xl text-white mt-3 leading-tight">{opp.brand} {opp.model}</h3>
              <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Ano Modelo: {opp.year_model}
                <span className="text-zinc-800">•</span>
                <Gauge className="w-3.5 h-3.5" /> {opp.km.toLocaleString('pt-BR')} km
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-zinc-500 hover:text-white transition-colors p-2 bg-zinc-900 border border-zinc-850 rounded-xl shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="h-px bg-zinc-900" />

          {/* Seção Financeira */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col">
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Valor Pedido (Repasse)</span>
              <span className="text-xl font-black text-white mt-1.5">{formattedAsk}</span>
            </div>

            <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col">
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Tabela FIPE</span>
              <span className="text-xl font-black text-zinc-400 mt-1.5">{formattedFipe}</span>
              <span className={`text-[10px] font-bold mt-1 ${opp.fipe_pct <= 80 ? 'text-lime-400' : 'text-emerald-400'}`}>
                {opp.fipe_pct}% da Tabela FIPE
              </span>
            </div>
          </div>

          {/* Deal Score Breakdown */}
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Análise do Deal Score ({opp.deal_score} pts)</h4>
            
            <div className="flex flex-col gap-3">
              {opp.reasons && opp.reasons.map((reason, idx) => (
                <div key={idx} className="flex gap-2.5 items-start text-xs text-zinc-300">
                  {getReasonIcon(reason.type)}
                  <span>{reason.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Vendedor e Localização */}
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Contato do Anunciante</h4>
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3 text-xs">
              <div className="flex items-center gap-2 text-zinc-300">
                <Phone className="w-4 h-4 text-zinc-500" />
                <span><strong>Anunciante:</strong> {opp.seller_name || 'Particular'}</span>
              </div>
              {opp.seller_phone && opp.seller_phone !== 'Removido por segurança' && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <Phone className="w-4 h-4 text-zinc-500" />
                  <span><strong>WhatsApp:</strong> {opp.seller_phone}</span>
                </div>
              )}
              {opp.location && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <MapPin className="w-4 h-4 text-zinc-500" />
                  <span><strong>Cidade:</strong> {opp.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Detalhes Mecânicos / Estéticos */}
          {opp.notes && (
            <div className="flex flex-col gap-4">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Descrição e Observações</h4>
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {opp.notes}
              </div>
            </div>
          )}
        </div>

        {/* Footer Cta */}
        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={() => onInterest(opp)}
            className="w-full py-4 px-6 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer glow-primary glow-primary-hover"
          >
            Manifestar Interesse de Compra
          </button>
        </div>

      </div>
    </div>
  );
};
