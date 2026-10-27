import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PYTHON_BOT_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${PYTHON_BOT_URL}/api/stats`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ online: false, message: 'Serviço retornou erro' });
    }

    const data = await res.json();
    return NextResponse.json({
      online: true,
      stats: data,
      bot: data.bot || {},
    });
  } catch (err) {
    return NextResponse.json({
      online: false,
      message: 'Robô local em segundo plano offline.',
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body; // 'start' | 'stop' | 'scan_now'

    let targetEndpoint = '/api/bot/scan-now';
    if (action === 'start') targetEndpoint = '/api/bot/start';
    if (action === 'stop') targetEndpoint = '/api/bot/stop';

    const res = await fetch(`${PYTHON_BOT_URL}${targetEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json({ success: true, botResponse: data });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'Não foi possível conectar ao robô na porta 5000.',
    }, { status: 502 });
  }
}
