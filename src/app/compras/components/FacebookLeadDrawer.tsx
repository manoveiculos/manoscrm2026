'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, Trash2, Clock, Calculator, User, X, 
  MessageCircle, Copy, CheckCheck, Phone, MapPin,
  Tag, Gauge, Calendar, TrendingDown, AlertCircle
} from 'lucide-react';
import { FacebookLead } from './FacebookTab';

interface FacebookLeadDrawerProps {
  lead: FacebookLead | null;
  onClose: () => void;
  onOpenFipeSearch: (lead: FacebookLead) => void;
  onDelete: (lead: FacebookLead) => void;
  onNavigateToTab?: (tab: string, params?: any) => void;
  onUpdateLead: (updated: FacebookLead) => void;
  userEmail?: string | null;
  role?: 'admin' | 'consultant';
}

export default function FacebookLeadDrawer({
  lead,
  onClose,
  onOpenFipeSearch,
  onDelete,
  onNavigateToTab,
  onUpdateLead,
  userEmail,
  role
}: FacebookLeadDrawerProps) {
  const [msgCopied, setMsgCopied] = useState(false);
  const [statusNegociacao, setStatusNegociacao] = useState('PENDENTE');
  const [observacaoNegociacao, setObservacaoNegociacao] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setStatusNegociacao(lead.status_negociacao || 'PENDENTE');
      setObservacaoNegociacao(lead.observacao_negociacao || '');
    }
  }, [lead]);

  const handleSaveNegotiation = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/compras/facebook?admin_key=manos_intel_secret_key`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mensagem_id: lead.mensagem_id,
          status_negociacao: statusNegociacao,
          observacao_negociacao: observacaoNegociacao
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onUpdateLead({
          ...lead,
          status_negociacao: statusNegociacao,
          observacao_negociacao: observacaoNegociacao
        });
        alert('Acompanhamento salvo com sucesso!');
      } else {
        alert(data.error || 'Erro ao salvar o acompanhamento.');
      }
    } catch (err) {
      console.error(err);
      alert('Falha ao conectar com o servidor para salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (!lead) return null;

  const getWhatsAppNumber = (l: FacebookLead) => {
    if (!l.telefone) return null;
    const clean = l.telefone.replace(/[^\d]/g, '');
    return (clean.length === 10 || clean.length === 11) ? `55${clean}` : clean;
  };

  const getWhatsAppMessage = (l: FacebookLead) =>
    `Olá ${l.nome || ''}, tudo bem? Aqui é o Felipe Ledra da Manos Veículos! 🚗\n\nRecebemos o seu contato em nosso anúncio demonstrando interesse em avaliar o seu veículo (*${l.veiculo || ''}*).\n\nPoderia me confirmar alguns detalhes dele para eu formular a melhor proposta?\n- Quilometragem atual;\n- Se possui algum detalhe de lataria ou mecânico;\n- E se puder, me envie algumas fotos dele por aqui.\n\nFico no aguardo!`;

  const waNumber = getWhatsAppNumber(lead);
  const waMessage = getWhatsAppMessage(lead);
  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}` : '#';

  const handleCopyMsg = () => {
    navigator.clipboard.writeText(waMessage).then(() => {
      setMsgCopied(true);
      setTimeout(() => setMsgCopied(false), 2500);
    });
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

  const fipePercent = lead.fipe_pct !== null ? lead.fipe_pct - 100 : null;
  const fipeBadgeColor = fipePercent !== null
    ? fipePercent <= -15 ? 'text-lime-400 bg-lime-500/10 border-lime-500/20'
    : fipePercent <= -5  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : fipePercent <= 5   ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-red-400 bg-red-500/10 border-red-500/20'
    : '';

  return (
    <div 
      className="fixed top-[120px] left-0 right-0 bottom-0 bg-black/70 backdrop-blur-md z-[100] flex items-start justify-center"
      onClick={onClose}
    >
      <div 
        className="w-full h-full max-w-3xl bg-[#07090f] flex flex-col overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)] border-x border-zinc-800/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="shrink-0 bg-zinc-900/70 border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Oferta Exclusiva</p>
              <h2 className="text-base font-extrabold text-white leading-tight truncate">{lead.veiculo}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {role === 'admin' && (
              <button
                onClick={() => onDelete(lead)}
                className="p-2 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 hover:border-red-700 rounded-xl transition-all text-red-500 hover:text-red-300"
                title="Excluir lead"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl transition-all text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── SCROLLABLE CONTENT ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-0 h-full">
            
            {/* LEFT COLUMN — info */}
            <div className="p-6 flex flex-col gap-5 border-r border-zinc-800/40">

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg uppercase tracking-wider">
                  {lead.origem || 'Exclusiva'}
                </span>
                {lead.aceita_fipe?.trim().toLowerCase() === 'sim' && (
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg uppercase tracking-wider">
                    ✓ Aceita FIPE
                  </span>
                )}
                {fipePercent !== null && (
                  <span className={`text-[9px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider border ${fipeBadgeColor}`}>
                    {fipePercent > 0 ? `+${fipePercent}%` : `${fipePercent}%`} FIPE
                  </span>
                )}
              </div>

              {/* Data grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Calendar className="w-3.5 h-3.5 text-zinc-500" />, label: 'Ano Modelo', value: lead.ano || 'N/A' },
                  { icon: <Gauge className="w-3.5 h-3.5 text-zinc-500" />, label: 'Quilometragem', value: lead.km ? `${lead.km} km` : 'N/A' },
                  { icon: <Tag className="w-3.5 h-3.5 text-zinc-500" />, label: 'Valor Pedido', value: lead.valor_pedido || 'N/A', highlight: true },
                  { icon: <MapPin className="w-3.5 h-3.5 text-zinc-500" />, label: 'Cidade', value: lead.cidade || 'N/A' },
                ].map(({ icon, label, value, highlight }) => (
                  <div key={label} className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-3.5 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">{icon}<span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span></div>
                    <span className={`text-sm font-bold ${highlight ? 'text-white' : 'text-zinc-200'}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* FIPE */}
              <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Avaliação FIPE Oficial</span>
                  {lead.deal_score !== null && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                      lead.deal_score >= 85 ? 'bg-lime-500/10 border-lime-500/20 text-lime-400'
                      : lead.deal_score >= 70 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : lead.deal_score >= 50 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      Score {lead.deal_score}
                    </span>
                  )}
                </div>
                {lead.fipe_price ? (
                  <div>
                    <p className="text-xl font-black text-white">
                      {lead.fipe_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{lead.fipe_model}</p>
                    {lead.fipe_code && <p className="text-[9px] text-zinc-600 mt-0.5">Cód: {lead.fipe_code}</p>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs">Modelo não identificado</span>
                    </div>
                    <button
                      onClick={() => onOpenFipeSearch(lead)}
                      className="py-1.5 px-3 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary font-bold text-xs transition-all cursor-pointer whitespace-nowrap"
                    >
                      Localizar FIPE
                    </button>
                  </div>
                )}
              </div>

              {/* Resumo */}
              {lead.resumo && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-[9px] font-bold text-amber-500/70 uppercase tracking-wider mb-2">Resumo do Lead</p>
                  <p className="text-sm text-amber-200/80 leading-relaxed italic">"{lead.resumo}"</p>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN — contato + WhatsApp */}
            <div className="p-6 flex flex-col gap-5">

              {/* Contato */}
              <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Informações de Contato</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 text-xs">Nome</span>
                  <span className="text-white font-bold">{lead.nome || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 text-xs flex items-center gap-1"><Phone className="w-3 h-3" />Telefone</span>
                  <span className="text-white font-bold font-mono">
                    {userEmail?.toLowerCase() === 'ivo@acesso.com' || userEmail?.toLowerCase() === 'paulo@manoscrm.com' ? 'Telefone Ocultado' : (lead.telefone || 'N/A')}
                  </span>
                </div>
                {lead.contato_nome_whatsapp && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500 text-xs">WhatsApp</span>
                    <span className="text-zinc-200 font-semibold">{lead.contato_nome_whatsapp}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 text-xs flex items-center gap-1"><Clock className="w-3 h-3" />Recebido</span>
                  <span className="text-zinc-300 text-xs">{lead.data_envio_formatada}</span>
                </div>
              </div>

              {/* Acompanhamento da Negociação */}
              <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Acompanhamento da Negociação</span>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Status da Negociação</label>
                  <select
                    value={statusNegociacao}
                    onChange={(e) => setStatusNegociacao(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2.5 text-zinc-300 text-xs focus:outline-none focus:border-zinc-700 cursor-pointer"
                  >
                    <option value="PENDENTE">PENDENTE / SEM CONTATO</option>
                    <option value="EM_NEGOCIACAO">EM NEGOCIAÇÃO</option>
                    <option value="CHAMAR_FUTURO">CHAMAR NO FUTURO</option>
                    <option value="DESCARTADO">DESCARTADO</option>
                    <option value="COMPRADO">COMPRADO</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Observações / Anotações</label>
                  <textarea
                    value={observacaoNegociacao}
                    onChange={(e) => setObservacaoNegociacao(e.target.value)}
                    placeholder="Ex: Chamar semana que vem, quer FIPE..."
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-xl p-3 text-zinc-350 text-xs focus:outline-none focus:border-zinc-700 resize-none font-sans"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveNegotiation}
                  disabled={saving}
                  className="w-full mt-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-zinc-850 disabled:text-zinc-600 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Salvar Acompanhamento'}
                </button>
              </div>

              {/* Mensagem WhatsApp */}
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Mensagem de Primeiro Contato</span>
                  </div>
                  <button
                    onClick={handleCopyMsg}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded-lg transition-all"
                  >
                    {msgCopied ? <><CheckCheck className="w-3 h-3 text-emerald-400" />Copiado!</> : <><Copy className="w-3 h-3" />Copiar</>}
                  </button>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans flex-1 min-h-[200px]">
                  {waMessage}
                </div>
              </div>

              {/* Ações */}
              <div className="flex flex-col gap-3 shrink-0">
                {userEmail?.toLowerCase() === 'ivo@acesso.com' || userEmail?.toLowerCase() === 'paulo@manoscrm.com' ? (
                  <div className="w-full py-4 px-6 rounded-2xl bg-zinc-800 text-zinc-500 font-extrabold text-sm flex items-center justify-center gap-2.5 cursor-not-allowed">
                    <Phone className="w-5 h-5" />
                    WhatsApp Bloqueado
                  </div>
                ) : waNumber ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 px-6 rounded-2xl bg-[#25D366] hover:bg-[#20c05c] text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-emerald-900/30 active:scale-[0.98]"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Chamar no WhatsApp
                  </a>
                ) : (
                  <div className="w-full py-4 px-6 rounded-2xl bg-zinc-800 text-zinc-500 font-extrabold text-sm flex items-center justify-center gap-2.5 cursor-not-allowed">
                    <Phone className="w-5 h-5" />
                    Sem telefone cadastrado
                  </div>
                )}
                <button
                  onClick={handleSimulate}
                  className="w-full py-3 px-6 rounded-2xl border border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Calculator className="w-4 h-4" />
                  Simular Precificação
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
