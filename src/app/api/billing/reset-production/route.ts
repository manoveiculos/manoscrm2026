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
      .neq('id', 0);

    const { error: errReminders } = await supabase
      .from('reminders_cobrancamanos26')
      .delete()
      .neq('id', 0);

    // Tabelas novas — apagar ANTES dos records (FK CASCADE cobre, mas explícito é mais limpo)
    const { error: errWhatsApp } = await supabase
      .from('billing_whatsapp_messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    const { error: errAcordos } = await supabase
      .from('billing_acordos')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    const { error: errJuridico } = await supabase
      .from('billing_juridico_envios')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    const { error: errAiAnalysis } = await supabase
      .from('billing_ai_analysis')
      .delete()
      .neq('record_id', '__never__');

    const { error: errObs } = await supabase
      .from('billing_observacoes_gerais')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    const { error: errRecords } = await supabase
      .from('records_cobrancamanos26')
      .delete()
      .neq('id', '__never__');

    const errors = [errEnvios, errReminders, errWhatsApp, errAcordos, errJuridico, errAiAnalysis, errObs, errRecords].filter(Boolean);

    if (errors.length > 0) {
      console.warn('[reset-production] Avisos ao limpar banco:', errors.map(e => e?.message));
    }

    return NextResponse.json({
      success: true,
      message: 'Banco de cobrança apagado com sucesso! Pronto para começar do zero.',
      cleared: {
        memoria_fila: true,
        memoria_logs: true,
        banco_registro_envios: !errEnvios,
        banco_reminders: !errReminders,
        banco_records: !errRecords,
        banco_whatsapp_msgs: !errWhatsApp,
        banco_acordos: !errAcordos,
        banco_juridico: !errJuridico,
        banco_ai_analysis: !errAiAnalysis,
        banco_observacoes: !errObs,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
