import { createClient } from '@/lib/supabase/admin';

/**
 * Telemetria de cron. Cada job crítico chama withHeartbeat para registrar
 * início, fim, duração e resultado. /admin/health mostra a última run.
 *
 * Best-effort: erros aqui NUNCA derrubam o cron real.
 */

export async function withHeartbeat<T>(
    cronName: string,
    fn: () => Promise<{ result: T; metrics?: Record<string, any> }>
): Promise<T> {
    const startedAt = new Date();
    let success = true;
    let errorMessage: string | null = null;
    let metrics: Record<string, any> | undefined;
    let result: T;

    try {
        const out = await fn();
        result = out.result;
        metrics = out.metrics;
        return result;
    } catch (e: any) {
        success = false;
        errorMessage = (e?.message || String(e)).slice(0, 500);
        throw e;
    } finally {
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        try {
            const admin = createClient();
            await admin.from('cron_heartbeats').insert({
                cron_name: cronName,
                started_at: startedAt.toISOString(),
                finished_at: finishedAt.toISOString(),
                duration_ms: durationMs,
                success,
                error_message: errorMessage,
                metrics: metrics || null,
            });
        } catch {
            // Telemetria nunca derruba o cron
        }
    }
}
