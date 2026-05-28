'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, Check, Play, User, Calendar, MessageSquare, 
  TrendingUp, Wallet, ShieldAlert, Award, FileText, X, RefreshCw, Send
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BillingRecord } from '@/types';
import { saveBillingRecord } from '@/app/admin/cobranca/services/api';

interface Consultant {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export default function ConsultantBillingPage() {
  const supabaseClient = useMemo(() => createClient(), []);

  // Auth & State
  const [user, setUser] = useState<any>(null);
  const [consultant, setConsultant] = useState<Consultant | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'OPORTUNIDADES' | 'GANHOS'>('OPORTUNIDADES');

  const isAdmin = useMemo(() => consultant?.role === 'admin', [consultant]);

  // Modal de registro de acordo
  const [selectedRecordForAgreement, setSelectedRecordForAgreement] = useState<BillingRecord | null>(null);
  const [agreementType, setAgreementType] = useState<'DESCONTO_VISTA' | 'PARCELAMENTO' | 'PROMESSA_DATA'>('DESCONTO_VISTA');
  const [agreementValue, setAgreementValue] = useState('');
  const [agreementInstallments, setAgreementInstallments] = useState(1);
  const [agreementDate, setAgreementDate] = useState('');
  const [agreementObs, setAgreementObs] = useState('');
  const [savingAgreement, setSavingAgreement] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  // Dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load User & Consultant data
  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          
          const { data: consultData, error } = await supabaseClient
            .from('consultants_manos_crm')
            .select('id, name, email, role')
            .or(`user_id.eq.${session.user.id},auth_id.eq.${session.user.id}`)
            .maybeSingle();

          if (error) {
            console.error('Erro ao ler consultor:', error.message);
          }

