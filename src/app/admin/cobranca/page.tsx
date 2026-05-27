'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, AlertCircle, Plus, Info, Sparkles, RefreshCw,
  Wallet, History, ShieldAlert, Pause, Upload, Bell, CheckSquare, 
  ListOrdered, Hourglass, Trash2, ShieldX, Play, Bomb, BarChart3, MessageCircle, Brain
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import { BillingRecord } from '@/types';
import { 
  fetchBillingRecords, 
  saveBillingRecord, 
  deleteBillingRecord, 
  importCsvRecords, 
  calculateStats 
} from '@/app/admin/cobranca/services/api';

// Components
import DashboardMetrics from './components/DashboardMetrics';
import CsvImporter from './components/CsvImporter';
import DataGrid from './components/DataGrid';
import BillingModal from './components/BillingModal';
import ReminderModal from './components/ReminderModal';
import BatchFilterModal from './components/BatchFilterModal';
import ControlePanel from './components/ControlePanel';
import WhatsAppInbox from './components/WhatsAppInbox';
import AnaliseIaPanel from './components/AnaliseIaPanel';

interface ToastState {
  message: string;
  type: 'success' | 'info' | 'error';
}

export default function BillingPage() {
  const supabaseClient = useMemo(() => createClient(), []);
  
  // Auth & Access Control
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Nav tab
  const [activeTab, setActiveTab] = useState<'CONTROLE_CENTRAL' | 'HISTORICO' | 'FILA_ANTISPAM' | 'CONTROLE_RELATORIO' | 'WHATSAPP' | 'ANALISE_IA'>('CONTROLE_CENTRAL');

  // Billing Data States
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [recordToEdit, setRecordToEdit] = useState<BillingRecord | null>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [recordForReminder, setRecordForReminder] = useState<BillingRecord | null>(null);
  const [isBatchFilterOpen, setIsBatchFilterOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);

  // Queue & logs
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [queueStatus, setQueueStatus] = useState<any>({
    active: true,
    intervalSeconds: 180,
    secondsRemaining: 180,
    queueSize: 0,
    queueList: [],
    lastDispatch: 'Nenhum no momento',
    allowedStartHour: '08:00',
    allowedEndHour: '18:00',
    isWithinAllowedHours: true
  });

  // Local state for allowed hours selectors (synced from queueStatus)
  const [localStartHour, setLocalStartHour] = useState('08:00');
  const [localEndHour, setLocalEndHour] = useState('18:00');
  const [isSavingHours, setIsSavingHours] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  // Check auth and role
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const currentUser = session?.user;
        if (currentUser) {
          setUser(currentUser);
          const { data: consultant } = await supabaseClient
            .from('consultants_manos_crm')
            .select('role')
            .or(`user_id.eq.${currentUser.id},auth_id.eq.${currentUser.id}`)
            .maybeSingle();

          if (consultant) {
            setUserRole(consultant.role);
          } else if (currentUser.email === 'alexandre_gorges@hotmail.com') {
            setUserRole('admin');
          } else {
            setUserRole('consultant');
          }
        }
      } catch (err) {
        console.error('Erro ao autenticar usuário:', err);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAccess();
  }, [supabaseClient]);

  // Load Records
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBillingRecords();
      setRecords(data);
    } catch (err: any) {
      setError('Não foi possível carregar os faturamentos mensais. Tente novamente.');
      showToast('Erro ao ler base de registros', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadWebhookLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/webhook-logs');
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data);
      }
    } catch (e) {
      // Fail silently
    }
  }, []);

  const loadQueueStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/queue-status');
      if (res.ok) {
        const data = await res.json();
        setQueueStatus(data);
        // Sync local selectors with server state (only if not currently editing)
        if (data.allowedStartHour) setLocalStartHour(data.allowedStartHour);
        if (data.allowedEndHour) setLocalEndHour(data.allowedEndHour);
      }
    } catch (e) {
      // Fail silently
    }
  }, []);

  // Poll status
  useEffect(() => {
    if (authLoading || !user) return;
    
    loadData();
    loadWebhookLogs();
    loadQueueStatus();
    
    const interval = setInterval(() => {
      loadWebhookLogs();
      loadQueueStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, [authLoading, user, loadData, loadWebhookLogs, loadQueueStatus]);

  const handleResetProduction = async () => {
    const confirmStep1 = window.confirm(
      '⚠️ ATENÇÃO — AÇÃO IRREVERSÍVEL\n\n' +
      'Isso irá APAGAR PERMANENTEMENTE do setor de Cobrança:\n' +
      '• Todas as cobranças cadastradas (records)\n' +
      '• Todo o histórico de envios WhatsApp\n' +
      '• Todas as conversas WhatsApp recebidas\n' +
      '• Todos os acordos e envios jurídicos\n' +
      '• Todas as análises IA\n' +
      '• Todos os lembretes e observações\n' +
      '• A fila anti-spam e logs em memória\n\n' +
      'O resto do CRM (leads, vendas, etc) NÃO é afetado.\n\n' +
      'Deseja continuar para a confirmação final?'
    );
    if (!confirmStep1) return;

    const confirmStep2 = window.prompt(
      'CONFIRMAÇÃO FINAL\n\nDigite exatamente  APAGAR  para limpar o banco de cobrança:'
    );
    if (confirmStep2?.trim() !== 'APAGAR') {
      showToast('Operação cancelada. Nenhum dado foi alterado.', 'info');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/billing/reset-production', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecords([]);
        setWebhookLogs([]);
        showToast('✅ Banco de cobrança apagado! Pronto para começar do zero.', 'success');
        loadQueueStatus();
      } else {
        showToast(data.error || 'Erro ao apagar o banco de cobrança.', 'error');
      }
    } catch (err) {
      showToast('Falha ao conectar ao servidor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRunBatchScheduler = async (selectedRecords: BillingRecord[], forcedStage: string | null) => {
    setBatchRunning(true);
    try {
      const response = await fetch('/api/billing/batch-scheduler', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: selectedRecords,
          todayStr: '2026-05-27',
          forcedStage: forcedStage
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        showToast(`Régua processada! Adicionados ${data.newlyQueued} contatos na fila anti-spam. Ignorou ${data.skippedCount} duplicados.`, 'success');
        loadQueueStatus();
        loadWebhookLogs();
        setIsBatchFilterOpen(false);
      } else {
        showToast(data.error || 'Erro ao executar régua em lote.', 'error');
      }
    } catch (err) {
      showToast('Falha ao conectar no servidor de lote.', 'error');
    } finally {
      setBatchRunning(false);
    }
  };

  const handleToggleQueue = async () => {
    try {
      const res = await fetch('/api/billing/queue/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(data.active ? 'Fila Anti-Spam ATIVA' : 'Fila Anti-Spam PAUSADA', 'info');
        loadQueueStatus();
      }
    } catch (err) {
      showToast('Ação indisponível', 'error');
    }
  };

  const handleClearQueue = async () => {
    if (window.confirm('Deseja limpar todos os disparos enfileirados na fila anti-spam?')) {
      try {
        const res = await fetch('/api/billing/queue/clear', { method: 'POST' });
        if (res.ok) {
          showToast('Fila anti-spam limpa com sucesso!', 'info');
          loadQueueStatus();
        }
      } catch (err) {
        showToast('Erro ao limpar fila', 'error');
      }
    }
  };

  const handleForceDispatch = async () => {
    try {
      const res = await fetch('/api/billing/queue/force-dispatch', { method: 'POST' });
      if (res.ok) {
        showToast('Disparo imediato efetuado. O robô avançou a fila sem aguardar o delay!', 'success');
        loadQueueStatus();
        loadWebhookLogs();
      } else {
        const data = await res.json();
        showToast(data.error || 'Erro ao forçar disparo', 'error');
      }
    } catch (err) {
      showToast('Erro ao forçar avanço', 'error');
    }
  };

  const handleSetDelay = async (minutes: number) => {
    try {
      const res = await fetch('/api/billing/queue/set-delay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes })
      });
      if (res.ok) {
        showToast(`Delay de anti-spam definido para ${minutes} minutos por mensagem!`, 'success');
        loadQueueStatus();
      }
    } catch (err) {
      showToast('Erro ao ajustar delay', 'error');
    }
  };

  const handleSetAllowedHours = async (start: string, end: string) => {
    setIsSavingHours(true);
    try {
      const res = await fetch('/api/billing/queue/set-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end })
      });
      if (res.ok) {
        showToast(`✅ Janela de disparos: ${start} às ${end}`, 'success');
        loadQueueStatus();
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao ajustar horários', 'error');
      }
    } catch (err) {
      showToast('Erro ao ajustar horários', 'error');
    } finally {
      setIsSavingHours(false);
    }
  };

  const stats = useMemo(() => calculateStats(records), [records]);

  // Toast auto dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleRecordsImported = async (newRows: Omit<BillingRecord, 'id' | 'status'>[]) => {
    try {
      const updated = await importCsvRecords(newRows);
      setRecords(updated);
      showToast(`Planilha importada! Inseridos ${newRows.length} registros no Supabase.`, 'success');
      setIsCsvImportOpen(false);
    } catch (err: any) {
      showToast('Falha ao acoplar registros da planilha', 'error');
      throw err;
    }
  };

  const handleMarkAsPaid = async (id: string) => {
    const target = records.find(r => r.id === id);
    if (!target) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const updatedRecord: BillingRecord = {
      ...target,
      status: 'PAGO',
      dataPagamento: todayStr,
      observacoes: (target.observacoes || '') + `\nMarcado como pago em ${todayStr}.`
    };

    try {
      await saveBillingRecord(updatedRecord);
      setRecords(prev => prev.map(r => r.id === id ? updatedRecord : r));
      showToast(`Faturamento de ${target.clienteFornecedor} quitado com sucesso!`, 'success');
    } catch (err: any) {
      showToast('Erro ao processar baixa financeira', 'error');
    }
  };

  const handleSaveRecord = async (record: BillingRecord) => {
    try {
      const saved = await saveBillingRecord(record);
      setRecords(prev => {
        const exist = prev.some(r => r.id === saved.id);
        if (exist) {
          return prev.map(r => r.id === saved.id ? saved : r);
        } else {
          return [saved, ...prev];
        }
      });

      const isEditing = records.some(r => r.id === saved.id);
      showToast(
        isEditing 
          ? `Cobrança de ${saved.clienteFornecedor} atualizada!`
          : `Nova cobrança criada para ${saved.clienteFornecedor}!`,
        'success'
      );
    } catch (err: any) {
      showToast('Não foi possível gravar a cobrança.', 'error');
      throw err;
    }
  };

  const handleDeleteRecord = async (id: string) => {
    const target = records.find(r => r.id === id);
    if (!target) return;

    if (window.confirm(`Confirma a exclusão definitiva do faturamento de ${target.clienteFornecedor}?`)) {
      try {
        await deleteBillingRecord(id);
        setRecords(prev => prev.filter(r => r.id !== id));
        showToast('Registro de faturamento removido.', 'info');
      } catch (err: any) {
        showToast('Erro ao remover faturamento.', 'error');
      }
    }
  };

  const handleEditRecordClick = (record: BillingRecord) => {
    setRecordToEdit(record);
    setIsEditModalOpen(true);
  };

  const handleAddNewClick = () => {
    setRecordToEdit(null);
    setIsEditModalOpen(true);
  };

  const handleReminderClick = (record: BillingRecord) => {
    setRecordForReminder(record);
    setIsReminderOpen(true);
  };

  const getFormatTimeRemaining = (secs: number) => {
    if (secs <= 0) return 'Disparando...';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  // Auth Guard
  const isAuthorized = useMemo(() => {
    if (!user) return false;
    const isAdmin = userRole === 'admin';
    const isCamila = user.email === 'camila.renatta@hotmail.com';
    const isAlexandre = user.email === 'alexandre_gorges@hotmail.com';
    return isAdmin || isCamila || isAlexandre;
  }, [user, userRole]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] w-full">
        <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 w-full">
        <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 mb-4 animate-bounce">
          <ShieldX className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black text-white">Acesso Restrito</h1>
        <p className="text-zinc-500 text-sm mt-2 max-w-sm">
          Esta página é reservada exclusivamente para administradores do sistema e para o setor financeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 p-4 md:p-8 pb-20">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            Gestão de Cobrança <span className="text-sm font-normal text-zinc-500">v1.0</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${queueStatus.queueSize > 0 && queueStatus.active ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'}`} />
            <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Mapeador de Inadimplência & Fila n8n</span>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsCsvImportOpen(prev => !prev)}
            className={`px-4 py-2 rounded-xl border text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              isCsvImportOpen 
                ? 'bg-zinc-800 text-white border-zinc-700' 
                : 'bg-zinc-900 border-zinc-850 text-zinc-300 hover:text-white hover:border-zinc-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Planilha (CSV)
          </button>

          <button
            onClick={handleAddNewClick}
            className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-violet-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Faturamento Manual
          </button>

          {/* Botão de Apagar Banco — separado visualmente, perigoso */}
          <div className="w-px h-6 bg-zinc-800 mx-1" />
          <button
            id="btn-apagar-banco"
            onClick={handleResetProduction}
            disabled={loading}
            className="px-4 py-2 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 hover:border-red-500/40 rounded-xl text-xs font-black text-red-400 hover:text-red-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Apaga TODOS os dados de cobrança no Supabase (records, lembretes, WhatsApp, acordos, jurídico, análises IA). Use para começar com cobranças reais do zero."
          >
            <Bomb className="w-3.5 h-3.5" />
            Apagar Banco de Dados
          </button>
        </div>
      </div>

      {/* CSV importer */}
      <AnimatePresence>
        {isCsvImportOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <CsvImporter 
              onRecordsImported={handleRecordsImported} 
              onClose={() => setIsCsvImportOpen(false)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats row */}
      {loading && records.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 bg-zinc-900/10 border border-dashed border-zinc-850 rounded-3xl">
          <RefreshCw className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-zinc-300">Carregando métricas financeiras...</p>
        </div>
      ) : (
        <DashboardMetrics stats={stats} />
      )}

      {/* Fila Anti-Spam Control Strip */}
      <div className="p-5 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-5 font-sans text-xs">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldAlert className="w-4.5 h-4.5" />
            </span>
            <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
              Painel Anti-Ban & Disparo em Lote
              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${
                queueStatus.active 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' 
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700'
              }`}>
                {queueStatus.active ? 'Protetor Ativo' : 'Pausado'}
              </span>
            </h3>
          </div>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            A fila staggered envia apenas <strong>1 contato por vez</strong> com atraso de <strong>3 a 5 minutos</strong> configurado para afastar punições. Ao processar em lote, o sistema verificará as cobranças elegíveis (1 dia antes, no dia, juros vencidos) e adicionará somente contatos ainda não enviados no estágio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-zinc-950/40 border border-zinc-850 p-4 rounded-2xl shadow-inner self-start xl:self-auto font-sans">
          <div className="space-y-1 pr-4 border-r border-zinc-800">
            <div className="text-[10px] text-zinc-550 font-black uppercase tracking-wider">Próximo Disparo</div>
            <div className="font-mono text-zinc-200 font-extrabold flex items-center gap-1.5 text-xs">
              <Hourglass className={`w-3.5 h-3.5 text-violet-400 ${queueStatus.queueSize > 0 && queueStatus.active && queueStatus.isWithinAllowedHours ? 'animate-spin' : ''}`} />
              {queueStatus.queueSize > 0 
                ? (!queueStatus.isWithinAllowedHours
                    ? `Fora do Horário (${queueStatus.allowedStartHour} - ${queueStatus.allowedEndHour})`
                    : getFormatTimeRemaining(queueStatus.secondsRemaining))
                : 'Fila Vazia'
              }
            </div>
          </div>

          <div className="space-y-1 pr-4 border-r border-zinc-800">
            <div className="text-[10px] text-zinc-550 font-black uppercase tracking-wider">Em Espera</div>
            <div className="font-mono text-white font-black text-xs">
              <span className="text-violet-400 font-extrabold">{queueStatus.queueSize}</span> cobranças
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleToggleQueue}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                queueStatus.active 
                  ? 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20'
              }`}
              title={queueStatus.active ? 'Pausar loop de disparos' : 'Retomar loop de disparos'}
            >
              {queueStatus.active ? (
                <>
                  <Pause className="w-3 h-3 text-zinc-400" />
                  Pausar Fila
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-white fill-white" />
                  Retomar Fila
                </>
              )}
            </button>

            <button
              onClick={handleForceDispatch}
              disabled={queueStatus.queueSize === 0}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 text-[11px] font-bold disabled:opacity-40 transition-all cursor-pointer"
              title="Dispara o topo da fila imediatamente"
            >
              Forçar Topo
            </button>

            <button
              onClick={handleClearQueue}
              disabled={queueStatus.queueSize === 0}
              className="p-1.5 rounded-xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 text-red-400 disabled:opacity-40 transition-all cursor-pointer"
              title="Limpar Fila"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Delay:</span>
              <select
                value={Math.round(queueStatus.intervalSeconds / 60)}
                onChange={(e) => handleSetDelay(Number(e.target.value))}
                className="bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] py-1 px-1.5 focus:outline-none cursor-pointer text-zinc-300 font-bold"
              >
                <option value={1}>1 min</option>
                <option value={2}>2 min</option>
                <option value={3}>3 min</option>
                <option value={4}>4 min</option>
                <option value={5}>5 min</option>
              </select>
            </div>

            {/* Allowed Hours Control */}
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-zinc-800">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                queueStatus.isWithinAllowedHours ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
              }`} />
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest whitespace-nowrap">
                Horário:
              </span>
              <select
                id="allowed-start-hour"
                value={localStartHour}
                onChange={(e) => setLocalStartHour(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] py-1 px-1.5 focus:outline-none cursor-pointer text-zinc-300 font-bold"
                title="Horário de início dos disparos"
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = String(i).padStart(2, '0') + ':00';
                  return <option key={h} value={h}>{h}</option>;
                })}
              </select>
              <span className="text-zinc-600 text-[10px] font-bold">até</span>
              <select
                id="allowed-end-hour"
                value={localEndHour}
                onChange={(e) => setLocalEndHour(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] py-1 px-1.5 focus:outline-none cursor-pointer text-zinc-300 font-bold"
                title="Horário de término dos disparos"
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = String(i).padStart(2, '0') + ':00';
                  return <option key={h} value={h}>{h}</option>;
                })}
              </select>
              <button
                id="btn-salvar-horarios"
                onClick={() => handleSetAllowedHours(localStartHour, localEndHour)}
                disabled={isSavingHours}
                className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 text-emerald-400 text-[10px] font-black disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                title="Salvar janela de horários permitidos"
              >
                {isSavingHours ? '...' : 'Salvar'}
              </button>
              {!queueStatus.isWithinAllowedHours && (
                <span className="text-[9px] font-black text-red-400 uppercase tracking-wider whitespace-nowrap">
                  ⏸ Fora do Horário
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsBatchFilterOpen(true)}
          className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-violet-900/20 cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
          title="Filtra e seleciona faturamentos em lote para disparos"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-200" />
          Filtrar Régua em Lote
        </button>
      </div>

      {/* Internal Navigation Tabs */}
      <div className="flex border-b border-white/[0.06] gap-1 select-none">
        <button
          onClick={() => setActiveTab('CONTROLE_CENTRAL')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'CONTROLE_CENTRAL'
              ? 'border-red-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Contas a Receber
        </button>

        <button
          onClick={() => setActiveTab('FILA_ANTISPAM')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'FILA_ANTISPAM'
              ? 'border-red-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          Fila Anti-Spam
          {queueStatus.queueSize > 0 && (
            <span className="ml-1 bg-red-500 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full animate-pulse">
              {queueStatus.queueSize}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('HISTORICO')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'HISTORICO'
              ? 'border-red-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <History className="w-4 h-4" />
          Histórico de Envios
        </button>

        <button
          onClick={() => setActiveTab('CONTROLE_RELATORIO')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'CONTROLE_RELATORIO'
              ? 'border-red-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Controle
        </button>

        <button
          onClick={() => setActiveTab('WHATSAPP')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'WHATSAPP'
              ? 'border-red-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </button>

        <button
          onClick={() => setActiveTab('ANALISE_IA')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'ANALISE_IA'
              ? 'border-red-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Brain className="w-4 h-4" />
          Análise IA
        </button>
      </div>

      {/* Tab views */}
      <AnimatePresence mode="wait">
        {activeTab === 'CONTROLE_CENTRAL' && (
          <motion.div
            key="tab-central"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {loading && records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-3 text-violet-500" />
                <p className="text-sm font-bold text-zinc-400">Carregando listagem de cobranças...</p>
              </div>
            ) : (
              <DataGrid 
                records={records}
                onMarkAsPaid={handleMarkAsPaid}
                onEditRecord={handleEditRecordClick}
                onSendReminder={handleReminderClick}
                onDeleteRecord={handleDeleteRecord}
              />
            )}
          </motion.div>
        )}

        {activeTab === 'FILA_ANTISPAM' && (
          <motion.div
            key="tab-fila"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-xs"
          >
            <div className="border-b border-white/[0.06] pb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white">Disparos Enfileirados Pendentes</h3>
                <p className="text-zinc-400 text-[11px] mt-0.5">Fila de contatos organizados temporariamente para envio programado via n8n.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 bg-zinc-950 border border-zinc-850 text-zinc-400 rounded-xl font-bold font-mono">
                  {queueStatus.queueSize} Na Fila
                </span>
                <button
                  onClick={handleClearQueue}
                  disabled={queueStatus.queueSize === 0}
                  className="px-3 py-1.5 rounded-xl bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 text-[11px] font-black transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove TODOS os disparos pendentes da fila (não afeta as cobranças cadastradas)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar Todos Disparos
                </button>
              </div>
            </div>

            {queueStatus.queueList.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <ListOrdered className="w-10 h-10 text-zinc-650 mx-auto mb-2" />
                <p className="text-sm font-bold text-zinc-450">Nenhum envio programado na fila</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Qualifique faturamentos em lote ou envie um lembrete para acumular aqui.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-collapse text-left text-zinc-300">
                  <thead>
                    <tr className="bg-zinc-950/40 text-zinc-500 font-bold border-b border-zinc-800">
                      <th className="p-3">Adicionado às</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Telefone</th>
                      <th className="p-3">Vencimento</th>
                      <th className="p-3">Valor</th>
                      <th className="p-3">Estágio Régua</th>
                      <th className="p-3 text-right">Status Atual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {queueStatus.queueList.map((item: any) => (
                      <tr key={item.id} className="hover:bg-zinc-800/10 transition-colors">
                        <td className="p-3 font-mono font-bold text-zinc-500">{item.addedAt}</td>
                        <td className="p-3 font-bold text-white uppercase">{item.nome}</td>
                        <td className="p-3 font-mono text-zinc-400">{item.telefone}</td>
                        <td className="p-3 font-mono text-zinc-400">{item.vencimento}</td>
                        <td className="p-3 font-mono font-black text-sky-400">R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase tracking-wider">
                            {item.estagio}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            item.status === 'ENVIANDO'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'CONTROLE_RELATORIO' && (
          <motion.div
            key="tab-controle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <ControlePanel records={records} todayStr="2026-05-27" />
          </motion.div>
        )}

        {activeTab === 'WHATSAPP' && (
          <motion.div
            key="tab-whatsapp"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <WhatsAppInbox records={records} showToast={showToast} />
          </motion.div>
        )}

        {activeTab === 'ANALISE_IA' && (
          <motion.div
            key="tab-analise-ia"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <AnaliseIaPanel records={records} showToast={showToast} />
          </motion.div>
        )}

        {activeTab === 'HISTORICO' && (
          <motion.div
            key="tab-historico"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-xs"
          >
            <div className="border-b border-white/[0.06] pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white">Histórico de Envios Recentes</h3>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  Fonte de verdade: tabela <code className="bg-zinc-800 px-1 py-0.5 rounded text-emerald-400">registro_envios_whatsapp</code> no Supabase. ✅ Enviado = está no banco. ❌ ERRO = não chegou ao banco.
                </p>
              </div>
              <button
                onClick={loadWebhookLogs}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/60 rounded-xl text-zinc-300 hover:text-white font-bold transition-all flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-3 h-3 text-zinc-400" />
                Atualizar Logs
              </button>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <History className="w-10 h-10 text-zinc-655 mx-auto mb-2" />
                <p className="text-sm font-bold text-zinc-450">Nenhum log registrado</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Os disparos processados pelo robô ou de forma manual aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-collapse text-left text-zinc-300">
                  <thead>
                    <tr className="bg-zinc-950/40 text-zinc-500 font-bold border-b border-zinc-800">
                      <th className="p-3">Data/Hora</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">WhatsApp</th>
                      <th className="p-3">Vencimento</th>
                      <th className="p-3">Valor</th>
                      <th className="p-3">Estágio / Tipo</th>
                      <th className="p-3 text-right">Status do Envio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {webhookLogs.map((log: any, index: number) => (
                      <tr
                        key={log.id || index}
                        className={`hover:bg-zinc-800/10 transition-colors ${
                          log.fromDb ? '' : 'opacity-75'
                        }`}
                      >
                        <td className="p-3 font-mono font-bold text-zinc-500">
                          <div className="flex items-center gap-1.5">
                            {log.fromDb && (
                              <span title="Confirmado no banco Supabase" className="text-emerald-500 text-[10px]">&#x1F5C4;</span>
                            )}
                            {log.timestamp}
                          </div>
                        </td>
                        <td className="p-3 font-bold uppercase">
                          {(() => {
                            const cleanName = (log.nome || '').replace(' (Enviado)', '').replace(' (Confirmado)', '');
                            // Tenta achar o record pelo telefone OU pelo nome
                            const phoneDigits = (log.telefone || '').replace(/\D/g, '');
                            const matched = records.find(r =>
                              (phoneDigits && r.telefone && r.telefone.replace(/\D/g, '').includes(phoneDigits)) ||
                              (cleanName && r.clienteFornecedor?.toUpperCase() === cleanName.toUpperCase())
                            );
                            if (matched) {
                              return (
                                <button
                                  onClick={() => handleEditRecordClick(matched)}
                                  className="text-white hover:text-violet-400 underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left"
                                  title="Abrir cadastro desta cobrança"
                                >
                                  {cleanName}
                                </button>
                              );
                            }
                            return <span className="text-white">{cleanName}</span>;
                          })()}
                        </td>
                        <td className="p-3 font-mono text-zinc-400">{log.telefone}</td>
                        <td className="p-3 font-mono text-zinc-400">{log.vencimento}</td>
                        <td className="p-3 font-mono font-black text-sky-400">
                          R$ {parseFloat(log.valor || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase tracking-wider">
                            {log.estagio || 'MANUAL'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span
                            title={log.errorMessage || (log.fromDb ? 'Confirmado no banco de dados' : '')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border cursor-help ${
                              log.status === 'SUCESSO'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : log.status === 'PULADO'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                          >
                            {log.status === 'SUCESSO' ? '✅ Enviado' : log.status === 'PULADO' ? '⏸ Pulado' : '❌ Erro'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Toast System */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-[100]"
          >
            <div className={`p-4 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs font-bold leading-normal max-w-sm ${
              toast.type === 'success' 
                ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400 backdrop-blur-xl' 
                : toast.type === 'error'
                ? 'bg-red-950/80 border-red-500/30 text-red-400 backdrop-blur-xl'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 backdrop-blur-xl'
            }`}>
              {toast.type === 'success' ? (
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <BillingModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        onSave={handleSaveRecord} 
        recordToEdit={recordToEdit} 
      />

      <ReminderModal 
        isOpen={isReminderOpen} 
        onClose={() => setIsReminderOpen(false)} 
        record={recordForReminder} 
      />

      <BatchFilterModal
        isOpen={isBatchFilterOpen}
        onClose={() => setIsBatchFilterOpen(false)}
        records={records}
        onEnfileirar={handleRunBatchScheduler}
        loading={batchRunning}
      />

    </div>
  );
}
