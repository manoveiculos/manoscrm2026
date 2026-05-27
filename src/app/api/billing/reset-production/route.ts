import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import {
  setBillingQueue,
  setIsQueueActive,
  setSecondsUntilNextDispatch,
  getQueueIntervalSeconds,
  setLastDispatchTime,
} from '@/lib/billing-queue';

/**
 * POST /api/billing/reset-production
 *
 * Zera TODA a memória da fila de cobrança (queue + logs em memória).
 * Os dados do banco (Supabase) devem ser apagados via SQL separado.
 */
export async function POST() {
  try {
    // 1. Limpa a fila em memória
    setBillingQueue([]);

    // 2. Reseta o timer
    setSecondsUntilNextDispatch(getQueueIntervalSeconds());

    // 3. Mantém a fila ativa
    setIsQueueActive(true);

    // 4. Reseta o último disparo
    setLastDispatchTime('Produção iniciada — fila zerada');

    // 5. Limpa os logs de memória direto no globalThis
    globalThis.webhookLogsHistory = [];

    // 6. Confirma limpeza no banco
    const supabase = createAdminClient();

    const { error: errEnvios } = await supabase
      .from('registro_envios_whatsapp')
      .delete()
      .neq('id', 0); // deleta todos (neq id 0 = todos os registros)

    const { error: errReminders } = await supabase
      .from('reminders_cobrancamanos26')
      .delete()
      .neq('id', 0);

    const { error: errRecords } = await supabase
      .from('records_cobrancamanos26')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // UUID format

    const errors = [errEnvios, errReminders, errRecords].filter(Boolean);

    if (errors.length > 0) {
      console.warn('[reset-production] Avisos ao limpar banco:', errors.map(e => e?.message));
    }

    return NextResponse.json({
      success: true,
      message: 'Setor de cobrança zerado com sucesso! Pronto para produção real.',
      cleared: {
        memoria_fila: true,
        memoria_logs: true,
        banco_registro_envios: !errEnvios,
        banco_reminders: !errReminders,
        banco_records: !errRecords,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
