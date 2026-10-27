'use client';

import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X, Trash2, CheckCircle2 } from 'lucide-react';
import { FinLancamento } from '@/lib/financeiro/types';
import { brl, dataBR } from '@/lib/financeiro/format';

interface ModalConfirmarExclusaoProps {
  aberto: boolean;
  lancamento: FinLancamento | null;
  onFechar: () => void;
  onConfirmar: (id: string, motivo: string) => Promise<boolean>;
}

const MOTIVOS_SUGERIDOS = [
  'Lançamento duplicado',
  'Valor digitado incorretamente',
  'Transação cancelada / estornada',
  'Erro de categoria ou conta',
  'Lançamento de teste',
];

export function ModalConfirmarExclusao({
  aberto,
  lancamento,
  onFechar,
  onConfirmar,
}: ModalConfirmarExclusaoProps) {
  const [motivo, setMotivo] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto || !lancamento) return null;

  async function handleConfirmar() {
    if (!motivo.trim() || motivo.trim().length < 3) {
      setErro('Por favor, informe o motivo da exclusão (mínimo de 3 caracteres).');
      return;
    }

    setExcluindo(true);
    setErro(null);

    const ok = await onConfirmar(lancamento!.id, motivo.trim());
    setExcluindo(false);
    if (ok) {
      setMotivo('');
      onFechar();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-lg shadow-2xl text-white my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Topo de Alerta de Segurança */}
        <div className="bg-rose-500/10 border-b border-rose-500/20 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Confirmar Exclusão com Auditoria</h3>
              <p className="text-xs text-rose-300">
                Log permanente de segurança para Alexandre e Ledra
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-4">
          {/* Card do Lançamento a ser apagado */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Data: <strong className="text-white">{dataBR(lancamento.data)}</strong></span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                lancamento.tipo === 'entrada'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {lancamento.tipo === 'entrada' ? 'Entrada' : 'Saída'}
              </span>
            </div>
            <p className="text-sm font-semibold text-white">{lancamento.descricao}</p>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-xs text-slate-400">Valor da movimentação:</span>
              <span className={`text-base font-black ${lancamento.tipo === 'entrada' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {brl(lancamento.valor)}
              </span>
            </div>
          </div>

          {/* Aviso de Transparência */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Segurança compartilhada:</strong> Este lançamento não será apagado sem rastro. Ele ficará arquivado e registrado no <strong>Log de Auditoria</strong> com seu nome, horário e o motivo informado abaixo, visível para ambos os sócios.
            </div>
          </div>

          {/* Campo de Motivo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Motivo da Exclusão <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={2}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (erro) setErro(null);
              }}
              placeholder="Ex: Lançamento duplicado pelo app do banco / Nota cancelada..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
            />

            {/* Pílulas de Sugestão */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[10px] text-slate-500">Sugestões rápidas:</span>
              {MOTIVOS_SUGERIDOS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setMotivo(sug)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 transition"
                >
                  {sug}
                </button>
              ))}
            </div>

            {erro && <p className="text-xs text-rose-400 mt-2 font-medium">{erro}</p>}
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onFechar}
            disabled={excluindo}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={excluindo}
            onClick={handleConfirmar}
            className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-rose-950/40 transition"
          >
            <Trash2 className="w-4 h-4" />
            {excluindo ? 'Gravando Log e Excluindo...' : 'Confirmar Exclusão'}
          </button>
        </div>
      </div>
    </div>
  );
}
