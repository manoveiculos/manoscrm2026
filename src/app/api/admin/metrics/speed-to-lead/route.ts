import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const admin = createClient();
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '7');

  try {
    const { data: speedData, error } = await admin
      .from('conversion_funnel_daily')
      .select('assigned_consultant_id, avg_speed_minutes, p95_speed_minutes, vertical, day')
      .gte('day', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .not('avg_speed_minutes', 'is', null);

    if (error) throw error;

    // Calcular P50 e P95 global e por vertical
    const globalSpeed = (speedData || []).reduce((acc: any, row: any) => {
      acc.total_minutes += row.avg_speed_minutes;
      acc.count++;
      acc.max_p95 = Math.max(acc.max_p95, row.p95_speed_minutes);
      return acc;
    }, { total_minutes: 0, count: 0, max_p95: 0 });

    const avgGlobal = globalSpeed.count > 0 ? globalSpeed.total_minutes / globalSpeed.count : 0;

    // Tendência diária
    const dailyTrend = (speedData || []).reduce((acc: any, row: any) => {
        const day = row.day.split('T')[0];
        if (!acc[day]) acc[day] = { day, avg: 0, count: 0 };
        acc[day].avg += row.avg_speed_minutes;
        acc[day].count++;
        return acc;
    }, {});

    const trendArray = Object.values(dailyTrend).map((d: any) => ({
        day: d.day,
        avg: Math.round(d.avg / d.count)
    })).sort((a, b) => a.day.localeCompare(b.day));

    return NextResponse.json({
      average_minutes: Math.round(avgGlobal),
      p95_minutes: Math.round(globalSpeed.max_p95),
      trend: trendArray,
      generated_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error fetching speed-to-lead metrics:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
