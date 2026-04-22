import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // 1 min tier hobby
export const dynamic = 'force-dynamic';

/**
 * Scheduler consolidado para tarefas de 15 minutos em planos Hobby.
 * Dispara alertas de leads e refresh de métricas.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    // Tenta resolver a URL base
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    console.log(`[fifteen-min-scheduler] starting tasks... base=${baseUrl}`);

    const tasks = [
        { name: 'hot-leak-alert', path: '/api/cron/hot-leak-alert' },
        { name: 'refresh-metrics', path: '/api/cron/refresh-metrics' }
    ];

    const results: Record<string, string> = {};
    let hasFailure = false;

    // Executa em paralelo
    const settled = await Promise.allSettled(
        tasks.map(t => 
            fetch(`${baseUrl}${t.path}`, {
                headers: { Authorization: `Bearer ${cronSecret}` },
                signal: AbortSignal.timeout(55000),
            }).then(res => ({ name: t.name, status: res.ok ? 'ok' : `error:${res.status}` }))
        )
    );

    for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === 'fulfilled') {
            results[r.value.name] = r.value.status;
            if (r.value.status !== 'ok') hasFailure = true;
        } else {
            const taskName = tasks[i].name;
            results[taskName] = `failed:${r.reason?.message || String(r.reason)}`;
            hasFailure = true;
        }
    }

    return NextResponse.json({ 
        success: !hasFailure, 
        timestamp: new Date().toISOString(),
        results 
    });
}
