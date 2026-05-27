import { NextResponse } from 'next/server';
import { getIsQueueActive, setIsQueueActive } from '@/lib/billing-queue';

export async function POST() {
  const nextActive = !getIsQueueActive();
  setIsQueueActive(nextActive);
  return NextResponse.json({ success: true, active: nextActive });
}
