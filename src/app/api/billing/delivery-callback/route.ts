import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { addWebhookLog, getDeliveryEmitter } from '@/lib/billing-queue';

export async function POST(req: Request) {
  try {
    const { recordId, cliente, telefone, vencimento, estagio, messageId, status, valor } = await req.json();

    const timestampBr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const supabaseAdmin = createAdminClient();

    // n8n persists data directly to 'registro_envios_whatsapp' on the DB side

    // Append to memory webhook log history
    addWebhookLog({
      id: `confirm-${crypto.randomUUID()}`,
      timestamp: timestampBr,
      nome: `${cliente || 'WhatsApp'} (${status === 'ERRO' ? 'Erro' : 'Entregue'})`,
      telefone: telefone || '',
      vencimento: vencimento || '',
      valor: valor ? String(valor) : 'Confirmado',
      estagio: estagio || 'CALLBACK',
      status: status === 'ERRO' ? 'ERRO' : 'SUCESSO'
    });

    console.log(`[WhatsApp Callback] Delivery status: ${status || 'SUCESSO'} for ${telefone} - MsgID: ${messageId}`);

    // Notify listeners waiting for delivery confirmations
    const emitter = getDeliveryEmitter();
    emitter.emit('delivery', { recordId, cliente, telefone, vencimento, estagio, status });

    return NextResponse.json({ success: true, message: 'Confirmação de entrega processada no sistema com sucesso.' });
  } catch (err: any) {
    console.error('Erro no callback de entrega:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
