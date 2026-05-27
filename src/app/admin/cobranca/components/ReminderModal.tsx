import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Send, Copy, Check, MessageSquare, AlertCircle, Sparkles, 
  Settings, CheckCircle2, AlertTriangle, RefreshCw, Play
} from 'lucide-react';
import { BillingRecord } from '@/types';

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: BillingRecord | null;
}

export type ReminderStage = 
  | 'PRE_1_DIA'
  | 'NO_DIA'
  | 'POS_1_DIA'
  | 'POS_3_DIAS'
  | 'POS_5_DIAS'
  | 'POS_10_DIAS'
  | 'POS_30_DIAS';

export default function ReminderModal({ isOpen, onClose, record }: ReminderModalProps) {
  const [stage, setStage] = useState<ReminderStage>('NO_DIA');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ success: boolean; text: string } | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getSaudacao = () => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Bom dia';
    if (hours < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  useEffect(() => {
    if (!record) return;

    const calculateRecommendedStage = (): ReminderStage => {
      if (record.status === 'PENDENTE') {
        const todayStr = '2026-05-27';
        if (record.vencimento === todayStr) {
          return 'NO_DIA';
        }
        return 'PRE_1_DIA';
      } else if (record.status === 'ATRASADO') {
        const t1 = new Date('2026-05-27').getTime();
        const t2 = new Date(record.vencimento).getTime();
        const diffDays = Math.floor((t1 - t2) / (1000 * 3600 * 24));
        
        if (diffDays >= 30) return 'POS_30_DIAS';
        if (diffDays >= 10) return 'POS_10_DIAS';
        if (diffDays >= 5) return 'POS_5_DIAS';
        if (diffDays >= 3) return 'POS_3_DIAS';
        return 'POS_1_DIA';
      }
      return 'NO_DIA';
    };

    setStage(calculateRecommendedStage());
  }, [record, isOpen]);

  useEffect(() => {
    if (!record) return;

    const valStr = formatCurrency(record.valor);
    const dateStr = formatDate(record.vencimento);
    const saudacao = getSaudacao();

    // Normaliza o campo veículo: ignora valores vazios ou "nenhum veículo cadastrado"
    const veiculoRaw = record.veiculo && String(record.veiculo).trim();
    const veiculo = veiculoRaw && !veiculoRaw.toLowerCase().includes('nenhum')
      ? veiculoRaw
      : null;
    const veiculoSufixo = veiculo ? ` *${veiculo}*` : '';

    let text = '';
    switch (stage) {
      case 'PRE_1_DIA':
        text = 
          `${saudacao}, *${record.clienteFornecedor}*! 🗓️\n\n` +
          `Passamos para lembrar que a próxima parcela do seu contrato de *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}* tem vencimento agendado para amanhã, dia *${dateStr}*.\n\n` +
          `Para a sua comodidade, você pode realizar a transferência via chave Pix CNPJ:\n` +
          `🔑 *28.918.081/0001-22*\n` +
          `🏦 Razão Social: *Raccar comércio de veículos*\n\n` +
          `*Obs:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.\n\n` +
          `Se o pagamento já foi efetuado, por gentileza ignore esta mensagem. Forte abraço da equipe Raccar!`;
        break;

      case 'NO_DIA':
        text = 
          `📌 *AVISO DE PARCELA - VENCE HOJE* 📌\n\n` +
          `Olá, *${record.clienteFornecedor}*.\n\n` +
          `Informamos que a parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}* vence na data de hoje, *${dateStr}*.\n\n` +
          `Efetue o acerto com praticidade e mantenha seu cadastro Raccar 100% em dia usando a nossa chave de repasse rápido Pix:\n` +
          `🔑 *28.918.081/0001-22*\n` +
          `🏦 Empresa: *Raccar comércio de veículos*\n\n` +
          `*Obs:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.\n\n` +
          `Após a realização, por gentileza nos envie o comprovante de pagamento por aqui. Tenha um ótimo dia!`;
        break;

      case 'POS_1_DIA':
        text = 
          `⚠️ *AVISO FINANCEIRO - PAGAMENTO EM ABERTO* ⚠️\n\n` +
          `Prezado(a) *${record.clienteFornecedor}*,\n\n` +
          `Notamos que a parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}*, com vencimento em *${dateStr}* (vencido ontem), ainda não foi compensada em nosso controle.\n\n` +
          `Evite a incidência de novos juros diários realizando o fechamento pela nossa chave Pix:\n` +
          `🔑 *28.918.081/0001-22*\n` +
          `🏦 Empresa: *Raccar comércio de veículos*\n\n` +
          `*Obs:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.\n\n` +
          `Caso já tenha efetuado o pagamento nas últimas horas, envie-nos o comprovante para procedermos com a imediata baixa.`;
        break;

      case 'POS_3_DIAS':
        text = 
          `⏳ *AVISO COBRANÇA RECORRENTE - 3 DIAS EM ATRASO* ⏳\n\n` +
          `Prezado(a) *${record.clienteFornecedor}*,\n\n` +
          `Até a presente data, não localizamos em nosso extrato financeiro o envio da parcela de *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}*, vencida em *${dateStr}*.\n\n` +
          `Favor efetuar a regulamentação imediata por meio de nossa chave Pix CNPJ para suspender contatos adicionais de cobrança:\n` +
          `🔑 *28.918.081/0001-22*\n` +
          `🏦 Empresa: *Raccar comércio de veículos*\n\n` +
          `*Obs:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens para que possamos analisar.\n\n` +
          `Ficamos no aguardo de sua confirmação.`;
        break;

      case 'POS_5_DIAS':
        text = 
          `❌ *AVISO DE DEVEDOR - 5 DIAS DE INADIMPLÊNCIA* ❌\n\n` +
          `Prezado(a) *${record.clienteFornecedor}*,\n\n` +
          `Constatamos que o seu contrato referente à *Compra do Veículo${veiculoSufixo}* acusa uma pendência de faturamento de 5 dias na parcela no valor de *${valStr}* (vencimento original no dia *${dateStr}*).\n\n` +
          `Para regularizar de forma imediata e manter o seu contrato em plena conformidade comercial, efetue transferência na chave Pix CNPJ:\n` +
          `🔑 *28.918.081/0001-22*\n` +
          `🏦 Favorecido: *Raccar comércio de veículos*\n\n` +
          `*Obs:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.\n\n` +
          `Envie o comprovante de transferência logo após concluir o Pix.`;
        break;

      case 'POS_10_DIAS':
        text = 
          `🚨 *AVISO DE COBRANÇA - PRÉ-PROTESTO EM CARTÓRIO* 🚨\n\n` +
          `*NOTIFICAÇÃO FORMAL DE COBRANÇA - RACCAR COMÉRCIO DE VEÍCULOS*\n\n` +
          `Prezado(a) *${record.clienteFornecedor}*,\n\n` +
          `Seu contrato ativo de *Compra do Veículo${veiculoSufixo}* atingiu *10 dias de atraso* na parcela do vencimento *${dateStr}*, com valor nominal de *${valStr}*.\n\n` +
          `Devido ao atraso prolongado, seu faturamento está programado para envio à assessoria jurídica e eventual *PROTESTO COMERCIAL EM CARTÓRIO*, com anotações restritivas nos órgãos de proteção ao crédito (SPC/SERASA).\n\n` +
          `Regularize seu débito hoje com prioridade via Pix corporativo:\n` +
          `🔑 *28.918.081/0001-22*\n` +
          `🏦 Beneficiário: *Raccar comércio de veículos*\n\n` +
          `*Obs:* Caso tenha interesse em renegociar antes que o envio cartorário ocorra, sinalize essa mensagem IMEDIATAMENTE com a proposta que tens.`;
        break;

      case 'POS_30_DIAS':
        text = 
          `⚖️ *NOTIFICAÇÃO EXTRAJUDICIAL E ALERTA DE EXECUÇÃO JURÍDICA (30 DIAS)* ⚖️\n\n` +
          `*DEPARTAMENTO JURÍDICO - RACCAR COMÉRCIO DE VEÍCULOS*\n\n` +
          `Prezado(a) *${record.clienteFornecedor}*,\n\n` +
          `Constatamos que a parcela referente ao seu contrato de *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}* acumula *30 dias de atraso histórico* (desde *${dateStr}*).\n\n` +
          `Seu contrato de compra foi elegível para encaminhamento para cobrança de natureza judicial (Medidas de Busca e Apreensão ou Execução de Título}.\n\n` +
          `Como última oportunidade de acordo para suspensão de trâmites litigiosos, regularize via Pix oficial:\n` +
          `🔑 *28.918.081/0001-22*\n` +
          `🏦 Destinatário: *Raccar comércio de veículos*\n\n` +
          `*Obs:* Caso tenha interesse em renegociar e sustar as medidas processuais descritas, sinalize essa mensagem AGORA com a proposta que tens!`;
        break;
    }

    setMessage(text);
    setWebhookResult(null);

  }, [record, stage, isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    if (!record) return;
    const cleanPhone = record.telefone.replace(/\D/g, '');
    const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const url = `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleTriggerWebhook = async () => {
    if (!record) return;

    setWebhookLoading(true);
    setWebhookResult(null);

    try {
      const response = await fetch('/api/billing/trigger-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: record.clienteFornecedor,
          telefone: record.telefone,
          vencimento: record.vencimento,
          valor: record.valor,
          msg: message,
          estagio: stage,
          recordId: record.id
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setWebhookResult({
          success: true,
          text: data.message || `Sucesso! Disparo confirmado no WhatsApp.`
        });
      } else {
        setWebhookResult({
          success: false,
          text: `Erro: ${data.error || 'Envio recusado ou falhou.'}`
        });
      }
    } catch (err: any) {
      setWebhookResult({
        success: false,
        text: `Erro de rede ao conectar com o n8n.`
      });
    } finally {
      setWebhookLoading(false);
    }
  };

  const STAGES_CONFIG = [
    { id: 'PRE_1_DIA', tag: '1 dia antes', desc: 'Aviso prévio amigável' },
    { id: 'NO_DIA', tag: 'No Vencimento', desc: 'Vence no dia de hoje' },
    { id: 'POS_1_DIA', tag: '1 dia atrasado', desc: 'Lembrete após vencido' },
    { id: 'POS_3_DIAS', tag: '3 dias atrasado', desc: 'Alerta inicial' },
    { id: 'POS_5_DIAS', tag: '5 dias atrasado', desc: 'Notificação ostensiva' },
    { id: 'POS_10_DIAS', tag: '10 dias atrasado', desc: 'Aviso prévio de cartório' },
    { id: 'POS_30_DIAS', tag: '30 dias atrasado', desc: 'Último aviso jurídico' },
  ];

  return (
    <AnimatePresence>
      {isOpen && record && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#03060b]/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl z-10 text-zinc-300 font-sans max-h-[95vh] overflow-y-auto"
            id="reminder-modal-box"
          >
            {/* Top accent line */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-violet-600" />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Régua de Disparo WhatsApp Comercial
                  </h3>
                  <p className="text-zinc-400 text-xs mt-1 font-bold">
                    Selecione a fase ideal de cobrança para renegociar a compra do veículo de forma segura.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-350 hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stage Selector */}
            <div className="mt-5">
              <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                Selecione o Estágio Oficial de Cobrança
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {STAGES_CONFIG.map((cfg) => (
                  <button
                    key={cfg.id}
                    onClick={() => setStage(cfg.id as any)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all duration-200 text-xs cursor-pointer ${
                      stage === cfg.id
                        ? 'border-violet-500/40 bg-violet-500/10 text-white font-extrabold shadow-md'
                        : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span className="font-extrabold truncate text-[11px]">{cfg.tag}</span>
                    <span className="text-[9px] text-zinc-500 mt-1 truncate leading-none">{cfg.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Text Preview & Automation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              
              {/* Text Preview */}
              <div className="md:col-span-2 flex flex-col">
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                    Visualização do Texto Oficial
                  </span>
                  <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 font-bold font-mono">
                    PIX ATIVO (RACCAR)
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-950/60 font-sans text-xs text-zinc-300 leading-relaxed h-[200px] overflow-y-auto whitespace-pre-wrap select-text relative scrollbar-thin scrollbar-thumb-zinc-700">
                  {message}
                </div>
              </div>

              {/* Automation Center */}
              <div className="flex flex-col justify-between bg-zinc-950/30 border border-zinc-850 p-4 rounded-2xl">
                <div>
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 mb-2.5 border-b border-white/[0.06] pb-2">
                    <Settings className="w-3.5 h-3.5 text-zinc-500" />
                    Automação n8n
                  </h4>
                  <p className="text-[10.5px] text-zinc-500 leading-relaxed mb-3">
                    Despacha os dados de cobrança estruturados para o webhook unificado do n8n.
                  </p>
                  <p className="bg-zinc-950 border border-zinc-850 text-zinc-300 p-1.5 rounded-lg font-mono text-[9px] break-all mb-2 shadow-sm text-center">
                    POST /api/billing/trigger-webhook
                  </p>
                </div>

                <div className="space-y-2.5">
                  {webhookResult && (
                    <div className={`p-2.5 rounded-xl text-[10px] flex items-start gap-1.5 font-bold select-none border ${
                      webhookResult.success 
                        ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400' 
                        : 'bg-red-500/5 border-red-500/10 text-red-400'
                    }`}>
                      {webhookResult.success ? (
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <span>{webhookResult.text}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleTriggerWebhook}
                    disabled={webhookLoading}
                    className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-violet-900/20"
                  >
                    {webhookLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Disparando...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-violet-100 fill-violet-100" />
                        Disparar no n8n
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>

            {/* Warning bottom info */}
            <div className="mt-4 p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 text-[10.5px] leading-relaxed text-zinc-400 flex items-start gap-2.5 select-none md:col-span-3">
              <AlertCircle className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
              <div>
                Régua de contatos corporativos em conformidade: sem menção a Frotas, referenciando especificamente a <strong>compra do veículo</strong>, e Pix oficial CNPJ <strong>28.918.081/0001-22</strong> da Raccar comércio de veículos.
              </div>
            </div>

            {/* Footer */}
            <div className="mt-5 pt-4 border-t border-white/[0.06] flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-mono text-[9px] truncate max-w-[200px] font-bold">
                {record.clienteFornecedor} ({record.telefone})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-zinc-700/60 hover:bg-zinc-850 text-zinc-450 hover:text-zinc-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-4 py-2 border border-zinc-700/60 hover:bg-zinc-850 text-zinc-450 hover:text-zinc-200 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-500" />
                      Copiar Texto
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-900/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  Abrir WhatsApp
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
