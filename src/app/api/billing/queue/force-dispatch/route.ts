import { NextResponse } from 'next/server';
import { getBillingQueue, processNextQueueItem } from '@/lib/billing-queue';

export async function POST() {
  const queue = getBillingQueue();
  if (queue.length === 0) {
    return NextResponse.json({ success: false, error: 'Nenhum faturamento aguardando na fila.' }, { status: 400 });
  }

  await processNextQueueItem();
  
  return NextResponse.json({ success: true, message: 'Processou envio imediato com sucesso!' });
}
