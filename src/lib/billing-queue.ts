import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { EventEmitter } from 'events';

// Suffix tables as specified
const TABLE_REMINDERS = 'reminders_cobrancamanos26';
const TARGET_WEBHOOK_URL = 'https://n8n.drivvoo.com/webhook/2f0348ba-8965-421f-bc99-d2572a1d2057';

export interface QueueItem {
  id: string;
  recordId: string;
  nome: string;
  telefone: string;
  vencimento: string;
  valor: number;
  msg: string;
  estagio: string;
  status: 'AGUARDANDO' | 'ENVIANDO' | 'SUCESSO' | 'ERRO' | 'DUPLICIDADE';
  addedAt: string;
}

export interface WebhookLog {
  id: string;
  timestamp: string;
  nome: string;
  telefone: string;
  vencimento: string;
  valor: string;
  estagio: string;
  status: 'SUCESSO' | 'ERRO' | 'PULADO';
  errorMessage?: string;
}

// Global declarations to hold state inside Next.js server context without duplicates
declare global {
  var billingQueue: QueueItem[] | undefined;
  var isQueueActive: boolean | undefined;
  var queueIntervalSeconds: number | undefined;
  var secondsUntilNextDispatch: number | undefined;
  var lastDispatchTime: string | undefined;
  var webhookLogsHistory: WebhookLog[] | undefined;
  var queueIntervalId: NodeJS.Timeout | undefined;
  var deliveryEmitter: EventEmitter | undefined;
  var allowedStartHour: string | undefined;
  var allowedEndHour: string | undefined;
}

// Initialize singleton instances
export const getBillingQueue = () => {
  if (!globalThis.billingQueue) globalThis.billingQueue = [];
  return globalThis.billingQueue;
};

export const setBillingQueue = (queue: QueueItem[]) => {
  globalThis.billingQueue = queue;
};

export const getIsQueueActive = () => {
  if (globalThis.isQueueActive === undefined) globalThis.isQueueActive = true;
  return globalThis.isQueueActive;
};

export const setIsQueueActive = (active: boolean) => {
  globalThis.isQueueActive = active;
};

export const getQueueIntervalSeconds = () => {
  if (!globalThis.queueIntervalSeconds) globalThis.queueIntervalSeconds = 180; // 3 min default
  return globalThis.queueIntervalSeconds;
};

export const setQueueIntervalSeconds = (secs: number) => {
  globalThis.queueIntervalSeconds = secs;
};

export const getSecondsUntilNextDispatch = () => {
  if (globalThis.secondsUntilNextDispatch === undefined) globalThis.secondsUntilNextDispatch = getQueueIntervalSeconds();
  return globalThis.secondsUntilNextDispatch;
};

export const setSecondsUntilNextDispatch = (secs: number) => {
  globalThis.secondsUntilNextDispatch = secs;
};

export const getLastDispatchTime = () => {
  if (!globalThis.lastDispatchTime) globalThis.lastDispatchTime = 'Nenhum no momento';
  return globalThis.lastDispatchTime;
};

export const setLastDispatchTime = (time: string) => {
  globalThis.lastDispatchTime = time;
};

export const getWebhookLogsHistory = () => {
  if (!globalThis.webhookLogsHistory) globalThis.webhookLogsHistory = [];
  return globalThis.webhookLogsHistory;
};

export const addWebhookLog = (log: WebhookLog) => {
  const history = getWebhookLogsHistory();
  history.unshift(log);
  if (history.length > 100) {
    history.pop();
  }
};

/**
 * Upsert: atualiza um log existente se encontrar match por (telefone + vencimento + estagio).
 * Se não encontrar, insere como novo. Evita duplicatas ERRO + SUCESSO para o mesmo contato.
 */
export const upsertWebhookLog = (log: WebhookLog) => {
  const history = getWebhookLogsHistory();
  const cleanNew = log.telefone.replace(/\D/g, '').slice(-8);

  const existingIndex = history.findIndex(existing => {
    const cleanExisting = existing.telefone.replace(/\D/g, '').slice(-8);
    return (
      cleanExisting === cleanNew &&
      existing.vencimento === log.vencimento &&
      String(existing.estagio || '').toUpperCase() === String(log.estagio || '').toUpperCase()
    );
  });

  if (existingIndex >= 0) {
    // Atualiza o registro existente preservando o ID original
    history[existingIndex] = {
      ...history[existingIndex],
      ...log,
      id: history[existingIndex].id, // mantém ID original
    };
  } else {
    // Insere como novo registro no topo
    history.unshift(log);
    if (history.length > 100) history.pop();
  }
};

