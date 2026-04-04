import { NextResponse } from 'next/server';

/**
 * Cron batch diário — consolida múltiplos crons em um único endpoint
 * para respeitar o limite de 2 cron jobs do plano Hobby da Vercel.
 *
 * Executa sequencialmente: anti-loss, pipeline-sla, ai-score-refresh, followup-ai, churn-predict
 */
export async function GET() {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';

    const cronPaths = [
        '/api/cron/anti-loss',
        '/api/cron/pipeline-sla',
        '/api/cron/ai-score-refresh',
        '/api/cron/followup-ai',
        '/api/cron/churn-predict',
    ];

    const results: Record<string, string> = {};

    for (const path of cronPaths) {
        try {
            const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(30000) });
            results[path] = res.ok ? 'ok' : `error:${res.status}`;
        } catch (e: any) {
            results[path] = `failed:${e.message}`;
        }
    }

    return NextResponse.json({ success: true, results });
}
