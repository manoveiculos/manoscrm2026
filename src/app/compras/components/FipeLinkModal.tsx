'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { FacebookLead } from './FacebookTab';

interface FipeLinkModalProps {
  isOpen: boolean;
  lead: FacebookLead | null;
  onClose: () => void;
  onLinked: (updatedLead: any) => void;
}

export default function FipeLinkModal({ isOpen, lead, onClose, onLinked }: FipeLinkModalProps) {
  const [fipeSearchQuery, setFipeSearchQuery] = useState('');
  const [fipeSearchResults, setFipeSearchResults] = useState<any[]>([]);
  const [fipeSearching, setFipeSearching] = useState(false);
  const [fipeLinking, setFipeLinking] = useState(false);
  const [fipeSearchError, setFipeSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      const parts = lead.veiculo.trim().split(/\s+/);
      const initialQuery = parts.slice(1).join(' ') || lead.veiculo;
      setFipeSearchQuery(initialQuery);
      setFipeSearchResults([]);
      setFipeSearchError(null);

      const brand = parts[0] || '';
      const year = lead.ano ? lead.ano.replace(/[^\d]/g, '').slice(0, 4) : '';
      if (brand && initialQuery && year) {
        triggerFipeSearch(brand, initialQuery, year);
      }
    }
  }, [lead]);

  const triggerFipeSearch = async (brand: string, query: string, year: string) => {
    setFipeSearching(true);
    setFipeSearchError(null);
    try {
      const res = await fetch(
        `/api/compras/avaliacao?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(query)}&year_model=${year}&km=80000`
      );
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao pesquisar modelos FIPE.');
      }

      if (data.isCorrectionSuggested && data.suggestion) {
        const nextRes = await fetch(
          `/api/compras/avaliacao?brand=${encodeURIComponent(data.suggestion.brand)}&model=${encodeURIComponent(data.suggestion.model)}&year_model=${year}&km=80000`
        );
        const nextData = await nextRes.json();
        if (nextData.hasMultipleMatches) {
          setFipeSearchResults(nextData.options || []);
        } else if (nextData.fipe) {
          setFipeSearchResults([nextData.fipe]);
        } else {
          setFipeSearchResults([]);
        }
      } else if (data.hasMultipleMatches) {
        setFipeSearchResults(data.options || []);
      } else if (data.fipe) {
        setFipeSearchResults([data.fipe]);
      } else {
        setFipeSearchResults([]);
      }
    } catch (err: any) {
      setFipeSearchError(err.message || 'Falha ao buscar modelos na FIPE.');
    } finally {
      setFipeSearching(false);
    }
  };

  const handleLinkFipeCode = async (fCode: string) => {
    if (!lead) return;
    setFipeLinking(true);
    setFipeSearchError(null);
    
    // Formata o código FIPE
    let cleanCode = fCode.replace(/[^\d]/g, '');
    if (cleanCode.length === 7) {
      cleanCode = `${cleanCode.substring(0, 6)}-${cleanCode.substring(6)}`;
    }

    try {
      const res = await fetch('/api/compras/facebook/vincular-fipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem_id: lead.mensagem_id,
          fipe_code: cleanCode
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao vincular código FIPE.');
      }

      onLinked(data.lead);
      onClose();
    } catch (err: any) {
      setFipeSearchError(err.message || 'Erro ao registrar vínculo da FIPE no banco.');
    } finally {
      setFipeLinking(false);
    }
  };

  if (!isOpen || !lead) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="glass-panel border border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-zinc-950/90 border-b border-zinc-900 px-6 py-5 flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary animate-pulse-soft" /> Localizar FIPE Oficial
            </h3>
            <p className="text-xs text-zinc-400 mt-1">Busque a versão exata do veículo anunciado.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 rounded-xl transition-all text-zinc-400 hover:text-white text-xs font-bold cursor-pointer"
          >
            Fechar
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-1.5">
            <span className="text-[10px] text-zinc-550 uppercase font-bold tracking-widest">Veículo do Anúncio</span>
            <span className="text-white font-extrabold text-base">{lead.veiculo}</span>
            <div className="flex gap-4 text-xs text-zinc-400 mt-1">
              <span>Ano: <strong>{lead.ano}</strong></span>
              <span>KM: <strong>{lead.km}</strong></span>
              <span>Preço Pedido: <strong>{lead.valor_pedido}</strong></span>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Modelo (ex: Tracker 1.0, Uno Way)"
              value={fipeSearchQuery}
              onChange={(e) => setFipeSearchQuery(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-800 transition-colors"
            />
            <button
              type="button"
              disabled={fipeSearching || !fipeSearchQuery.trim()}
              onClick={() => {
                const brand = lead.veiculo.trim().split(/\s+/)[0] || '';
                const year = lead.ano ? lead.ano.replace(/[^\d]/g, '').slice(0, 4) : '';
                triggerFipeSearch(brand, fipeSearchQuery, year);
              }}
              className="px-5 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {fipeSearching ? 'Buscando...' : 'Pesquisar'}
            </button>
          </div>

          {fipeSearchError && (
            <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{fipeSearchError}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Selecione a Versão Correta</span>
            
            {fipeSearching ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-center">
                <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <span className="text-xs text-zinc-550">Consultando base FIPE...</span>
              </div>
            ) : fipeSearchResults.length === 0 ? (
              <div className="py-8 text-center bg-zinc-900/10 border border-dashed border-zinc-900 rounded-2xl">
                <span className="text-xs text-zinc-550 italic">Pesquise o modelo acima para carregar as versões da FIPE.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                {fipeSearchResults.map((opt) => {
                  const price = opt.fipe_price_official || (opt.Valor ? Number(opt.Valor.replace(/[^\d]/g, '')) / 100 : 0);
                  const fCode = opt.fipe_code || opt.CodigoFipe;
                  return (
                    <div
                      key={fCode}
                      className="p-3.5 rounded-xl border border-zinc-900 bg-zinc-950/40 flex justify-between items-center text-left hover:border-zinc-800 transition-colors"
                    >
                      <div className="max-w-[70%]">
                        <span className="font-bold text-xs text-zinc-200 block leading-tight">{opt.model_official || opt.Modelo}</span>
                        <span className="text-[9px] text-zinc-500 block mt-1">FIPE: {fCode}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-2">
                        <span className="text-xs font-black text-emerald-400">
                          {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                        </span>
                        <button
                          type="button"
                          disabled={fipeLinking}
                          onClick={() => handleLinkFipeCode(fCode)}
                          className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/95 text-white font-extrabold text-[10px] transition-colors cursor-pointer border-0"
                        >
                          Vincular
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