export const getDeliveryEmitter = () => {
  if (!globalThis.deliveryEmitter) globalThis.deliveryEmitter = new EventEmitter();
  return globalThis.deliveryEmitter;
};

export const getAllowedStartHour = () => {
  if (!globalThis.allowedStartHour) globalThis.allowedStartHour = '08:00';
  return globalThis.allowedStartHour;
};

export const setAllowedStartHour = (hour: string) => {
  globalThis.allowedStartHour = hour;
};

export const getAllowedEndHour = () => {
  if (!globalThis.allowedEndHour) globalThis.allowedEndHour = '18:00';
  return globalThis.allowedEndHour;
};

export const setAllowedEndHour = (hour: string) => {
  globalThis.allowedEndHour = hour;
};

export const checkIsWithinAllowedHours = () => {
  const nowBr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hourStr = String(nowBr.getHours()).padStart(2, '0');
  const minStr = String(nowBr.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${hourStr}:${minStr}`;

  const start = getAllowedStartHour();
  const end = getAllowedEndHour();

  if (start <= end) {
    return currentTimeStr >= start && currentTimeStr <= end;
  }
  return currentTimeStr >= start || currentTimeStr <= end;
};

// Helper matching logic
const matchTelefone = (phone1: string, phone2: string) => {
  const p1 = String(phone1).replace(/\D/g, '');
  const p2 = String(phone2).replace(/\D/g, '');
  if (!p1 || !p2) return false;
  return p1 === p2 || p1.endsWith(p2) || p2.endsWith(p1);
};

// Helper promise to wait up to a timeout for delivery notification
export const waitForDelivery = (
  targetTelefone: string,
  targetEstagio: string,
  targetVencimento: string,
  targetRecordId?: string,
  timeoutMs: number = 5000
): Promise<{ success: boolean; status: string; errorMessage?: string }> => {
  const emitter = getDeliveryEmitter();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve({ 
        success: false, 
        status: 'TIMEOUT', 
        errorMessage: 'Mensagem não enviada: Tempo limite de 5 segundos esgotado sem confirmação de entrega.' 
      });
    }, timeoutMs);

    const listener = (data: any) => {
      if (matchTelefone(data.telefone, targetTelefone)) {
        const recordIdMatches = targetRecordId && data.recordId && String(targetRecordId) === String(data.recordId);
        const vencimentoMatches = targetVencimento && data.vencimento && String(targetVencimento) === String(data.vencimento);
        const estagioMatches = targetEstagio && data.estagio && String(targetEstagio).toUpperCase() === String(data.estagio).toUpperCase();

        if (recordIdMatches || vencimentoMatches || estagioMatches) {
          cleanup();
          if (data.status === 'ERRO') {
            resolve({ success: false, status: 'ERRO', errorMessage: 'Mensagem não enviada: Erro de entrega relatado.' });
          } else {
            resolve({ success: true, status: 'SUCESSO' });
          }
        }
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      emitter.off('delivery', listener);
    };

    emitter.on('delivery', listener);
  });
};

// Worker function to dispatch a queue item
export async function processNextQueueItem() {
  const queue = getBillingQueue();
  if (queue.length === 0) return;

  const item = queue[0];
  item.status = 'ENVIANDO';

  const supabaseAdmin = createAdminClient();
  const cleanPhone = item.telefone.replace(/\D/g, '');

  try {
    // 1. Double Dispatch Prevention Check
    const { data: match } = await supabaseAdmin
      .from('registro_envios_whatsapp')
      .select('id')
      .ilike('destinatario_id', `%${cleanPhone}%`)
      .eq('vencimento', item.vencimento)
      .eq('estagio_cobranca', item.estagio)
      .limit(1);

    if (match && match.length > 0) {
      item.status = 'DUPLICIDADE';
      queue.shift(); // Remove from queue

      const logEntry: WebhookLog = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        nome: item.nome,
        telefone: item.telefone,
        vencimento: item.vencimento,
        valor: String(item.valor),
        estagio: item.estagio,
        status: 'PULADO',
        errorMessage: 'Bloqueado: Cobrança já enviada anteriormente (registro_envios_whatsapp).'
      };
      addWebhookLog(logEntry);
      setLastDispatchTime(`${new Date().toLocaleTimeString('pt-BR')} (Duplicidade Bloqueada: ${item.nome})`);
      return;
    }

    // 2. Execute Webhook Trigger on n8n
    const res = await fetch(TARGET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: item.nome,
        telefone: item.telefone,
        'data de vencimento': item.vencimento,
        valor: item.valor,
        'msg para whatsapp completo': item.msg,
        estagio: item.estagio
      })
    });

    if (res.ok) {
      // Remove from queue immediately on successful webhook call
      queue.shift();
      setLastDispatchTime(`${new Date().toLocaleTimeString('pt-BR')} (Webhook enviado, verificando em 1m: ${item.nome})`);

      // Cria log inicial PENDENTE na memória (será atualizado após 1 minuto)
      const pendingLogId = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      addWebhookLog({
        id: pendingLogId,
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        nome: item.nome,
        telefone: item.telefone,
        vencimento: item.vencimento,
        valor: String(item.valor),
        estagio: item.estagio,
        status: 'ERRO', // status inicial conservador, será atualizado
        errorMessage: 'Aguardando confirmação do banco (verifica em 1 minuto)...'
      });

      // Verifica no banco após 1 minuto e ATUALIZA o log existente (sem duplicar)
      setTimeout(async () => {
        try {
          const checkTimestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

          const { data: finalMatch } = await supabaseAdmin
            .from('registro_envios_whatsapp')
            .select('id')
            .ilike('destinatario_id', `%${cleanPhone}%`)
            .eq('vencimento', item.vencimento)
            .eq('estagio_cobranca', item.estagio)
            .limit(1);

          if (finalMatch && finalMatch.length > 0) {
            // SUCESSO: atualiza o log existente para SUCESSO (sem criar novo)
            upsertWebhookLog({
              id: pendingLogId,
              timestamp: checkTimestamp,
              nome: item.nome,
              telefone: item.telefone,
              vencimento: item.vencimento,
              valor: String(item.valor),
              estagio: item.estagio,
              status: 'SUCESSO'
            });
            setLastDispatchTime(`${new Date().toLocaleTimeString('pt-BR')} (Enviado com sucesso: ${item.nome})`);
          } else {
            // ERRO: atualiza o log existente para ERRO definitivo
            upsertWebhookLog({
              id: pendingLogId,
              timestamp: checkTimestamp,
              nome: item.nome,
              telefone: item.telefone,
              vencimento: item.vencimento,
              valor: String(item.valor),
              estagio: item.estagio,
              status: 'ERRO',
              errorMessage: 'Erro ao enviar: Contato não salvo no banco após 1 minuto.'
            });
            setLastDispatchTime(`${new Date().toLocaleTimeString('pt-BR')} (Erro ao enviar: ${item.nome})`);
          }
        } catch (dbErr: any) {
          console.error('[Queue delayed verification error]', dbErr);
        }
      }, 60000); // 1 minuto (60.000 ms)

    } else {
      const errText = await res.text();
      // Remove from queue even if failed so queue doesn't block forever
      queue.shift();

      const logEntry: WebhookLog = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        nome: item.nome,
        telefone: item.telefone,
        vencimento: item.vencimento,
        valor: String(item.valor),
        estagio: item.estagio,
        status: 'ERRO',
        errorMessage: `Erro Webhook (Status ${res.status}): ${errText}`
      };
      addWebhookLog(logEntry);
      setLastDispatchTime(`${new Date().toLocaleTimeString('pt-BR')} (Erro n8n: ${item.nome})`);
    }

  } catch (err: any) {
    // Remove from queue on network error to avoid blocking the queue
    queue.shift();

    const logEntry: WebhookLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      nome: item.nome,
      telefone: item.telefone,
      vencimento: item.vencimento,
      valor: String(item.valor),
      estagio: item.estagio,
      status: 'ERRO',
      errorMessage: err.message || 'Erro de Conexão'
    };
    addWebhookLog(logEntry);
    setLastDispatchTime(`${new Date().toLocaleTimeString('pt-BR')} (Erro de rede: ${item.nome})`);
  }
}

// Start Background Loop (runs once if not already initialized in Node processes)
export function initQueueProcessor() {
  if (globalThis.queueIntervalId) return;

  globalThis.queueIntervalId = setInterval(async () => {
    if (!getIsQueueActive()) return;
    const queue = getBillingQueue();
    if (queue.length === 0) return;

    // Pausar o temporizador se estiver fora do horário permitido
    if (!checkIsWithinAllowedHours()) {
      return;
    }

    let remaining = getSecondsUntilNextDispatch();
    remaining--;
    setSecondsUntilNextDispatch(remaining);

    if (remaining <= 0) {
      setSecondsUntilNextDispatch(getQueueIntervalSeconds()); // Reset timer
      await processNextQueueItem();
    }
  }, 1000);
}
