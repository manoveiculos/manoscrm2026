import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const admin = createClient();
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '30');

  try {
    const { data: rawRanking, error } = await admin
      .from('conversion_funnel_daily')
      .select('assigned_consultant_id, total_leads, count_contatado, count_vendido, avg_speed_minutes')
      .gte('day', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    // Buscar nomes dos consultores
    const { data: consultants } = await admin.from('consultants_manos_crm').select('id, name');
    const consultantMap = (consultants || []).reduce((acc: any, c: any) => {
      acc[c.id] = c.name;
      return acc;
    }, {});

    // Agrupar por consultor
    const grouped = (rawRanking || []).reduce((acc: any, row: any) => {
      const id = row.assigned_consultant_id;
      if (!acc[id]) {
        acc[id] = {
          id,
          name: consultantMap[id] || 'Removido',
          total_leads: 0,
          contacted: 0,
          won: 0,
          speeds: []
        };
      }
      acc[id].total_leads += row.total_leads;
      acc[id].contacted += row.count_contatado;
      acc[id].won += row.count_vendido;
      if (row.avg_speed_minutes) acc[id].speeds.push(row.avg_speed_minutes);
      return acc;
    }, {});

    const ranking = Object.values(grouped).map((c: any) => {
      const avgSpeed = c.speeds.length > 0 ? c.speeds.reduce((a: number, b: number) => a + b, 0) / c.speeds.length : null;
      const conversionRate = c.total_leads > 0 ? (c.won / c.total_leads) * 100 : 0;
      
      return {
        ...c,
        avg_speed: avgSpeed !== null ? Math.round(avgSpeed) : null,
        conversion_rate: Math.round(conversionRate * 10) / 10
      };
    }).sort((a: any, b: any) => b.won - a.won); // Ordena por volume de vendas

    return NextResponse.json({
      ranking,
      generated_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error in consultant-ranking metrics:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
