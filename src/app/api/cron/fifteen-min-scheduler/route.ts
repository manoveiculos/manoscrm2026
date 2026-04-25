import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Scheduler de alta frequência (a cada 5min). No tier Hobby da Vercel,
 * este é nosso único slot pra rodar tarefas frequentes — então delegamos
 * pro sla-watcher, o coração da pressão sobre o vendedor.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const tasks = [
        { name: 'sla-watcher', path: '/api/cron/sla-watcher' },
    ];

    const results: Record<string, string> = {};
    let hasFailure = false;

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
            results[tasks[i].name] = `failed:${r.reason?.message || String(r.reason)}`;
            hasFailure = true;
        }
    }

    return NextResponse.json({ success: !hasFailure, timestamp: new Date().toISOString(), results });
}
