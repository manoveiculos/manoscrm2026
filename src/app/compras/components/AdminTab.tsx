'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, Trash2, ShieldAlert, Search, AlertOctagon, 
  Loader2, RefreshCw, Check, X, ChevronLeft, ChevronRight, Bell
} from 'lucide-react';

interface DBStat {
  key: string;
  name: string;
  count: number;
  active: boolean;
  error?: string;
}

interface RepasseItem {
  id: string;
  marca: string;
  modelo: string;
  ano_modelo: string;
  km: number;
  preco_pedido: number;
  preco_fipe: number;
  nome_anunciante: string | null;
  numero_anunciante: string | null;
  data_hora_recebimento: string;
}

interface AlertaItem {
  id: string;
  nome_cliente: string;
  telefone_cliente: string;
  marca: string;
  modelo: string;
  valor_maximo: number | null;
  ativo: boolean;
  criado_em: string;
}

export default function AdminTab() {
  const [stats, setStats] = useState<DBStat[]>([]);
  const [repasses, setRepasses] = useState<RepasseItem[]>([]);
  const [alertas, setAlertas] = useState<AlertaItem[]>([]);
  
  const [statsLoading, setStatsLoading] = useState(false);
  const [repassesLoading, setRepassesLoading] = useState(false);
  const [alertasLoading, setAlertasLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 10;

  const [deleteSingleModal, setDeleteSingleModal] = useState<{ open: boolean; item: RepasseItem | null }>({ open: false, item: null });
  const [deleteAlertaModal, setDeleteAlertaModal] = useState<{ open: boolean; item: AlertaItem | null }>({ open: false, item: null });
  const [deleteMassModal, setDeleteMassModal] = useState<{ open: boolean; tableKey: string; tableName: string }>({ open: false, tableKey: '', tableName: '' });
  const [confirmWord, setConfirmWord] = useState('');

  const [actionExecuting, setActionExecuting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadAllData = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/compras/admin?admin_key=manos_intel_secret_key');
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats || []);
      }
    } catch (err) {
      console.error('Erro estatísticas:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadRepasses = async () => {
    setRepassesLoading(true);
    try {
      const res = await fetch(`/api/compras/admin?admin_key=manos_intel_secret_key&action=repasses&page=${page}&limit=${limit}&query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRepasses(data.repasses || []);
      }
    } catch (err) {
      console.error('Erro repasses:', err);
    } finally {
      setRepassesLoading(false);
    }
  };

  const loadAlertas = async () => {
    setAlertasLoading(true);
    try {
      const res = await fetch('/api/compras/alertas');
      const data = await res.json();
      if (res.ok && data.success) {
        setAlertas(data.alerts || []);
      }
    } catch (err) {
      console.error('Erro alertas:', err);
    } finally {
      setAlertasLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    loadAlertas();
  }, []);

  useEffect(() => {
    loadRepasses();
  }, [page, searchQuery]);

  const handleDeleteSingle = async () => {
    if (!deleteSingleModal.item) return;
    setActionExecuting(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await fetch(`/api/compras/admin?admin_key=manos_intel_secret_key&action=repasse&id=${deleteSingleModal.item.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess('Oportunidade excluída com sucesso!');
        loadAllData();
        loadRepasses();
        setDeleteSingleModal({ open: false, item: null });
      } else {
        setActionError(data.error || 'Erro ao excluir o registro.');
      }
    } catch (err) {
      setActionError('Falha ao conectar com o servidor.');
    } finally {
      setActionExecuting(false);
    }
  };

  const handleDeleteAlerta = async () => {
    if (!deleteAlertaModal.item) return;
    setActionExecuting(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await fetch(`/api/compras/alertas?id=${deleteAlertaModal.item.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess('Alerta removido com sucesso!');
        loadAlertas();
        setDeleteAlertaModal({ open: false, item: null });
      } else {
        setActionError(data.error || 'Erro ao remover alerta.');
      }
    } catch (err) {
      setActionError('Erro de conexão ao remover alerta.');
    } finally {
      setActionExecuting(false);
    }
  };

  const handleDeleteMass = async () => {
    if (!deleteMassModal.tableKey) return;
    if (confirmWord !== 'EXCLUIR') {
      setActionError('Digite EXCLUIR para confirmar.');
      return;
    }

    setActionExecuting(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await fetch(`/api/compras/admin?admin_key=manos_intel_secret_key&action=database&table=${deleteMassModal.tableKey}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Tabela ${deleteMassModal.tableName} limpa com sucesso!`);
        loadAllData();
        if (deleteMassModal.tableKey === 'repassecentral') {
          setPage(1);
          loadRepasses();
        }
        setDeleteMassModal({ open: false, tableKey: '', tableName: '' });
        setConfirmWord('');
      } else {
        setActionError(data.error || 'Erro na exclusão em lote.');
      }
    } catch (err) {
      setActionError('Erro de conexão.');
    } finally {
      setActionExecuting(false);
    }
  };

  const formatBRL = (val: any) => {
    if (!val) return '—';
    const num = typeof val === 'string' ? parseFloat(val.replace(/[^\d]/g, '')) : val;
    if (isNaN(num)) return '—';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  };

  return (
    <div className="flex flex-col gap-8 w-full text-zinc-100">
      
      {/* Toast Notification */}
      {(actionSuccess || actionError) && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${actionSuccess ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-red-950/20 border-red-500/20 text-red-400'}`}>
          <div className="flex items-center gap-3 text-sm">
            <span>{actionSuccess || actionError}</span>
          </div>
          <button onClick={() => { setActionSuccess(null); setActionError(null); }} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Grid Estatísticas */}
      <section className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Database className="w-4 h-4" /> Estatísticas do Banco</h2>
          <button onClick={loadAllData} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 transition-colors"><RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((t) => (
            <div key={t.key} className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col justify-between gap-4 transition-all hover:bg-zinc-900/60 group">
              <div>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">{t.name}</span>
                <span className="text-3xl font-extrabold text-white block mt-2">{t.count.toLocaleString('pt-BR')} <span className="text-xs text-zinc-500 font-normal">linhas</span></span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-850/60 pt-3">
                <span className="text-[10px] font-semibold text-zinc-500 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.active ? 'bg-emerald-500' : 'bg-red-500'}`} /> {t.active ? 'Conectado' : 'Erro'}
                </span>
                <button onClick={() => setDeleteMassModal({ open: true, tableKey: t.key, tableName: t.name })} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors opacity-40 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tabela Repasses */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Oportunidades (repassecentral)</h2>
            <p className="text-xs text-zinc-500 mt-1">Delete e gerencie as ofertas que aparecem no Radar 24h</p>
          </div>
          <div className="relative w-full md:w-80">
            <input
              type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Buscar por marca, modelo, anunciante..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
            />
          </div>
        </div>

        <div className="bg-zinc-900/30 border border-zinc-850 rounded-2xl overflow-hidden">
          {repassesLoading ? (
            <div className="py-12 flex flex-col justify-center items-center gap-2"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /><span className="text-zinc-500 text-xs">Carregando repasses...</span></div>
          ) : repasses.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">Nenhum repasse cadastrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs text-zinc-300">
                <thead>
                  <tr className="border-b border-zinc-850 bg-zinc-900/50 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">KM</th>
                    <th className="py-3 px-4">Preço Pedido</th>
                    <th className="py-3 px-4">FIPE</th>
                    <th className="py-3 px-4">Anunciante</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/50">
                  {repasses.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-900/20">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{r.modelo}</div>
                        <div className="text-[10px] text-zinc-500">{r.marca} • {r.ano_modelo}</div>
                      </td>
                      <td className="py-3 px-4">{r.km ? `${r.km.toLocaleString('pt-BR')} km` : '—'}</td>
                      <td className="py-3 px-4 font-bold text-white">{formatBRL(r.preco_pedido)}</td>
                      <td className="py-3 px-4 text-zinc-400">{formatBRL(r.preco_fipe)}</td>
                      <td className="py-3 px-4">
                        <div>{r.nome_anunciante || 'Particular'}</div>
                        <div className="text-[10px] text-zinc-500">{r.numero_anunciante || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => setDeleteSingleModal({ open: true, item: r })} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Seção Alertas */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest"><Bell className="w-4 h-4 inline mr-1" /> Alertas Ativos</h2>
        <div className="bg-zinc-900/30 border border-zinc-850 rounded-2xl overflow-hidden">
          {alertasLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
          ) : alertas.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">Nenhum comprador ativado na fila de alertas.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs text-zinc-300">
                <thead>
                  <tr className="border-b border-zinc-850 bg-zinc-900/50 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Comprador</th>
                    <th className="py-3 px-4">Telefone</th>
                    <th className="py-3 px-4">Marca / Modelo</th>
                    <th className="py-3 px-4">Valor Limite</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Excluir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/50">
                  {alertas.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-900/20">
                      <td className="py-3 px-4 font-semibold text-white">{a.nome_cliente}</td>
                      <td className="py-3 px-4">{a.telefone_cliente}</td>
                      <td className="py-3 px-4">{a.marca} — {a.modelo}</td>
                      <td className="py-3 px-4">{a.valor_maximo ? formatBRL(a.valor_maximo) : 'Sem limite'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${a.ativo ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                          {a.ativo ? 'Monitorando' : 'Pausado'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => setDeleteAlertaModal({ open: true, item: a })} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Modal Deletar Oportunidade */}
      {deleteSingleModal.open && deleteSingleModal.item && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex justify-center items-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 relative">
            <h3 className="text-base font-bold text-white mb-2">Excluir Oportunidade?</h3>
            <p className="text-xs text-zinc-400 mb-4">Esta ação apagará permanentemente o veículo "{deleteSingleModal.item.modelo}".</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteSingleModal({ open: false, item: null })} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-755 rounded-xl font-bold uppercase text-[10px]">Cancelar</button>
              <button onClick={handleDeleteSingle} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-bold uppercase text-[10px]">Confirmar Exclusão</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Deletar Alerta */}
      {deleteAlertaModal.open && deleteAlertaModal.item && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex justify-center items-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 relative">
            <h3 className="text-base font-bold text-white mb-2">Excluir Alerta de Monitoramento?</h3>
            <p className="text-xs text-zinc-400 mb-4">Esta ação removerá o alerta do comprador "{deleteAlertaModal.item.nome_cliente}".</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteAlertaModal({ open: false, item: null })} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-755 rounded-xl font-bold uppercase text-[10px]">Cancelar</button>
              <button onClick={handleDeleteAlerta} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-bold uppercase text-[10px]">Excluir Alerta</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Deleção Massa */}
      {deleteMassModal.open && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex justify-center items-center p-6">
          <div className="bg-zinc-900 border border-red-500/20 rounded-2xl w-full max-w-md p-6 relative">
            <h3 className="text-base font-bold text-white mb-2">Ação Crítica de Limpeza</h3>
            <p className="text-xs text-red-400 mb-4">Tem certeza que deseja apagar TODOS os registros de "{deleteMassModal.tableName}"?</p>
            <input
              type="text" value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)}
              placeholder="Digite EXCLUIR para continuar..."
              className="w-full bg-zinc-950 border border-red-950 rounded-xl px-4 py-3 text-xs text-white text-center font-bold tracking-widest outline-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setDeleteMassModal({ open: false, tableKey: '', tableName: '' }); setConfirmWord(''); }} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold uppercase text-[10px]">Cancelar</button>
              <button disabled={confirmWord !== 'EXCLUIR'} onClick={handleDeleteMass} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold uppercase text-[10px]">Limpar Tabela</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
