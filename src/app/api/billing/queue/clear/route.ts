import { NextResponse } from 'next/server';
import { setBillingQueue, getQueueIntervalSeconds, setSecondsUntilNextDispatch } from '@/lib/billing-queue';

export async function POST() {
  setBillingQueue([]);
  setSecondsUntilNextDispatch(getQueueIntervalSeconds());
  return NextResponse.json({ success: true, message: 'Fila de envios limpa com sucesso.' });
}