          if (consultData) {
            setConsultant(consultData);
          } else {
            // Fallback para administradores se logarem como consultor para teste
            setConsultant({
              id: 'admin-test-id',
              name: session.user.user_metadata?.full_name || 'Vendedor Admin',
              email: session.user.email || '',
              role: 'vendedor'
            });
          }
        }
      } catch (err) {
        console.error('Erro ao buscar dados de auth:', err);
      } finally {
        setLoading(false);
      }
    };
    getSession();
  }, [supabaseClient]);

  // Fetch billing records
  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/records');
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (err) {
      console.error('Erro ao buscar cobranças:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadRecords();
      // Poll a cada 10 segundos
      const interval = setInterval(loadRecords, 10000);
      return () => clearInterval(interval);
    }
  }, [user, loadRecords]);

  // Filtrar oportunidades (fase = JURIDICO_VENDEDORES e em aberto)
  const opportunities = useMemo(() => {
    return records.filter(r => 
      r.fase === 'JURIDICO_VENDEDORES' && 
      r.status !== 'PAGO' &&
      (isAdmin || !r.vendedor_id || r.vendedor_id === consultant?.id)
    );
  }, [records, consultant, isAdmin]);

  // Filtrar ganhos e acordos (se admin, todos; se vendedor, apenas os próprios)
  const myAgreements = useMemo(() => {
    if (isAdmin) {
      return records.filter(r => r.vendedor_id !== null && r.vendedor_id !== undefined);
    }
    return records.filter(r => r.vendedor_id === consultant?.id);
  }, [records, consultant, isAdmin]);

  // Calcular métricas
  const stats = useMemo(() => {
    let totalRecuperado = 0;
    let comissaoGanha = 0;
    let totalEmAndamento = 0;

    myAgreements.forEach(rec => {
      const val = Number(rec.valor) || 0;
      if (rec.status === 'PAGO') {
        totalRecuperado += val;
        comissaoGanha += val * 0.20; // 20% de ganho
      } else {
        totalEmAndamento += val;
      }
    });

    return {
      totalRecuperado,
      comissaoGanha,
      totalEmAndamento,
      acordosRealizados: myAgreements.length
    };
  }, [myAgreements]);

  // Ação de assumir cobrança para tentar acordo
  const handleClaimRecord = async (record: BillingRecord) => {
    if (!consultant) return;

    const todayBr = new Date().toLocaleDateString('pt-BR');
    const observacaoAutomatica = `\n[${todayBr}] O consultor ${consultant.name} assumiu esta cobrança judicial para tentar acordo.`;

    const updatedRecord: BillingRecord = {
      ...record,
      vendedor_id: consultant.id,
      observacoes: (record.observacoes || '') + observacaoAutomatica
    };

    try {
      await saveBillingRecord(updatedRecord);
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, vendedor_id: consultant.id, vendedor_nome: consultant.name } : r));
      showToast(`Você assumiu a cobrança de ${record.clienteFornecedor}!`, 'success');
    } catch (err) {
      showToast('Erro ao assumir cobrança.', 'error');
    }
  };

  // Enviar mensagem WhatsApp customizada para acordo
  const handleOpenWhatsApp = (record: BillingRecord) => {
    if (!record.telefone) {
      showToast('Cliente não possui telefone cadastrado.', 'error');
      return;
    }

    const cleanPhone = record.telefone.replace(/\D/g, '');
    const valorOriginal = record.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    // Mensagem de acordo premium e amigável
    const msg = `Olá, ${record.clienteFornecedor}. Tudo bem? Aqui é o ${consultant?.name} da Manos Veículos. Estou entrando em contato de forma direta e exclusiva para conversarmos sobre a pendência do veículo ${record.veiculo || 'adquirido conosco'} no valor de R$ ${valorOriginal}. Tenho autorização especial para te oferecer excelentes facilidades de acordo hoje antes de prosseguir no fórum. Como podemos resolver?`;
    
    const url = `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Abrir Modal de Registrar Acordo
  const handleOpenAgreementModal = (record: BillingRecord) => {
    setSelectedRecordForAgreement(record);
    setAgreementValue(String(record.valor));
    setAgreementInstallments(1);
    setAgreementDate(new Date().toISOString().split('T')[0]);
    setAgreementObs('');
  };

  // Registrar acordo no banco de dados
  const handleRegisterAgreement = async () => {
    if (!selectedRecordForAgreement || !consultant) return;

    const valAcordado = parseFloat(agreementValue) || 0;
    if (valAcordado <= 0) {
      showToast('O valor acordado deve ser maior que zero.', 'error');
      return;
    }

    setSavingAgreement(true);
    try {
      // 1. Inserir na tabela billing_acordos
      const { error: insertError } = await supabaseClient
        .from('billing_acordos')
        .insert({
          record_id: selectedRecordForAgreement.id,
          tipo: agreementType,
          valor_original: selectedRecordForAgreement.valor,
          valor_acordado: valAcordado,
          parcelas: agreementInstallments,
          primeira_parcela: agreementDate || null,
          observacao: agreementObs,
          status: 'ATIVO',
          criado_por: consultant.name
        });

      if (insertError) throw insertError;

      // 2. Atualizar observações da fatura no records_cobrancamanos26
      const todayBr = new Date().toLocaleDateString('pt-BR');
      const tipoLabel = agreementType === 'DESCONTO_VISTA' ? 'Desconto à Vista' : agreementType === 'PARCELAMENTO' ? 'Parcelamento' : 'Promessa de Data';
      const obsAcordo = `\n[${todayBr}] Acordo registrado por ${consultant.name}: ${tipoLabel} no valor de R$ ${valAcordado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${agreementInstallments}x.`;

      const updatedRecord: BillingRecord = {
        ...selectedRecordForAgreement,
        observacoes: (selectedRecordForAgreement.observacoes || '') + obsAcordo
      };

      await saveBillingRecord(updatedRecord);
      
      showToast('Acordo financeiro registrado com sucesso!', 'success');
      setSelectedRecordForAgreement(null);
      loadRecords();
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao gravar acordo: ' + err.message, 'error');
    } finally {
      setSavingAgreement(false);
    }
  };

  // Avisar a Camila via observação e e-mail falso/notificação que o cliente realizou o pagamento
  const handleNotifyPayment = async (record: BillingRecord) => {
    if (!consultant) return;

    if (window.confirm(`Deseja notificar o financeiro (Camila) de que o cliente ${record.clienteFornecedor} realizou o pagamento?`)) {
      const todayBr = new Date().toLocaleDateString('pt-BR');
      const updatedRecord: BillingRecord = {
        ...record,
        observacoes: (record.observacoes || '') + `\n[${todayBr}] O vendedor ${consultant.name} reportou que o cliente realizou o pagamento deste contrato. Aguardando baixa.`
      };

      try {
        await saveBillingRecord(updatedRecord);
        showToast('Camila foi notificada sobre o pagamento!', 'success');
        loadRecords();
      } catch (err) {
        showToast('Erro ao enviar notificação.', 'error');
      }
    }
  };

  // Ação exclusiva de Admin: Excluir Acordo e desvincular o vendedor
  const handleDeleteAgreement = async (record: BillingRecord) => {
    if (!isAdmin) return;

    if (window.confirm(`Tem certeza de que deseja EXCLUIR todos os acordos de ${record.clienteFornecedor} e liberar a cobrança para o time?`)) {
      try {
        const { error: deleteError } = await supabaseClient
          .from('billing_acordos')
          .delete()
          .eq('record_id', record.id);

        if (deleteError) throw deleteError;

        const todayBr = new Date().toLocaleDateString('pt-BR');
        const updatedRecord: BillingRecord = {
          ...record,
          vendedor_id: null as any,
          vendedor_nome: null as any,
          observacoes: (record.observacoes || '') + `\n[${todayBr}] O administrador ${consultant?.name} excluiu os acordos e desvinculou a cobrança.`
        };

        await saveBillingRecord(updatedRecord);
        showToast('Acordo excluído e cobrança desvinculada!', 'success');
        loadRecords();
      } catch (err: any) {
        console.error(err);
        showToast('Erro ao excluir acordo: ' + err.message, 'error');
      }
    }
  };

  // Ação exclusiva de Admin: Apenas desvincular o vendedor mantendo o histórico de acordos
  const handleReleaseRecord = async (record: BillingRecord) => {
    if (!isAdmin) return;

    if (window.confirm(`Deseja desvincular o consultor da cobrança de ${record.clienteFornecedor}?`)) {
      try {
        const todayBr = new Date().toLocaleDateString('pt-BR');
        const updatedRecord: BillingRecord = {
          ...record,
          vendedor_id: null as any,
          vendedor_nome: null as any,
          observacoes: (record.observacoes || '') + `\n[${todayBr}] O administrador ${consultant?.name} desvinculou o vendedor desta cobrança.`
        };

        await saveBillingRecord(updatedRecord);
        showToast('Cobrança desvinculada com sucesso!', 'success');
        loadRecords();
      } catch (err: any) {
        console.error(err);
        showToast('Erro ao desvincular cobrança.', 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] w-full">
        <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 w-full">
        <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 mb-4 animate-bounce">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black text-white">Acesso Restrito</h1>
        <p className="text-zinc-500 text-sm mt-2 max-w-sm">
          Este portal é exclusivo para vendedores e consultores cadastrados na Manos Veículos.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 p-4 md:p-8 pb-20 font-sans text-zinc-300">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            Portal de Acordos <span className="text-sm font-normal text-violet-400">Cobranças & Comissão</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
              <User className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-2">
              <span>{isAdmin ? 'Administrador' : 'Consultor'}:</span>
              <strong className="text-white">{consultant.name}</strong>
              {isAdmin && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-[9px] font-black text-red-400 tracking-wider">
                  PAINEL GERAL
                </span>
              )}
            </span>
          </div>
        </div>
        
        <button
          onClick={loadRecords}
          className="px-4 py-2 bg-zinc-900 border border-zinc-850 text-zinc-300 hover:text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sincronizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <div className="p-5 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl relative overflow-hidden group shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
          <div className="flex items-center gap-3">
            <span className="p-3 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-2xl">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">
                {isAdmin ? 'Comissões Gerais (20%)' : 'Comissão Ganha (20%)'}
              </p>
              <h3 className="text-2xl font-black text-white mt-1.5 font-mono leading-none">
                R$ {stats.comissaoGanha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
        </div>

        <div className="p-5 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl relative overflow-hidden group shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
          <div className="flex items-center gap-3">
            <span className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl">
              <Wallet className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">
                {isAdmin ? 'Total Recuperado Geral' : 'Total Recuperado'}
              </p>
              <h3 className="text-2xl font-black text-white mt-1.5 font-mono leading-none">
                R$ {stats.totalRecuperado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
        </div>

        <div className="p-5 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl relative overflow-hidden group shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
          <div className="flex items-center gap-3">
            <span className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">
                {isAdmin ? 'Total Geral Em Aberto' : 'Em Aberto / Renegociação'}
              </p>
              <h3 className="text-2xl font-black text-white mt-1.5 font-mono leading-none">
                R$ {stats.totalEmAndamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
        </div>

        <div className="p-5 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl relative overflow-hidden group shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
          <div className="flex items-center gap-3">
            <span className="p-3 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-2xl">
              <Award className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">
                {isAdmin ? 'Acordos Totais no CRM' : 'Acordos Assumidos'}
              </p>
              <h3 className="text-2xl font-black text-white mt-1.5 font-mono leading-none">
                {stats.acordosRealizados} Contratos
              </h3>
            </div>
          </div>
        </div>

      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06] gap-1 select-none">
        <button
          onClick={() => setActiveTab('OPORTUNIDADES')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'OPORTUNIDADES'
              ? 'border-violet-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          {isAdmin ? 'Oportunidades Gerais' : 'Oportunidades de Acordo'}
          {opportunities.filter(o => !o.vendedor_id).length > 0 && (
            <span className="ml-1.5 bg-red-500 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full animate-pulse">
              {opportunities.filter(o => !o.vendedor_id).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('GANHOS')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'GANHOS'
              ? 'border-violet-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Award className="w-4 h-4" />
          {isAdmin ? 'Todos os Ganhos & Acordos' : 'Meus Ganhos & Acordos'}
          {myAgreements.filter(a => a.status !== 'PAGO').length > 0 && (
            <span className="ml-1.5 bg-violet-600 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full">
              {myAgreements.filter(a => a.status !== 'PAGO').length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        {activeTab === 'OPORTUNIDADES' ? (
          <motion.div
            key="tab-oportunidades"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <div>
                <h3 className="text-sm font-black text-white">Fila de Cobranças Judiciais Disponíveis</h3>
                <p className="text-zinc-500 text-[11px] mt-0.5">
                  Estes clientes estão na fase de envio a judicial. Recupere o valor para ganhar <strong>20% de comissão</strong> sobre o valor recebido.
                </p>
              </div>

              {opportunities.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  <ShieldAlert className="w-10 h-10 text-zinc-650 mx-auto mb-2" />
                  <p className="text-sm font-bold text-zinc-450">Nenhuma oportunidade de cobrança disponível</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Camila disponibilizará faturas nesta fase conforme a régua de cobrança avançar.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-auto border-collapse text-left">
                    <thead>
                      <tr className="bg-zinc-950/40 text-zinc-500 font-bold border-b border-zinc-800 text-[10px] uppercase tracking-wider">
                        <th className="p-4">Vencimento</th>
                        <th className="p-4">Cliente</th>
                        <th className="p-4">Veículo</th>
                        <th className="p-4">Quem Vendeu</th>
                        {isAdmin && <th className="p-4">Consultor</th>}
                        <th className="p-4 text-right">Valor da Fatura</th>
                        <th className="p-4 text-right text-violet-400">Comissão (20%)</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 text-xs">
                      {opportunities.map((record) => {
                        const comission = record.valor * 0.20;
                        const isClaimedByMe = record.vendedor_id === consultant.id;
                        
                        return (
                          <tr key={record.id} className="hover:bg-zinc-800/10 transition-colors">
                            <td className="p-4 font-mono font-bold text-zinc-500">
                              {record.vencimento.split('-').reverse().join('/')}
                            </td>
                            <td className="p-4">
                              <div className="font-extrabold text-white uppercase">{record.clienteFornecedor}</div>
                              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Tel: {record.telefone || 'Sem telefone'}</div>
                            </td>
                            <td className="p-4 font-bold text-zinc-400">{record.veiculo || 'Nenhum veículo'}</td>
                            <td className="p-4 text-zinc-500 font-medium">{record.quem_vendeu || 'Não informado'}</td>
                            {isAdmin && (
                              <td className="p-4 font-bold text-zinc-300">
                                {record.vendedor_nome ? (
                                  <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] uppercase font-black text-amber-400">
                                    {record.vendedor_nome}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-500 uppercase italic">Disponível</span>
                                )}
                              </td>
                            )}
                            <td className="p-4 font-mono font-black text-white text-right">
                              R$ {record.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 font-mono font-black text-violet-400 text-right">
                              R$ {comission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 text-right">
                              {isClaimedByMe ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleOpenWhatsApp(record)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-755 text-white font-black rounded-xl text-[10px] flex items-center gap-1 cursor-pointer transition-all shadow-md shadow-emerald-950/20"
                                  >
                                    <Play className="w-3 h-3 fill-white" />
                                    WhatsApp
                                  </button>
                                  <button
                                    onClick={() => handleOpenAgreementModal(record)}
                                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-750 text-white font-black rounded-xl text-[10px] flex items-center gap-1 cursor-pointer transition-all shadow-md"
                                  >
                                    <FileText className="w-3 h-3" />
                                    Acordo
                                  </button>
                                </div>
                              ) : record.vendedor_id ? (
                                isAdmin ? (
                                  <button
                                    onClick={() => handleReleaseRecord(record)}
                                    className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/30 border border-red-900/40 text-red-300 font-black rounded-xl text-[10px] cursor-pointer transition-all"
                                    title="Desvincular o vendedor desta cobrança"
                                  >
                                    Desvincular
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-zinc-500 font-bold uppercase italic">Em Tratativa</span>
                                )
                              ) : (
                                <button
                                  onClick={() => handleClaimRecord(record)}
                                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 hover:border-zinc-600 text-white font-black rounded-xl text-[10px] cursor-pointer transition-all"
                                >
                                  Tentar Acordo
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="tab-ganhos"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <div>
                <h3 className="text-sm font-black text-white">Minhas Cobranças & Evolução de Ganhos</h3>
                <p className="text-zinc-500 text-[11px] mt-0.5">
                  Acompanhe aqui o andamento de todos os contratos que você assumiu para acordo. Os ganhos são consolidados quando a fatura for quitada pela Camila.
                </p>
              </div>

              {myAgreements.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  <Wallet className="w-10 h-10 text-zinc-650 mx-auto mb-2" />
                  <p className="text-sm font-bold text-zinc-450">Nenhum acordo assumido por você</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Vá na aba "Oportunidades de Acordo" e clique em "Tentar Acordo" para começar a trabalhar em uma cobrança.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-auto border-collapse text-left">
                    <thead>
                      <tr className="bg-zinc-950/40 text-zinc-500 font-bold border-b border-zinc-800 text-[10px] uppercase tracking-wider">
                        <th className="p-4">Vencimento</th>
                        <th className="p-4">Cliente</th>
                        <th className="p-4">Veículo</th>
                        {isAdmin && <th className="p-4">Consultor</th>}
                        <th className="p-4 text-right">Valor Fatura</th>
                        <th className="p-4 text-right text-violet-400">
                          {isAdmin ? 'Comissão' : 'Minha Comissão'}
                        </th>
                        <th className="p-4 text-center">Status Fatura</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 text-xs">
                      {myAgreements.map((record) => {
                        const comission = record.valor * 0.20;
                        const isPaid = record.status === 'PAGO';
                        
                        return (
                          <tr key={record.id} className="hover:bg-zinc-800/10 transition-colors">
                            <td className="p-4 font-mono font-bold text-zinc-500">
                              {record.vencimento.split('-').reverse().join('/')}
                            </td>
                            <td className="p-4">
                              <div className="font-extrabold text-white uppercase">{record.clienteFornecedor}</div>
                              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Tel: {record.telefone || 'Sem telefone'}</div>
                            </td>
                            <td className="p-4 font-bold text-zinc-400">{record.veiculo || 'Nenhum veículo'}</td>
                            {isAdmin && (
                              <td className="p-4 font-bold text-zinc-300">
                                <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] uppercase font-black text-amber-400">
                                  {record.vendedor_nome || 'Não Informado'}
                                </span>
                              </td>
                            )}
                            <td className="p-4 font-mono font-black text-white text-right">
                              R$ {record.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 font-mono font-black text-violet-400 text-right">
                              R$ {comission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9.5px] font-black uppercase border tracking-wider ${
                                isPaid 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                              }`}>
                                {isPaid ? 'CONSOLIDADA' : 'EM TRABALHO'}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              {!isPaid ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenWhatsApp(record)}
                                    className="p-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-450 border border-emerald-600/20 rounded-xl cursor-pointer transition-all"
                                    title="Chamar Cliente no WhatsApp"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleOpenAgreementModal(record)}
                                    className="px-2.5 py-1.5 bg-violet-600/10 hover:bg-violet-650/20 border border-violet-650/25 text-violet-400 font-black rounded-xl text-[10px] cursor-pointer transition-all"
                                    title="Registrar Nova Renegociação/Acordo"
                                  >
                                    Acordo
                                  </button>
                                  <button
                                    onClick={() => handleNotifyPayment(record)}
                                    className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-350 font-bold border border-zinc-750 rounded-xl text-[10px] cursor-pointer transition-all"
                                    title="Notificar Camila sobre pagamento realizado"
                                  >
                                    Cliente Pagou
                                  </button>
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleDeleteAgreement(record)}
                                      className="px-2.5 py-1.5 bg-red-600/15 hover:bg-red-650/25 border border-red-500/20 text-red-400 font-black rounded-xl text-[10px] cursor-pointer transition-all"
                                      title="Excluir acordo e liberar cobrança"
                                    >
                                      Excluir
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2.5">
                                  <span className="text-[10px] font-black text-emerald-400 flex items-center justify-end gap-1">
                                    <Check className="w-3.5 h-3.5" /> Comissão Paga
                                  </span>
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleDeleteAgreement(record)}
                                      className="px-2.5 py-1 bg-red-650/15 hover:bg-red-650/25 border border-red-500/20 text-red-400 font-black rounded-xl text-[10px] cursor-pointer transition-all"
                                      title="Desfazer acordo consolidado e liberar faturamento"
                                    >
                                      Excluir
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Registro de Acordo */}
      <AnimatePresence>
        {selectedRecordForAgreement && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1A1A20] border border-zinc-800 p-6 rounded-3xl max-w-md w-full space-y-5 shadow-2xl relative"
            >
              <button 
                onClick={() => setSelectedRecordForAgreement(null)}
                className="absolute top-4 right-4 p-1.5 rounded-xl bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-1">
                <h3 className="text-base font-black text-white uppercase tracking-tight">Registrar Acordo</h3>
                <p className="text-zinc-500 text-xs leading-relaxed">
                  Cliente: <strong className="text-zinc-300">{selectedRecordForAgreement.clienteFornecedor}</strong><br />
                  Fatura Original: <strong className="text-sky-400">R$ {selectedRecordForAgreement.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </p>
              </div>

              <div className="space-y-4">
                
                <div className="flex flex-col">
                  <label className="text-zinc-550 text-[10px] font-black uppercase tracking-widest mb-1.5">Tipo de Acordo</label>
                  <select
                    value={agreementType}
                    onChange={(e) => setAgreementType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors font-bold"
                  >
                    <option value="DESCONTO_VISTA">Desconto à Vista</option>
                    <option value="PARCELAMENTO">Parcelamento do Valor</option>
                    <option value="PROMESSA_DATA">Promessa de Pagamento na Data</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-zinc-550 text-[10px] font-black uppercase tracking-widest mb-1.5">Valor Acordado</label>
                    <input
                      type="number"
                      placeholder="Ex: 4500"
                      value={agreementValue}
                      onChange={(e) => setAgreementValue(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors font-mono font-bold"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-zinc-550 text-[10px] font-black uppercase tracking-widest mb-1.5">Parcelas</label>
                    <input
                      type="number"
                      min={1}
                      disabled={agreementType === 'DESCONTO_VISTA'}
                      value={agreementType === 'DESCONTO_VISTA' ? 1 : agreementInstallments}
                      onChange={(e) => setAgreementInstallments(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors font-mono font-bold disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="text-zinc-550 text-[10px] font-black uppercase tracking-widest mb-1.5">Data de Vencimento (1ª Parcela)</label>
                  <input
                    type="date"
                    value={agreementDate}
                    onChange={(e) => setAgreementDate(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors font-mono"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-zinc-550 text-[10px] font-black uppercase tracking-widest mb-1.5">Observações do Acordo</label>
                  <textarea
                    placeholder="Descreva detalhes como: forma de pagamento, promessas..."
                    value={agreementObs}
                    onChange={(e) => setAgreementObs(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors resize-none"
                  />
                </div>

              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setSelectedRecordForAgreement(null)}
                  className="flex-1 py-2.5 bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-white rounded-xl text-xs font-black transition-colors cursor-pointer text-center"
                >
                  Cancelar
                </button>
                
                <button
                  onClick={handleRegisterAgreement}
                  disabled={savingAgreement}
                  className="flex-1 py-2.5 bg-gradient-to-r from-violet-650 to-indigo-650 hover:from-violet-700 hover:to-indigo-700 text-white font-black rounded-xl text-xs transition-all shadow-lg shadow-violet-950/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {savingAgreement ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Gravar Acordo
                    </>
                  )}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Toast System */}
      <AnimatePresence>
        {toast && (
          <div className="fixed bottom-6 right-6 z-[100]">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className={`p-4 rounded-2xl shadow-2xl border text-xs font-bold leading-normal flex items-center gap-2.5 backdrop-blur-xl ${
                toast.type === 'success' 
                  ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400' 
                  : 'bg-red-950/80 border-red-500/30 text-red-400'
              }`}
            >
              {toast.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-red-400" />
              )}
              <span>{toast.message}</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
