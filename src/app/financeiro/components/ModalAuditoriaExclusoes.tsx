'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, History, X, RefreshCw, Undo2, AlertCircle, Calendar, User } from 'lucide-react';
import { FinLancamentoAudit } from '@/lib/financeiro/types';
import { brl } from '@/lib/financeiro/format';

interface ModalAuditoriaExclusoesProps {
  aberto: boolean;
  onFechar: () => void;
  onItemRestaurado?: () => void;
}

export function ModalAuditoriaExclusoes({
  aberto,
  onFechar,
  onItemRestaurado,
}: ModalAuditoriaExclusoesProps) {
  const [logs, setLogs] = useState<FinLancamentoAudit[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;

    async function carregarLogs() {
      setCarregando(true);
      try {
        const res = await fetch('/api/financeiro/auditoria');
        const data = await res.json();
        if (data.success) {
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Erro ao carregar auditoria:', err);
      } finally {
        setCarregando(false);
      }
    }
    carregarLogs();
  }, [aberto]);

  if (!aberto) return null;

  async function handleRestaurar(lancamentoId: string) {
    if (!confirm('Deseja restaurar este lançamento de volta para o caixa ativo?')) return;

    setRestaurandoId(lancamentoId);
    try {
      const res = await fetch('/api/financeiro/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lancamentoId, motivo: 'Restauração solicitada pelo usuário' }),
      });
      const data = await res.json();
      if (data.success) {
        setMensagemSucesso('Lançamento restaurado com sucesso!');
        setTimeout(() => setMensagemSucesso(null), 3000);
        // Atualiza logs
        const resLogs = await fetch('/api/financeiro/auditoria');
        const dataLogs = await resLogs.json();
        if (dataLogs.success) setLogs(dataLogs.logs || []);
        if (onItemRestaurado) onItemRestaurado();
      } else {
        alert(data.error || 'Erro ao restaurar');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao restaurar');
    } finally {
      setRestaurandoId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl text-white my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Log de Auditoria & Exclusões
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Transparência 100%
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Histórico imutável de exclusões, baixas e alterações para segurança mútua
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

        {/* Mensagem de sucesso */}
        {mensagemSucesso && (
          <div className="m-4 mb-0 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>{mensagemSucesso}</span>
          </div>
        )}

        {/* Lista de Registros de Auditoria */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {carregando ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
              <p className="text-xs">Carregando logs de auditoria...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-1">
              <ShieldCheck className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-400">Nenhum registro de exclusão encontrado.</p>
              <p className="text-xs">Todos os lançamentos do sistema estão íntegros e preservados.</p>
            </div>
          ) : (
            logs.map((log) => {
              const snapshot = log.dados_snapshot || {};
              const desc = snapshot.descricao || snapshot.anterior?.descricao || 'Sem descrição';
              const val = snapshot.valor || snapshot.anterior?.valor || 0;
              const tipo = snapshot.tipo || snapshot.anterior?.tipo || 'saida';
              const dt = snapshot.data || snapshot.anterior?.data || '';
              const quem = log.executado_por?.includes('ledra') ? 'Felipe Ledra' : 'Alexandre Gorges';

              return (
                <div
                  key={log.id}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs hover:border-slate-700 transition"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.acao === 'exclusao'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : log.acao === 'restauracao'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {log.acao === 'exclusao'
                          ? '🗑️ Exclusão'
                          : log.acao === 'restauracao'
                          ? '♻️ Restauração'
                          : '⚡ Baixa'}
                      </span>

                      <span className="text-slate-400 flex items-center gap-1 font-mono text-[11px]">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </span>

                      <span className="text-slate-300 font-semibold flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        Por: <strong className="text-white">{quem}</strong> ({log.executado_por})
                      </span>
                    </div>

                    <p className="text-sm font-bold text-white pt-1">
                      {desc}
                      <span className={`ml-2 text-xs font-bold ${tipo === 'entrada' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {brl(val)}
                      </span>
                    </p>

                    <p className="text-slate-400 text-xs">
                      <span className="text-amber-400 font-medium">Motivo:</span> "{log.motivo}"
                      {dt && <span className="text-slate-500 ml-2">• Data de competência: {dt}</span>}
                    </p>
                  </div>

                  {log.acao === 'exclusao' && (
                    <div className="flex-shrink-0 pt-2 md:pt-0">
                      <button
                        type="button"
                        disabled={restaurandoId === log.lancamento_id}
                        onClick={() => handleRestaurar(log.lancamento_id)}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        {restaurandoId === log.lancamento_id ? 'Restaurando...' : 'Restaurar'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-500">
          <span>Logs protegidos por Row Level Security no Supabase</span>
          <button
            onClick={onFechar}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
