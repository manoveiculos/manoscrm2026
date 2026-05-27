import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { getBillingQueue, getQueueIntervalSeconds, setSecondsUntilNextDispatch } from '@/lib/billing-queue';

export async function POST(req: Request) {
  try {
    const { records, todayStr, forcedStage } = await req.json();

    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'Campo records com array de faturamentos é obrigatório.' }, { status: 400 });
    }

    const billingQueue = getBillingQueue();
    const checkDate = todayStr || '2026-05-27';
    let newlyQueuedCount = 0;
    let duplicateSkippedCount = 0;

    const getDaysDiff = (dueStr: string, refStr: string): number => {
      const d1 = new Date(dueStr);
      const d2 = new Date(refStr);
      const diffTime = d2.getTime() - d1.getTime();
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    const formatBRL = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const fmtDateBr = (dateStr: string) => {
      const parts = dateStr.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
    };

    const supabaseAdmin = createAdminClient();
    
    // Fetch already sent stage records from 'registro_envios_whatsapp' to protect clients from spam
    let reminders: any[] = [];
    try {
      const { data } = await supabaseAdmin
        .from('registro_envios_whatsapp')
        .select('destinatario_id, vencimento, estagio_cobranca');
      reminders = data || [];
    } catch (e: any) {
      console.warn('[Supabase API Warning] Failed to fetch reminders for batch scheduling:', e.message);
    }

    for (const rec of records) {
      if (rec.status === 'PAGO') continue;

      const diff = getDaysDiff(rec.vencimento, checkDate);
      let stage: string | null = forcedStage || null;

      if (!stage) {
        if (diff === -1) stage = 'PRE_1_DIA';
        else if (diff === 0) stage = 'NO_DIA';
        else if (diff === 1) stage = 'POS_1_DIA';
        else if (diff === 3) stage = 'POS_3_DIAS';
        else if (diff === 5) stage = 'POS_5_DIAS';
        else if (diff === 10) stage = 'POS_10_DIAS';
        else if (diff >= 30) stage = 'POS_30_DIAS';
        else stage = 'AVULSO'; // Fallback stage so it enqueues successfully instead of being ignored!
      }

      if (stage) {
        // Double check against database records_envios_whatsapp log
        const cleanRecPhone = rec.telefone.replace(/\D/g, '');
        const isAlreadySent = reminders.some(el => {
          const destId = el.destinatario_id || '';
          return destId.includes(cleanRecPhone) && 
                 el.vencimento === rec.vencimento && 
                 String(el.estagio_cobranca).toUpperCase() === String(stage).toUpperCase();
        });

        if (isAlreadySent) {
          duplicateSkippedCount++;
          continue;
        }

        // Double check inside current queue
        const isAlreadyInQueue = billingQueue.some(item => {
          const cleanQueuePhone = item.telefone.replace(/\D/g, '');
          return cleanQueuePhone === cleanRecPhone && 
                 item.vencimento === rec.vencimento && 
                 item.estagio === stage;
        });

        if (isAlreadyInQueue) {
          duplicateSkippedCount++;
          continue;
        }

        const valStr = formatBRL(rec.valor);
        const dateStrBr = fmtDateBr(rec.vencimento);
        let msg = '';

        // Helper: retorna referência correta ao veículo
        // Com veículo: "do veículo *NOME*" | Sem veículo: apenas omite
        const veiculo = rec.veiculo && rec.veiculo.trim() !== '' && !rec.veiculo.toLowerCase().includes('nenhum')
          ? rec.veiculo.trim()
          : null;
        const veiculoSufixo = veiculo ? ` *${veiculo}*` : '';

        if (stage === 'PRE_1_DIA') {
          msg = `Olá, *${rec.clienteFornecedor}*!\n\n` +
                `Sua parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}* tem vencimento agendado para amanhã, dia *${dateStrBr}*.\n\n` +
                `Para sua comodidade, você pode efetuar o pagamento diretamente pela nossa chave Pix CNPJ:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `*Obs:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.\n\n` +
                `Se o pagamento já foi realizado, desconsidere este aviso. Agradecemos a parceria!`;
        } else if (stage === 'NO_DIA') {
          msg = `Aviso de Parcela - Vence Hoje 📌\n\n` +
                `Olá, *${rec.clienteFornecedor}*.\n\n` +
                `Lembramos que a parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}* vence na data de hoje, *${dateStrBr}*.\n\n` +
                `Aproveite para realizar o acerto via Pix de forma imediata:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `*Negociação:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.\n\n` +
                `Por gentileza, envie o comprovante de pagamento por aqui. Obrigado!`;
        } else if (stage === 'POS_1_DIA') {
          msg = `⚠️ *Lembrete Importante de Cobrança* ⚠️\n\n` +
                `Prezado(a) *${rec.clienteFornecedor}*,\n\n` +
                `Identificamos que a parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}*, vencida ontem (*${dateStrBr}*), consta em aberto em nosso sistema.\n\n` +
                `Para regularização imediata sem incidência de novos encargos de atraso, utilize nossa chave Pix:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `*Obs:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.`;
        } else if (stage === 'POS_3_DIAS') {
          msg = `⚠️ *Notificação de Débito Pendente - 3 Dias de Atraso* ⚠️\n\n` +
                `Prezado(a) *${rec.clienteFornecedor}*,\n\n` +
                `Até o momento não registramos a parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}*, vencida em *${dateStrBr}*.\n\n` +
                `Evite o acúmulo de juros de mora quitando agora mesmo via Pix:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `*Renegociação:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.`;
        } else if (stage === 'POS_5_DIAS') {
          msg = `❌ *Notificação de Cobrança de Parcela em Atraso (5 Dias)* ❌\n\n` +
                `Prezado(a) *${rec.clienteFornecedor}*,\n\n` +
                `Constatamos inadimplência de 5 dias na parcela de valor *${valStr}* (vencida em *${dateStrBr}*) na *Compra do Veículo${veiculoSufixo}*.\n\n` +
                `Transfira para nossa chave Pix corporativa para regularizar:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `*Oportunidade:* Caso tenha interesse em renegociar, sinalize essa mensagem com a proposta que tens.`;
        } else if (stage === 'POS_10_DIAS') {
          msg = `🚨 *AVISO DE ENVIO DE PROTESTO EM CARTÓRIO* 🚨\n\n` +
                `NOTIFICAÇÃO FORMAL DE INADIMPLÊNCIA - RACCAR COMÉRCIO DE VEÍCULOS\n\n` +
                `Prezado(a) *${rec.clienteFornecedor}*,\n\n` +
                `Seu contrato de *Compra do Veículo${veiculoSufixo}* encontra-se com 10 dias de atraso na parcela de valor *${valStr}* vencida em *${dateStrBr}*.\n\n` +
                `Seu débito está entrando em fase de encaminhamento para *PROTESTO DE TÍTULO EM CARTÓRIO*, gerando restrição cadastral no SPC e SERASA.\n\n` +
                `Regularize com urgência via Pix:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `*Último Aviso:* Caso tenha interesse em renegociar antes do protesto, sinalize essa mensagem com a proposta que tens.`;
        } else if (stage === 'POS_30_DIAS') {
          msg = `⚖️ *NOTIFICAÇÃO DETALHADA - ENTRADA DE EXECUÇÃO JUDICIAL (30 DIAS)* ⚖️\n\n` +
                `Prezado(a) *${rec.clienteFornecedor}*,\n\n` +
                `A parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}* soma 30 dias de inadimplência histórica desde *${dateStrBr}*.\n\n` +
                `Seu contrato de compra foi direcionado ao nosso corpo jurídico para Cobrança Extrajudicial, Ação de Execução Constitucional ou Busca e Apreensão judicial.\n\n` +
                `Como última oportunidade de acordo para sustação destas medidas juridicas, utilize Pix:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `*Acordo:* Caso tenha interesse em renegociar e suspender de imediato a tramitação jurídica, sinalize essa mensagem com a proposta que tens AGORA.`;
        } else {
          msg = `Olá, *${rec.clienteFornecedor}*!\n\n` +
                `Lembramos da sua parcela referente à *Compra do Veículo${veiculoSufixo}* no valor de *${valStr}* com vencimento em *${dateStrBr}*.\n\n` +
                `Para efetuar o pagamento com facilidade, utilize nossa chave Pix CNPJ:\n` +
                `🔑 *28.918.081/0001-22*\n` +
                `🏦 *Raccar comércio de veículos*\n\n` +
                `Se tiver qualquer dúvida ou quiser apresentar uma proposta de pagamento, responda por aqui. Obrigado!`;
        }


        billingQueue.push({
          id: `q-${crypto.randomUUID()}`,
          recordId: rec.id,
          nome: rec.clienteFornecedor,
          telefone: rec.telefone,
          vencimento: rec.vencimento,
          valor: rec.valor,
          msg,
          estagio: stage,
          status: 'AGUARDANDO',
          addedAt: new Date().toLocaleTimeString('pt-BR')
        });

        newlyQueuedCount++;
      }
    }

    if (billingQueue.length === newlyQueuedCount && newlyQueuedCount > 0) {
      setSecondsUntilNextDispatch(getQueueIntervalSeconds());
    }

    return NextResponse.json({
      success: true,
      newlyQueued: newlyQueuedCount,
      skippedCount: duplicateSkippedCount,
      totalInQueue: billingQueue.length,
      queueStaggerMinutes: (getQueueIntervalSeconds() / 60).toFixed(1)
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
