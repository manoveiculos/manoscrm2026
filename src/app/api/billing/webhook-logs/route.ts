import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { getWebhookLogsHistory } from '@/lib/billing-queue';

/**
 * Extrai todos os números de telefone de uma string (pode ter múltiplos separados por espaço/vírgula)
 * e retorna um Set com os últimos 8 dígitos de cada número para matching flexível.
 */
function extractPhoneFingerprints(phoneStr: string): Set<string> {
  const fingerprints = new Set<string>();
  if (!phoneStr) return fingerprints;

  // Separa por espaço, vírgula, ponto-e-vírgula
  const parts = String(phoneStr).split(/[\s,;]+/);
  for (const part of parts) {
    const digits = part.replace(/\D/g, '');
    if (digits.length >= 8) {
      // Guarda os últimos 8 dígitos como fingerprint (ignora DDI e DDD variações)
      fingerprints.add(digits.slice(-8));
    }
  }
  return fingerprints;
}

/**
 * Extrai o fingerprint de um destinatario_id do banco (ex: "554788467855@s.whatsapp.net")
 */
function dbPhoneFingerprint(destinatarioId: string): string {
  const digits = (destinatarioId || '').replace(/\D/g, '');
  return digits.slice(-8);
}

/**
 * Verifica se um log de memória tem correspondência no banco de dados
 */
function memLogMatchesDbRecord(
  logTelefone: string,
  logVencimento: string,
  logEstagio: string,
  dbRecord: { destinatario_id: string; vencimento: string; estagio_cobranca: string }
): boolean {
  // Match de vencimento
  if (dbRecord.vencimento !== logVencimento) return false;

  // Match de estágio (case-insensitive)
  if (String(dbRecord.estagio_cobranca || '').toUpperCase() !== String(logEstagio || '').toUpperCase()) return false;

  // Match de telefone: compara os últimos 8 dígitos de qualquer número na string
  const logFingerprints = extractPhoneFingerprints(logTelefone);
  const dbFingerprint = dbPhoneFingerprint(dbRecord.destinatario_id);

  return logFingerprints.has(dbFingerprint);
}

/**
 * GET /api/billing/webhook-logs
 *
 * Fonte de verdade: tabela `registro_envios_whatsapp` no Supabase.
 * - Registros no banco → ENVIADO (confirmado)
 * - Registros só na memória sem correspondência no banco → ERRO
 * - Quando o banco confirma, o ERRO da memória é substituído, nunca duplicado
 */
export async function GET() {
  const supabaseAdmin = createAdminClient();

  try {
    // 1. Busca todos os registros confirmados no banco (fonte de verdade)
    const { data: dbRecords, error: dbError } = await supabaseAdmin
      .from('registro_envios_whatsapp')
      .select('id, mensagem_id, destinatario_id, cliente_nome, vencimento, valor_cobranca, estagio_cobranca, status_status, data_hora_brasil')
      .order('data_hora_brasil', { ascending: false })
      .limit(100);

    if (dbError) {
      console.warn('[webhook-logs] Erro ao consultar banco:', dbError.message);
    }

    const confirmedRecords = dbRecords || [];

    // 2. Monta logs do banco (sempre ENVIADO — existência no banco = confirmação)
    const dbLogs = confirmedRecords.map((rec: any) => ({
      id: `db-${rec.id}`,
      timestamp: rec.data_hora_brasil
        ? new Date(rec.data_hora_brasil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : '—',
      nome: (rec.cliente_nome || '(sem nome)').replace(' (Enviado)', '').replace(' (Confirmado)', ''),
      telefone: (rec.destinatario_id || '').replace('@s.whatsapp.net', '').replace(/^55/, ''),
      vencimento: rec.vencimento || '—',
      valor: String(rec.valor_cobranca || '0'),
      estagio: rec.estagio_cobranca || 'MANUAL',
      status: 'SUCESSO' as const,
      fromDb: true,
    }));

    // 3. Deduplicar registros do banco (mesmo destinatario_id + vencimento + estagio)
    //    Caso o n8n tenha inserido duplicatas, mostra apenas o mais recente
    const seenDbKeys = new Set<string>();
    const deduplicatedDbLogs = dbLogs.filter(log => {
      const key = `${log.telefone.replace(/\D/g, '').slice(-8)}::${log.vencimento}::${log.estagio.toUpperCase()}`;
      if (seenDbKeys.has(key)) return false;
      seenDbKeys.add(key);
      return true;
    });

    // 4. Logs da memória do servidor (disparos recentes ainda não confirmados no banco)
    const memLogs = getWebhookLogsHistory();

    // 5. Filtra memória: remove qualquer entrada que já tenha correspondência no banco
    //    Isso garante que não apareça ERRO + ENVIADO para o mesmo contato
    const memOnlyLogs = memLogs
      .filter(log => {
        // Sempre mostra bloqueados (anti-spam) pois são diferentes de envios confirmados
        if (log.status === 'PULADO') return true;

        // Verifica se existe um registro no banco para este log de memória
        const hasDbMatch = confirmedRecords.some(dbRec =>
          memLogMatchesDbRecord(log.telefone, log.vencimento, log.estagio, dbRec)
        );

        // Se tem correspondência no banco → não mostra o ERRO, o banco já mostra como ENVIADO
        return !hasDbMatch;
      })
      .map(log => ({
        ...log,
        nome: (log.nome || '').replace(' (Enviado)', '').replace(' (Confirmado)', ''),
        // Se estava como SUCESSO na memória mas não tem no banco → vira ERRO
        status: log.status === 'SUCESSO' ? ('ERRO' as const) : log.status,
        errorMessage: log.status === 'SUCESSO'
          ? 'Sem confirmação no banco: a mensagem pode não ter sido entregue (registro_envios_whatsapp).'
          : log.errorMessage,
        fromDb: false,
      }));

    // 6. Combina: banco (ENVIADO) + memória sem match (ERRO/PULADO)
    const combined = [...deduplicatedDbLogs, ...memOnlyLogs];

    // 7. Ordena por timestamp decrescente
    combined.sort((a, b) => {
      const tA = a.timestamp || '';
      const tB = b.timestamp || '';
      return tB.localeCompare(tA);
    });

    return NextResponse.json(combined);
  } catch (err: any) {
    console.error('[webhook-logs route error]:', err.message);
    return NextResponse.json(getWebhookLogsHistory());
  }
}
