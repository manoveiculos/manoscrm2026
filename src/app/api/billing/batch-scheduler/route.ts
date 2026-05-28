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
    }    // Agrupar records ativos qualificados por telefone para evitar spam
    const activeRecords = records.filter(rec => rec.status !== 'PAGO' && rec.fase !== 'PAGOS');
    const groupedByPhone: Record<string, any[]> = {};

    for (const rec of activeRecords) {
      const cleanPhone = rec.telefone ? rec.telefone.replace(/\D/g, '') : '';
      if (!cleanPhone || cleanPhone.length < 8) continue;

      if (!groupedByPhone[cleanPhone]) {
        groupedByPhone[cleanPhone] = [];
      }
      groupedByPhone[cleanPhone].push(rec);
    }

    for (const cleanPhone of Object.keys(groupedByPhone)) {
      const phoneRecords = groupedByPhone[cleanPhone];
      const eligibleSubRecords = [];

      for (const rec of phoneRecords) {
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
          else stage = 'AVULSO';
        }

        // Double check contra logs no banco (registro_envios_whatsapp)
        const isAlreadySent = reminders.some(el => {
          const destId = el.destinatario_id || '';
          return destId.includes(cleanPhone) && 
                 el.vencimento === rec.vencimento && 
                 String(el.estagio_cobranca).toUpperCase() === String(stage).toUpperCase();
        });

        if (isAlreadySent) {
          duplicateSkippedCount++;
          continue;
        }

        // Double check dentro da fila em memória
        const isAlreadyInQueue = billingQueue.some(item => {
          const cleanQueuePhone = item.telefone.replace(/\D/g, '');
          return cleanQueuePhone === cleanPhone && 
                 item.vencimento === rec.vencimento && 
                 item.estagio === stage;
        });

        if (isAlreadyInQueue) {
          duplicateSkippedCount++;
          continue;
        }

        eligibleSubRecords.push({ rec, stage });
      }

      if (eligibleSubRecords.length === 0) {
        continue;
      }

      // Se sobrou apenas 1 fatura qualificada, envia mensagem individual
      if (eligibleSubRecords.length === 1) {
        const { rec, stage } = eligibleSubRecords[0];
        const valStr = formatBRL(rec.valor);
        const dateStrBr = fmtDateBr(rec.vencimento);
        let msg = '';

        const veiculo = rec.veiculo && rec.veiculo.trim() !== '' && !rec.veiculo.toLowerCase().includes('nenhum')
          ? rec.veiculo.trim()
          : null;

        const primeiroNome = (rec.clienteFornecedor || '').split(' ')[0] || rec.clienteFornecedor;

        const pixBlock =
          `💳 *Pagamento via Pix (CNPJ):*\n` +
          `🔑 28.918.081/0001-22\n` +
          `🏦 Raccar Comércio de Veículos`;

        const disclaimer =
          `\n\n_⚠️ Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem ou responda por aqui sinalizando como *PAGO*. Estamos sujeitos a atrasos na conciliação bancária — agradecemos a compreensão._`;

        if (stage === 'PRE_1_DIA') {
          msg =
            `Olá, *${primeiroNome}*! Tudo bem? 😊\n\n` +
            `Passando para lembrar que sua parcela${veiculo ? ` referente ao veículo *${veiculo}*` : ''} no valor de *${valStr}* vence *amanhã (${dateStrBr})*.\n\n` +
            `${pixBlock}\n\n` +
            `Se preferir negociar uma nova data ou condição, é só responder por aqui que combinamos. Obrigado pela parceria!` +
            disclaimer;

        } else if (stage === 'NO_DIA') {
          msg =
            `📌 *Vencimento Hoje*\n\n` +
            `Olá, *${primeiroNome}*. Sua parcela${veiculo ? ` do veículo *${veiculo}*` : ''} no valor de *${valStr}* vence hoje, *${dateStrBr}*.\n\n` +
            `Pode quitar agora pelo Pix abaixo — em segundos a baixa é processada:\n\n` +
            `${pixBlock}\n\n` +
            `Se já fez o pagamento, envie o comprovante por aqui. Precisa de mais tempo ou quer renegociar? Responde aqui que conversamos.` +
            disclaimer;

        } else if (stage === 'POS_1_DIA') {
          msg =
            `Olá, *${primeiroNome}*.\n\n` +
            `Identificamos que a parcela${veiculo ? ` do veículo *${veiculo}*` : ''} no valor de *${valStr}*, com vencimento em *${dateStrBr}*, ainda consta em aberto em nosso sistema.\n\n` +
            `Para evitar acréscimo de juros e multa, basta efetuar o pagamento via Pix:\n\n` +
            `${pixBlock}\n\n` +
            `Se houver alguma dificuldade ou se já tiver sido pago, nos avise por aqui — estamos disponíveis para ajudar.` +
            disclaimer;

        } else if (stage === 'POS_3_DIAS') {
          msg =
            `⚠️ *Parcela em atraso — 3 dias*\n\n` +
            `*${primeiroNome}*, sua parcela${veiculo ? ` do veículo *${veiculo}*` : ''} no valor de *${valStr}* (vencimento em *${dateStrBr}*) continua pendente.\n\n` +
            `Para regularizar e evitar acréscimo de juros de mora:\n\n` +
            `${pixBlock}\n\n` +
            `Caso queira parcelar ou propor uma nova data, responda esta mensagem com sua proposta — analisamos com prioridade.` +
            disclaimer;

        } else if (stage === 'POS_5_DIAS') {
          msg =
            `⚠️ *Notificação de Inadimplência — 5 dias*\n\n` +
            `*${primeiroNome}*, sua parcela${veiculo ? ` do veículo *${veiculo}*` : ''} no valor de *${valStr}*, vencida em *${dateStrBr}*, está em aberto há *5 dias*.\n\n` +
            `Para regularização imediata:\n\n` +
            `${pixBlock}\n\n` +
            `Caso o débito permaneça em aberto, poderemos iniciar os procedimentos previstos no contrato para recuperação do crédito.\n\n` +
            `Se prefere negociar (parcelar, propor data nova ou pedir desconto à vista), basta responder esta mensagem com sua proposta.` +
            disclaimer;

        } else if (stage === 'POS_10_DIAS') {
          msg =
            `🚨 *Aviso Importante de Cobrança — 10 dias de atraso*\n\n` +
            `*${primeiroNome}*, sua parcela${veiculo ? ` do veículo *${veiculo}*` : ''} no valor de *${valStr}* (vencimento em *${dateStrBr}*) encontra-se em aberto há *10 dias*.\n\n` +
            `Não havendo regularização, o débito *poderá* ser:\n` +
            `• Encaminhado a protesto em cartório\n` +
            `• Informado aos órgãos de proteção ao crédito (Serasa / SPC)\n\n` +
            `Para evitar essas medidas, regularize por Pix:\n\n` +
            `${pixBlock}\n\n` +
            `*Última chance de acordo amigável:* responda esta mensagem com uma proposta (parcelar, pedir desconto à vista ou nova data) que analisamos hoje mesmo.` +
            disclaimer;

        } else if (stage === 'POS_30_DIAS') {
          msg =
            `⚖️ *Último Aviso de Cobrança — 30 dias de atraso*\n\n` +
            `*${primeiroNome}*, a parcela${veiculo ? ` do veículo *${veiculo}*` : ''} no valor de *${valStr}*, vencida em *${dateStrBr}*, completou *30 dias em aberto*.\n\n` +
            `Se não houver acordo nos próximos dias, o caso será transferido ao nosso departamento jurídico para análise das medidas cabíveis previstas em contrato (cobrança extrajudicial, protesto e demais procedimentos legais).\n\n` +
            `Ainda há tempo para resolver de forma amigável. Para isso, escolha uma opção e responda por aqui:\n\n` +
            `1️⃣ Pagamento integral via Pix com desconto à vista (consulte condições)\n` +
            `2️⃣ Parcelamento da dívida com entrada\n` +
            `3️⃣ Outra proposta sua\n\n` +
            `${pixBlock}` +
            disclaimer;

        } else {
          msg =
            `Olá, *${primeiroNome}*!\n\n` +
            `Estamos passando para lembrar da sua parcela${veiculo ? ` do veículo *${veiculo}*` : ''} no valor de *${valStr}*, com vencimento em *${dateStrBr}*.\n\n` +
            `${pixBlock}\n\n` +
            `Qualquer dúvida ou se quiser apresentar uma proposta de pagamento, é só responder por aqui. Obrigado!` +
            disclaimer;
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
      } else {
        // Múltiplas faturas no lote: consolida em uma única mensagem
        const principalItem = eligibleSubRecords[0];
        const primeiroNome = (principalItem.rec.clienteFornecedor || '').split(' ')[0] || principalItem.rec.clienteFornecedor;
        
        let msg = `Olá, *${primeiroNome}*! Tudo bem? 😊\n\n` +
                  `Identificamos que você possui *mais de uma parcela pendente* em nosso sistema financeiro:\n\n`;
        
        let somaValores = 0;
        eligibleSubRecords.forEach((item, idx) => {
          const valStr = formatBRL(item.rec.valor);
          const dateStrBr = fmtDateBr(item.rec.vencimento);
          const veic = item.rec.veiculo && item.rec.veiculo.trim() !== '' && !item.rec.veiculo.toLowerCase().includes('nenhum')
            ? ` (${item.rec.veiculo.trim()})`
            : '';
          msg += `• Parcela ${idx + 1}: *${valStr}* (vencimento em ${dateStrBr})${veic}\n`;
          somaValores += item.rec.valor;
        });

        const totalAcumuladoStr = formatBRL(somaValores);
        const pixBlock =
          `💳 *Pagamento via Pix (CNPJ):*\n` +
          `🔑 28.918.081/0001-22\n` +
          `🏦 Raccar Comércio de Veículos`;

        const disclaimer =
          `\n\n_⚠️ Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem ou responda por aqui nos enviando o comprovante. Agradecemos a colaboração._`;

        msg += `\n*Total acumulado em aberto: ${totalAcumuladoStr}*\n\n` +
               `Para sua comodidade, você pode regularizar o pagamento via Pix acima ou responder esta mensagem nos enviando o comprovante ou sua proposta de acordo. Estamos prontos para te ouvir e facilitar!\n\n` +
               `${pixBlock}` +
               disclaimer;

        billingQueue.push({
          id: `q-${crypto.randomUUID()}`,
          recordId: principalItem.rec.id,
          nome: principalItem.rec.clienteFornecedor,
          telefone: principalItem.rec.telefone,
          vencimento: principalItem.rec.vencimento,
          valor: somaValores,
          msg,
          estagio: 'COBRANCA_CONSOLIDADA',
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
