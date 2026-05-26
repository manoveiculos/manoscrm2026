import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface Opportunity {
  id: string;
  brand: string;
  model: string;
  year_model: number;
  km: number;
  ask_price: number;
  fipe_price: number;
  fipe_price_official: number | null;
  posted_at: string;
  location: string | null;
  grupo_anuncio: string;
}

interface InterestModalProps {
  isOpen: boolean;
  onClose: () => void;
  opp: Opportunity | null;
}

export const InterestModal: React.FC<InterestModalProps> = ({ isOpen, onClose, opp }) => {
  const [customerName, setCustomerName] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !opp) return null;

  const formatPhoneNumber = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 3) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2)}`;
    }
    return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2, 7)}-${phoneNumber.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerPhone(formatPhoneNumber(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerCity || !customerPhone) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const refFipe = opp.fipe_price_official || opp.fipe_price || 0;
      const formattedFipe = refFipe.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
      const formattedAsk = opp.ask_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

      const res = await fetch('/api/compras/interesse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome_cliente: customerName,
          telefone_cliente: customerPhone,
          cidade_cliente: customerCity,
          veiculo: `${opp.brand} ${opp.model} (${opp.year_model}) - KM: ${opp.km.toLocaleString('pt-BR')} - Preço: ${formattedAsk} (FIPE: ${formattedFipe})`,
          grupo_anuncio: opp.grupo_anuncio || 'Grupo de Repasse',
          data_anuncio: opp.posted_at,
          cidade_anuncio: opp.location,
          oportunidade_id: opp.id
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao enviar interesse.');
      }

      setSuccess(true);
      setCustomerName('');
      setCustomerCity('');
      setCustomerPhone('');
    } catch (err: any) {
      setError(err.message || 'Falha ao registrar interesse. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-[#0c0c0f] border border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative">
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-500 hover:text-white transition-colors p-2 bg-zinc-900 border border-zinc-850 rounded-xl"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 md:p-8 flex flex-col gap-5">
          <div>
            <h3 className="font-extrabold text-white text-lg">Estou Interessado</h3>
            <p className="text-xs text-zinc-400 mt-1">Preencha os dados do comprador para enviar o alerta ao n8n.</p>
          </div>

          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 text-xs">
            <span className="text-zinc-500 font-bold uppercase tracking-wider block">Veículo Selecionado</span>
            <span className="font-extrabold text-white text-sm block mt-1.5">{opp.brand} {opp.model} ({opp.year_model})</span>
            <span className="text-primary font-black text-base block mt-1">
              {opp.ask_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            </span>
          </div>

          {success ? (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center flex flex-col items-center gap-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <div>
                <h4 className="font-bold text-white text-base">Interesse Registrado!</h4>
                <p className="text-xs text-zinc-400 mt-1">Os dados de interesse do cliente foram enviados com sucesso.</p>
              </div>
              <button 
                type="button" 
                onClick={onClose} 
                className="mt-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-xs font-bold text-white transition-all cursor-pointer"
              >
                Fechar Modal
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Nome do Comprador *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-900 focus:border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">WhatsApp *</label>
                  <input
                    type="text"
                    required
                    placeholder="(47) 99999-9999"
                    value={customerPhone}
                    onChange={handlePhoneChange}
                    className="w-full bg-zinc-950 border border-zinc-900 focus:border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cidade do Comprador *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Tijucas - SC"
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 focus:border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 group cursor-pointer glow-primary glow-primary-hover disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  'Confirmar e Registrar Interesse'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
