'use client';

import React from 'react';
import { 
  FileText, Trash2, Clock, Calculator, User, ExternalLink 
} from 'lucide-react';
import { FacebookLead } from './FacebookTab';

interface FacebookLeadDrawerProps {
  lead: FacebookLead | null;
  onClose: () => void;
  onOpenFipeSearch: (lead: FacebookLead) => void;
  onDelete: (lead: FacebookLead) => void;
  onNavigateToTab?: (tab: string, params?: any) => void;
}

export default function FacebookLeadDrawer({
  lead,
  onClose,
  onOpenFipeSearch,
  onDelete,
  onNavigateToTab
}: FacebookLeadDrawerProps) {
  
  if (!lead) return null;

  const getWhatsAppLink = (l: FacebookLead) => {
    if (!l.telefone) return '#';
    const cleanPhone = l.telefone.replace(/[^\d]/g, '');
    const whatsappNumber = (cleanPhone.length === 10 || cleanPhone.length === 11) ? `55${cleanPhone}` : cleanPhone;
    const greetingText = `Olá ${l.nome || ''}, tudo bem? Aqui é o Felipe Ledra da Manos Veículos! 🚗

Recebemos o seu contato em nosso anúncio demonstrando interesse em avaliar o seu veículo (*${l.veiculo || ''}*).

Poderia me confirmar alguns detalhes dele para eu formular a melhor proposta?
- Quilometragem atual;
- Se possui algum detalhe de lataria ou mecânico;
- E se puder, me envie algumas fotos dele por aqui.

Fico no aguardo!`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(greetingText)}`;
  };

  const handleSimulate = (e: React.MouseEvent) => {
    e.preventDefault();
    const brand = lead.veiculo.trim().split(' ')[0];
    const model = lead.veiculo.trim().split(' ').slice(1).join(' ');
    const year = lead.ano ? lead.ano.replace(/[^\d]/g, '').slice(0, 4) : '2018';
    const kmVal = lead.km ? lead.km.replace(/[^\d]/g, '') : '80000';

    if (onNavigateToTab) {
      onNavigateToTab('calculator', { brand, model, year_model: year, km: kmVal });
      onClose();
    } else {
      window.location.href = `/compras?tab=calculator&brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&year_model=${year}&km=${kmVal}`;
    }
  };

  return (
    <div 
      className="fixed top-[120px] left-0 right-0 bottom-0 bg-black/60 backdrop-blur-xs z-[100] flex justify-end"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-zinc-950 border-l border-zinc-900 h-full flex flex-col justify-between shadow-[0_0_50px_rgba(0,0,0,0.8)] relative animate-slide-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Header */}
          <div className="bg-zinc-900/60 border-b border-zinc-900/80 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="font-extrabold text-white text-base">Detalhes da Oferta</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDelete(lead)}
                className="p-2 bg-red-950/20 hover:bg-red-900 border border-red-900/30 hover:border-red-800 rounded-xl transition-all text-red-500 hover:text-white text-xs font-bold cursor-pointer"
                title="Excluir este lead permanentemente"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all text-zinc-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-170px)]">
            
            <div className="flex flex-col gap-2 pb-4 border-b border-zinc-900">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded uppercase">
                  {lead.origem || 'Oferta Exclusiva'}
                </span>
                {lead.aceita_fipe && lead.aceita_fipe.trim().toLowerCase() === 'sim' && (
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase">
                    Aceita FIPE
                  </span>
                )}
              </div>
              <h3 className="text-xl font-extrabold text-white mt-1 leading-tight">{lead.veiculo}</h3>
              <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-550" /> Recebido em: {lead.data_envio_formatada}
              </p>
            </div>

            {/* Attributes Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[9px] font-semibold text-zinc-550 uppercase">Ano Modelo</span>
                <span className="text-sm font-bold text-zinc-200">{lead.ano || 'N/A'}</span>
              </div>
              <div className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[9px] font-semibold text-zinc-550 uppercase">Quilometragem</span>
                <span className="text-sm font-bold text-zinc-200">{lead.km ? `${lead.km} km` : 'N/A'}</span>
              </div>
              <div className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[9px] font-semibold text-zinc-550 uppercase">Valor Pedido</span>
                <span className="text-sm font-extrabold text-white">{lead.valor_pedido || 'N/A'}</span>
              </div>
              <div className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[9px] font-semibold text-zinc-550 uppercase">Cidade</span>
                <span className="text-sm font-bold text-zinc-200 capitalize">{lead.cidade || 'N/A'}</span>
              </div>
            </div>

            {/* FIPE Information */}
            {lead.fipe_price ? (
              <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-4 flex flex-col gap-3">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Avaliação FIPE Oficial</span>
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-extrabold text-white text-base leading-none">
                      {lead.fipe_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                    </h4>
                    <span className="text-[10px] text-zinc-400 mt-1.5 block max-w-[220px] truncate" title={lead.fipe_model || ''}>
                      {lead.fipe_model}
                    </span>
                  </div>
                  {lead.deal_score !== null && (
                    <div className="text-right flex items-center gap-2">
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-zinc-300">Deal Score</span>
                        {lead.fipe_pct !== null && (
                          <span className={`text-[10px] font-semibold ${lead.fipe_pct <= 90 ? 'text-lime-400' : lead.fipe_pct <= 100 ? 'text-emerald-400' : 'text-amber-500'}`}>
                            {lead.fipe_pct - 100 > 0 ? `+${lead.fipe_pct - 100}%` : `${lead.fipe_pct - 100}%`}
                          </span>
                        )}
                      </div>
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-black border ${
                        lead.deal_score >= 85 
                          ? 'bg-lime-500/10 border-lime-500/20 text-lime-400 shadow-[0_0_15px_rgba(132,204,22,0.2)]' 
                          : lead.deal_score >= 70 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                          : lead.deal_score >= 50 
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                          : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}>
                        {lead.deal_score}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-zinc-550 flex justify-between pt-2 border-t border-zinc-900/60">
                  <span>Código FIPE: <strong>{lead.fipe_code || 'N/A'}</strong></span>
                  {lead.is_estimated && <span className="text-amber-500 font-semibold">Valor Estimado</span>}
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-4 flex flex-col gap-3">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Avaliação FIPE Oficial</span>
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <h4 className="font-extrabold text-zinc-400 text-sm leading-none">Não cotado</h4>
                    <span className="text-[10px] text-zinc-550 mt-1 block">Modelo não identificado automaticamente</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenFipeSearch(lead)}
                    className="py-2 px-3 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary font-bold text-xs transition-all cursor-pointer"
                  >
                    Localizar FIPE
                  </button>
                </div>
              </div>
            )}

            {/* Contact Details */}
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" /> Informações de Contato
              </h4>
              <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 flex flex-col gap-2.5 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>Nome do Cliente</span>
                  <span className="text-zinc-200 font-semibold">{lead.nome || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Telefone</span>
                  <span className="text-zinc-200 font-semibold">{lead.telefone || 'N/A'}</span>
                </div>
                {lead.contato_nome_whatsapp && (
                  <div className="flex justify-between">
                    <span>WhatsApp</span>
                    <span className="text-zinc-200 font-semibold">{lead.contato_nome_whatsapp}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary / Notes */}
            {lead.resumo && (
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Resumo do Lead</h4>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-8 h-8 bg-amber-500/10 rounded-full blur-md" />
                  <p className="text-sm text-amber-200 leading-relaxed italic">
                    "{lead.resumo}"
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-zinc-950 border-t border-zinc-900 px-6 py-5 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSimulate}
            className="flex-1 py-3.5 px-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            Simular Precificação
          </button>
          
          <a
            href={getWhatsAppLink(lead)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3.5 px-5 rounded-xl bg-primary hover:bg-primary/95 text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 border-0 text-center"
          >
            Falar no WhatsApp
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
