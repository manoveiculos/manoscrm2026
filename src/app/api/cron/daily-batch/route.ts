import { NextResponse } from 'next/server';

// Vercel Hobby tier permite até 60s de duração para Serverless Functions.
// Sem essa diretiva, o default de 10s mata o batch antes de terminar o 1º fetch.
export const maxDuration = 60;

/**
 * Cron batch diário — consolida múltiplos crons em um único endpoint
 * para respeitar o limite de 2 cron jobs do plano Hobby da Vercel.
 *
 * Dispara em paralelo: anti-loss, pipeline-sla, ai-score-refresh, followup-ai, churn-predict
 */
export async function GET() {
    // Resolve a URL base canônica. NEXT_PUBLIC_BASE_URL tem prioridade (domínio público),
    // VERCEL_URL é o fallback (domínio interno *.vercel.app).
    const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const cronPaths = [
        '/api/cron/anti-loss',
        '/api/cron/pipeline-sla',
        '/api/cron/ai-score-refresh',
        '/api/cron/followup-ai',
        '/api/cron/churn-predict',
    ];

    // Os 5 sub-crons validam Authorization: Bearer ${CRON_SECRET}. Sem esse header,
    // cada chamada retorna 401 e o batch inteiro fica "verde" na Vercel mas sem gravar
    // nada no banco — foi exatamente o modo de falha silenciosa observado em 08/04.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json(
            { success: false, error: 'CRON_SECRET não configurado — batch abortado' },
            { status: 500 }
        );
    }
    const authHeaders = { Authorization: `Bearer ${cronSecret}` };

    // Paraleliza os 5 crons. Em sequência (5 × 11s) não cabe nos 60s do tier Hobby —
    // a única forma de respeitar o cap sem matar crons pesados (ai-score-refresh,
    // churn-predict) é dispará-los em paralelo. Cada um tem até ~55s de janela.
    const settled = await Promise.allSettled(
        cronPaths.map(path =>
            fetch(`${baseUrl}${path}`, {
                headers: authHeaders,
                signal: AbortSignal.timeout(55000),
            })
                .then(res => ({ path, status: res.ok ? 'ok' : `error:${res.status}` }))
        )
    );

    const results: Record<string, string> = {};
    let hasFailure = false;

    for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === 'fulfilled') {
            results[r.value.path] = r.value.status;
            if (r.value.status !== 'ok') hasFailure = true;
        } else {
            results[cronPaths[i]] = `failed:${r.reason?.message || String(r.reason)}`;
            hasFailure = true;
        }
    }

    // success reflete o resultado real do batch (não mais sempre true)
    return NextResponse.json({ success: !hasFailure, baseUrl, results });
}
