import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Filter, Calendar, DollarSign, Tag, CheckSquare, Square, RefreshCw, Send, AlertTriangle, Info } from 'lucide-react';
import { BillingRecord } from '@/types';

interface BatchFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: BillingRecord[];
  onEnfileirar: (selectedRecords: BillingRecord[], forcedStage: string | null) => Promise<void>;
  loading: boolean;
}

export default function BatchFilterModal({ isOpen, onClose, records, onEnfileirar, loading }: BatchFilterModalProps) {
  // Filter States
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [minVal, setMinVal] = useState('');
  const [maxVal, setMaxVal] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ABERTO' | 'PENDENTE' | 'ATRASADO'>('ABERTO');
  const [stageFilter, setStageFilter] = useState<string>('AUTO'); // 'AUTO' or specific stage

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter records dynamically based on local states
  const filteredRecords = useMemo(() => {
    // Only process PENDENTE or ATRASADO (never PAGO)
    let result = records.filter(r => r.status !== 'PAGO');

    if (statusFilter !== 'ABERTO') {
      result = result.filter(r => r.status === statusFilter);
    }

    if (dateStart) {
      result = result.filter(r => r.vencimento >= dateStart);
    }

    if (dateEnd) {
      result = result.filter(r => r.vencimento <= dateEnd);
    }

    if (minVal) {
      const min = parseFloat(minVal);
      if (!isNaN(min)) {
        result = result.filter(r => r.valor >= min);
      }
    }

    if (maxVal) {
      const max = parseFloat(maxVal);
      if (!isNaN(max)) {
        result = result.filter(r => r.valor <= max);
      }
    }

    return result;
  }, [records, dateStart, dateEnd, minVal, maxVal, statusFilter]);

  // Reset selected ids when filtered list changes
  useEffect(() => {
    setSelectedIds(filteredRecords.map(r => r.id));
  }, [filteredRecords]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map(r => r.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectedRecords = useMemo(() => {
    return filteredRecords.filter(r => selectedIds.includes(r.id));
  }, [filteredRecords, selectedIds]);

  const selectedTotalValue = useMemo(() => {
    return selectedRecords.reduce((acc, r) => acc + r.valor, 0);
  }, [selectedRecords]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
  };

  const getStageLabel = (rec: BillingRecord) => {
    if (stageFilter !== 'AUTO') return stageFilter;

    // Calculate dynamic stage label based on vencimento vs refDate (2026-05-27)
    const refDate = new Date('2026-05-27');
    const dueDate = new Date(rec.vencimento);
    const diffTime = refDate.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === -1) return 'PRE_1_DIA';
    if (diffDays === 0) return 'NO_DIA';
    if (diffDays === 1) return 'POS_1_DIA';
    if (diffDays === 3) return 'POS_3_DIAS';
    if (diffDays === 5) return 'POS_5_DIAS';
    if (diffDays === 10) return 'POS_10_DIAS';
    if (diffDays >= 30) return 'POS_30_DIAS';

    return 'AVULSO / FORA RÈGUA';
  };

  const handleSubmit = async () => {
    if (selectedRecords.length === 0) return;
    const forced = stageFilter === 'AUTO' ? null : stageFilter;
    await onEnfileirar(selectedRecords, forced);
  };

  const cleanFilters = () => {
    setDateStart('');
    setDateEnd('');
    setMinVal('');
    setMaxVal('');
    setStatusFilter('ABERTO');
    setStageFilter('AUTO');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#03060b]/80 backdrop-blur-sm"
          />

          {/* Modal box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.25 }}
            className="relative w-full max-w-5xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl z-10 max-h-[90vh] flex flex-col text-zinc-300 font-sans"
            id="batch-filter-modal-box"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-xl">
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Configurador de Disparo em Lote
                  </h3>
                  <p className="text-zinc-400 text-xs mt-0.5 font-bold">
                    Filtre faturamentos por data, valor e status para programar a fila anti-ban de disparos.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-350 hover:bg-zinc-850 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content body layout */}
            <div className="flex flex-col lg:flex-row gap-6 mt-5 overflow-hidden flex-1">
              
              {/* Left controls panel (Filters) */}
              <div className="w-full lg:w-80 shrink-0 space-y-4 overflow-y-auto pr-2 border-r border-zinc-850">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-450 text-[10px] font-black uppercase tracking-widest">Controles de Filtro</span>
                  <button 
                    onClick={cleanFilters}
                    className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                  >
                    Limpar Filtros
                  </button>
                </div>

                {/* Vencimento */}
                <div className="space-y-2">
                  <label className="block text-zinc-500 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    Período de Vencimento
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                      type="date"
                      value={dateStart}
                      onChange={e => setDateStart(e.target.value)}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker();
                        } catch (err) {}
                      }}
                      className="w-full px-2 py-1.5 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white rounded-lg focus:outline-none focus:border-violet-500/80 font-mono cursor-pointer"
                    />
                    <input
                      type="date"
                      value={dateEnd}
                      onChange={e => setDateEnd(e.target.value)}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker();
                        } catch (err) {}
                      }}
                      className="w-full px-2 py-1.5 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white rounded-lg focus:outline-none focus:border-violet-500/80 font-mono cursor-pointer"
                    />
                  </div>
                </div>

                {/* Faixa de Valor */}
                <div className="space-y-2">
                  <label className="block text-zinc-500 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-zinc-500" />
                    Faixa de Valor (R$)
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                      type="number"
                      placeholder="Mínimo"
                      value={minVal}
                      onChange={e => setMinVal(e.target.value)}
                      className="w-full px-2 py-1.5 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white rounded-lg focus:outline-none focus:border-violet-500/80 font-mono"
                    />
                    <input
                      type="number"
                      placeholder="Máximo"
                      value={maxVal}
                      onChange={e => setMaxVal(e.target.value)}
                      className="w-full px-2 py-1.5 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white rounded-lg focus:outline-none focus:border-violet-500/80 font-mono"
                    />
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <label className="block text-zinc-500 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-zinc-500" />
                    Situação Financeira
                  </label>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-850 text-white rounded-lg focus:outline-none focus:border-violet-500/80 text-xs font-bold"
                  >
                    <option value="ABERTO">Todos em Aberto (Pendente/Atrasado)</option>
                    <option value="PENDENTE">Apenas Pendentes (A vencer)</option>
                    <option value="ATRASADO">Apenas Atrasados (Vencidos)</option>
                  </select>
                </div>

                {/* Forced Stage */}
                <div className="space-y-2">
                  <label className="block text-zinc-500 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-violet-400" />
                    Estágio da Régua
                  </label>
                  <select
                    value={stageFilter}
                    onChange={e => setStageFilter(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-850 text-white rounded-lg focus:outline-none focus:border-violet-500/80 text-xs font-bold"
                  >
                    <option value="AUTO">Automático por Vencimento (Recomendado)</option>
                    <option value="PRE_1_DIA">1 Dia Antes (PRE_1_DIA)</option>
                    <option value="NO_DIA">No Vencimento (NO_DIA)</option>
                    <option value="POS_1_DIA">1 Dia Atrasado (POS_1_DIA)</option>
                    <option value="POS_3_DIAS">3 Dias Atrasados (POS_3_DIAS)</option>
                    <option value="POS_5_DIAS">5 Dias Atrasados (POS_5_DIAS)</option>
                    <option value="POS_10_DIAS">10 Dias Atrasados (POS_10_DIAS)</option>
                    <option value="POS_30_DIAS">30 Dias Atrasados (POS_30_DIAS)</option>
                  </select>
                </div>

                <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-xl text-[10.5px] leading-relaxed text-zinc-400">
                  <Info className="w-4 h-4 text-violet-400 mb-1" />
                  No modo <strong>Automático</strong>, o CRM calcula o estágio baseado nas datas de vencimento de cada cliente em relação à data base. Se selecionar um estágio fixo, <strong>todos</strong> os selecionados receberão a mensagem daquele estágio.
                </div>
              </div>

              {/* Right preview grid list */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                  <div className="text-zinc-450 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    Prévia dos Resultados
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded font-mono text-[9px]">
                      {filteredRecords.length} Encontrados
                    </span>
                  </div>
                  <button
                    onClick={handleToggleSelectAll}
                    className="text-[10px] text-violet-400 hover:text-violet-300 font-bold flex items-center gap-1"
                  >
                    {selectedIds.length === filteredRecords.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </button>
                </div>

                {/* Table container */}
                <div className="flex-1 border border-zinc-850 bg-zinc-950/20 rounded-2xl overflow-y-auto scrollbar-thin">
                  {filteredRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                      <AlertTriangle className="w-8 h-8 text-zinc-750 mb-2" />
                      <p className="text-xs font-bold text-zinc-450">Nenhum faturamento bate com os filtros definidos.</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">Ajuste os valores ou datas no painel lateral.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-950/60 text-zinc-500 border-b border-zinc-850 font-bold sticky top-0 z-10">
                          <th className="p-3 w-10 text-center"></th>
                          <th className="p-3">Cliente</th>
                          <th className="p-3">Veículo</th>
                          <th className="p-3">Vencimento</th>
                          <th className="p-3 text-right">Valor</th>
                          <th className="p-3 text-center">Estágio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850/45">
                        {filteredRecords.map(rec => {
                          const isSelected = selectedIds.includes(rec.id);
                          const stage = getStageLabel(rec);
                          return (
                            <tr
                              key={rec.id}
                              onClick={() => handleToggleSelectRow(rec.id)}
                              className={`hover:bg-zinc-800/10 cursor-pointer transition-colors ${isSelected ? 'bg-violet-950/5' : ''}`}
                            >
                              <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => handleToggleSelectRow(rec.id)}
                                  className="text-zinc-500 hover:text-white transition cursor-pointer"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-violet-500" />
                                  ) : (
                                    <Square className="w-4 h-4 text-zinc-650" />
                                  )}
                                </button>
                              </td>
                              <td className="p-3 font-bold text-zinc-200 truncate max-w-[140px] uppercase">
                                {rec.clienteFornecedor}
                              </td>
                              <td className="p-3 text-zinc-450 truncate max-w-[140px]">
                                {rec.veiculo}
                              </td>
                              <td className="p-3 font-mono text-zinc-400">
                                {formatDate(rec.vencimento)}
                              </td>
                              <td className="p-3 text-right font-mono font-black text-sky-400">
                                {formatCurrency(rec.valor)}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black border uppercase tracking-wider ${
                                  stage.startsWith('POS') 
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                    : stage.startsWith('PRE') 
                                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                  {stage.replace('POS_', '').replace('PRE_', '')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>

            {/* Bottom summary and action strip */}
            <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-5 text-xs text-zinc-450 font-bold self-start sm:self-auto">
                <div>
                  Selecionados: <strong className="text-white">{selectedRecords.length}</strong> de {filteredRecords.length}
                </div>
                <div className="text-zinc-800">|</div>
                <div>
                  Total a Enfileirar: <strong className="text-sky-400">{formatCurrency(selectedTotalValue)}</strong>
                </div>
              </div>

              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2 border border-zinc-700/60 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={selectedRecords.length === 0 || loading}
                  className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-violet-900/20 transition-all cursor-pointer disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Enfileirando...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Agendar {selectedRecords.length} Cobranças
                    </>
                  )}
                </button>
              </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
