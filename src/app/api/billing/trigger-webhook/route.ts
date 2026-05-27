import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { addWebhookLog, waitForDelivery } from '@/lib/billing-queue';

const TARGET_WEBHOOK_URL = 'https://n8n.drivvoo.com/webhook/2f0348ba-8965-421f-bc99-d2572a1d2057';

export async function POST(req: Request) {
  try {
    const { nome, telefone, vencimento, valor, msg, estagio, recordId } = await req.json();

    if (!nome || !telefone || !vencimento || !valor || !msg) {
      return NextResponse.json({
        success: false,
        error: 'Parâmetros obrigatórios ausentes: nome, telefone, vencimento, valor, msg.'
      }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // 1. Anti-Spam Check: Verify if this specific stage has already been sent
    try {
      const cleanPhone = telefone.replace(/\D/g, '');
      const { data: match } = await supabaseAdmin
        .from('registro_envios_whatsapp')
        .select('id')
        .ilike('destinatario_id', `%${cleanPhone}%`)
        .eq('vencimento', vencimento)
        .eq('estagio_cobranca', estagio || 'MANUAL')
        .limit(1);

      if (match && match.length > 0) {
        addWebhookLog({
          id: `log-${crypto.randomUUID()}`,
          timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          nome,
          telefone,
          vencimento,
          valor: String(valor),
          estagio: estagio || 'MANUAL',
          status: 'PULADO',
          errorMessage: 'Bloqueado para proteção Anti-Spam: Cobrança já encaminhada anteriormente (registro_envios_whatsapp).'
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Anti-Spam ativo: Este cliente já recebeu notificação para este vencimento no estágio selecionado.',
          alreadySent: true
        });
      }
    } catch (e: any) {
      console.warn('[Supabase API Warning] Anti-spam query skipped:', e.message);
    }

    const logEntry: any = {
      id: `log-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      nome,
      telefone,
      vencimento,
      valor: String(valor),
      estagio: estagio || 'MANUAL',
      status: 'SUCESSO'
    };

    const response = await fetch(TARGET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome,
        telefone,
        'data de vencimento': vencimento,
        valor,
        'msg para whatsapp completo': msg,
        estagio: estagio || 'MANUAL'
      })
    });

    if (response.ok) {
      logEntry.status = 'SUCESSO';
      logEntry.nome = `${nome} (Enviado)`;
      addWebhookLog(logEntry);
      return NextResponse.json({ success: true, message: 'Mensagem disparada com sucesso no n8n!' });
    } else {
      const textError = await response.text();
      logEntry.status = 'ERRO';
      logEntry.errorMessage = `Status ${response.status}: ${textError}`;
      addWebhookLog(logEntry);
      return NextResponse.json({ success: false, error: 'n8n respondeu com erro.', details: textError }, { status: 502 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Falha de rede com o webhook do n8n.', details: error.message }, { status: 500 });
  }
}
