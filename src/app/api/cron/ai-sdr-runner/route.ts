import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { sendFirstContact } from '@/lib/services/aiSdrService';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';

export const maxDuration = 60;

/**
 * GET /api/cron/ai-sdr-runner
 *
 * Roda a cada 1min via EasyCron. Drena ai_sdr_queue: pega entries com
 * scheduled_at <= NOW() e processed_at IS NULL, dispara sendFirstContact,
 * marca processed_at em sucesso ou last_error em falha.
 *
 * Substitui o setTimeout fire-and-forget que NÃO sobrevivia ao encerramento
 * do route handler em Next.js — fonte do bug "IA enviou 0 em 24h".
 *
 * Limites:
 *  - Máx 20 jobs por execução (evita timeout em pico).
 *  - Máx 5 attempts por job. Após isso, fica registrado mas não retenta.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    return await withHeartbeat('ai-sdr-runner', async () => {
        const out = await runAiSdrQueue();
        return { result: NextResponse.json(out), metrics: out };
    });
}

async function runAiSdrQueue() {
    const admin = createClient();
    const now = new Date().toISOString();

    const { data: jobs, error } = await admin
        .from('ai_sdr_queue')
        .select('id, lead_id, lead_table, payload, attempts')
        .lte('scheduled_at', now)
        .is('processed_at', null)
        .lt('attempts', 5)
        .order('scheduled_at', { ascending: true })
        .limit(20);

    if (error) {
        console.error('[ai-sdr-runner] fetch fila falhou:', error.message);
        return { ok: false, error: error.message };
    }

    if (!jobs || jobs.length === 0) {
        return { ok: true, processed: 0, sent: 0, failed: 0, skipped: 0 };
    }

    let sent = 0, failed = 0, skipped = 0;
    const errors: Array<{ id: number; error: string }> = [];

    for (const job of jobs) {
        try {
            // Bump attempts antes de processar (cobre crash silencioso).
            await admin
                .from('ai_sdr_queue')
                .update({ attempts: (job.attempts || 0) + 1 })
                .eq('id', job.id);

            const result = await sendFirstContact(
                job.payload as any,
                job.lead_table as 'leads_compra' | 'leads_manos_crm' | 'leads_master' | 'leads_distribuicao_crm_26'
            );

            if (result.sent) {
                await admin
                    .from('ai_sdr_queue')
                    .update({ processed_at: new Date().toISOString(), last_error: null })
                    .eq('id', job.id);
                sent++;
            } else if (result.error === 'already_contacted') {
                // Idempotência: lead já foi contatado por outro caminho. Marca como done.
                await admin
                    .from('ai_sdr_queue')
                    .update({ processed_at: new Date().toISOString(), last_error: 'already_contacted' })
                    .eq('id', job.id);
                skipped++;
            } else {
                await admin
                    .from('ai_sdr_queue')
                    .update({ last_error: result.error || 'unknown_error' })
                    .eq('id', job.id);
                failed++;
                errors.push({ id: job.id, error: result.error || 'unknown' });
            }
        } catch (e: any) {
            const msg = e?.message || 'exception';
            await admin
                .from('ai_sdr_queue')
                .update({ last_error: msg })
                .eq('id', job.id);
            failed++;
            errors.push({ id: job.id, error: msg });
        }
    }

    return {
        ok: true,
        processed: jobs.length,
        sent,
        failed,
        skipped,
        errors: errors.slice(0, 5), // só os 5 primeiros pra log não estourar
    };
}
