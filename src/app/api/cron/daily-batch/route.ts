import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * Cron batch diário (07h Brasília). Em cima do tier Hobby (2 cron slots),
 * este é o agregador das rotinas diárias — agora minimalista, focado
 * 100% em vender.
 */
export async function GET() {
    const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json(
            { success: false, error: 'CRON_SECRET não configurado — batch abortado' },
            { status: 500 }
        );
    }
    const authHeaders = { Authorization: `Bearer ${cronSecret}` };

    const cronPaths = [
        '/api/cron/morning-push',
        '/api/cron/followup-ai',
    ];

    const settled = await Promise.allSettled(
        cronPaths.map(path =>
            fetch(`${baseUrl}${path}`, {
                headers: authHeaders,
                signal: AbortSignal.timeout(55000),
            }).then(res => ({ path, status: res.ok ? 'ok' : `error:${res.status}` }))
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

    return NextResponse.json({ success: !hasFailure, baseUrl, results });
}
