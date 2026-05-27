import { NextResponse } from 'next/server';
import {
  getIsQueueActive,
  getQueueIntervalSeconds,
  getSecondsUntilNextDispatch,
  getBillingQueue,
  getLastDispatchTime,
  getAllowedStartHour,
  getAllowedEndHour,
  checkIsWithinAllowedHours
} from '@/lib/billing-queue';

export async function GET() {
  const queue = getBillingQueue();
  return NextResponse.json({
    active: getIsQueueActive(),
    intervalSeconds: getQueueIntervalSeconds(),
    secondsRemaining: getSecondsUntilNextDispatch(),
    queueSize: queue.length,
    queueList: queue,
    lastDispatch: getLastDispatchTime(),
    allowedStartHour: getAllowedStartHour(),
    allowedEndHour: getAllowedEndHour(),
    isWithinAllowedHours: checkIsWithinAllowedHours()
  });
}
