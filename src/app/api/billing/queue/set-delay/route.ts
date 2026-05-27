import { NextResponse } from 'next/server';
import { setQueueIntervalSeconds, setSecondsUntilNextDispatch } from '@/lib/billing-queue';

export async function POST(req: Request) {
  try {
    const { minutes } = await req.json();
    if (minutes && Number(minutes) > 0) {
      const secs = Number(minutes) * 60;
      setQueueIntervalSeconds(secs);
      setSecondsUntilNextDispatch(secs);
      return NextResponse.json({ success: true, value: secs });
    }
    return NextResponse.json({ error: 'Intervalo inválido' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
