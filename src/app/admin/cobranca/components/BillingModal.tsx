import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, User, FileText, Phone, Car, Calendar, DollarSign, Tag, Info } from 'lucide-react';
import { BillingRecord } from '@/types';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: BillingRecord) => Promise<void>;
  recordToEdit: BillingRecord | null;
}

export default function BillingModal({ isOpen, onClose, onSave, recordToEdit }: BillingModalProps) {
  const [formData, setFormData] = useState<Omit<BillingRecord, 'id'>>({
    clienteFornecedor: '',
    cpfCnpj: '',
    telefone: '',
    veiculo: '',
    vencimento: '',
    valor: 0,
    status: 'PENDENTE',
    observacoes: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (recordToEdit) {
      setFormData({
        clienteFornecedor: recordToEdit.clienteFornecedor,
        cpfCnpj: recordToEdit.cpfCnpj,
        telefone: recordToEdit.telefone,
        veiculo: recordToEdit.veiculo,
        vencimento: recordToEdit.vencimento,
        valor: recordToEdit.valor,
        status: recordToEdit.status,
        observacoes: recordToEdit.observacoes || '',
        dataPagamento: recordToEdit.dataPagamento
      });
    } else {
      setFormData({
        clienteFornecedor: '',
        cpfCnpj: '',
        telefone: '',
        veiculo: '',
        vencimento: new Date().toISOString().split('T')[0],
        valor: 0,
        status: 'PENDENTE',
        observacoes: ''
      });
    }
    setError(null);
  }, [recordToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'valor' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.clienteFornecedor.trim()) return setError('O nome do cliente/fornecedor é obrigatório.');
    if (!formData.cpfCnpj.trim()) return setError('O CPF/CNPJ é obrigatório.');
    if (!formData.telefone.trim()) return setError('O telefone de contato é obrigatório.');
    if (!formData.veiculo.trim()) return setError('A descrição do veículo é obrigatória.');
    if (!formData.vencimento) return setError('Selecione uma data de vencimento.');
    if (formData.valor <= 0) return setError('O valor da cobrança deve ser maior do que zero.');

    setSaving(true);
    try {
      const record: BillingRecord = {
        ...formData,
        id: recordToEdit ? recordToEdit.id : `bil-${Date.now()}`,
        dataPagamento: formData.status === 'PAGO' 
          ? (formData.dataPagamento || new Date().toISOString().split('T')[0]) 
          : undefined
      };
      await onSave(record);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao gravar a cobrança no sistema.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#03060b]/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto text-zinc-300 font-sans"
            id="billing-modal-box"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-black text-white">
                  {recordToEdit ? 'Editar Registro de Cobrança' : 'Inserir Novo Faturamento'}
                </h3>
                <p className="text-zinc-400 text-xs mt-1 font-bold">
                  {recordToEdit ? `Modificando faturamento #${recordToEdit.id}` : 'Insira os dados cadastrais e financeiros da venda.'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-350 hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Errors */}
            {error && (
              <div className="mt-4 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs flex items-center gap-2 font-bold">
                <Info className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs font-sans">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cliente / Fornecedor */}
                <div>
                  <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    Cliente / Fornecedor
                  </label>
                  <input
                    type="text"
                    name="clienteFornecedor"
                    value={formData.clienteFornecedor}
                    onChange={handleChange}
                    placeholder="Ex: Alexandre Gorges Raccar"
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all font-bold"
                  />
                </div>

                {/* CPF / CNPJ */}
                <div>
                  <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-zinc-500" />
                    CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    name="cpfCnpj"
                    value={formData.cpfCnpj}
                    onChange={handleChange}
                    placeholder="Ex: 000.000.000-00"
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* TELEFONE */}
                <div>
                  <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-zinc-500" />
                    WhatsApp / Telefone
                  </label>
                  <input
                    type="text"
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleChange}
                    placeholder="Ex: 47991853163"
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all font-mono"
                  />
                </div>

                {/* VEICULO */}
                <div>
                  <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-zinc-500" />
                    Veículo Solicitado
                  </label>
                  <input
                    type="text"
                    name="veiculo"
                    value={formData.veiculo}
                    onChange={handleChange}
                    placeholder="Ex: Fiat Argo Trekking 2023"
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* VENCIMENTO */}
                <div>
                  <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    Vencimento
                  </label>
                  <input
                    type="date"
                    name="vencimento"
                    value={formData.vencimento}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all font-mono"
                  />
                </div>

                {/* VALOR */}
                <div>
                  <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-zinc-500" />
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="valor"
                    value={formData.valor || ''}
                    onChange={handleChange}
                    placeholder="Ex: 1500.00"
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all font-mono"
                  />
                </div>

                {/* STATUS */}
                <div>
                  <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-zinc-500" />
                    Situação Financeira
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all font-bold"
                  >
                    <option value="PENDENTE">Pendente</option>
                    <option value="PAGO">Pago</option>
                    <option value="ATRASADO">Atrasado</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-zinc-500 font-black uppercase tracking-widest mb-1.5">
                  Observações Gerais
                </label>
                <textarea
                  name="observacoes"
                  rows={3}
                  value={formData.observacoes}
                  onChange={handleChange}
                  placeholder="Informações adicionais do contrato ou da renegociação..."
                  className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 focus:border-violet-500/80 rounded-xl text-white focus:outline-none transition-all resize-none text-xs"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-zinc-700/60 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-violet-900/20 transition-all cursor-pointer"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Gravando...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Confirmar Operação
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
