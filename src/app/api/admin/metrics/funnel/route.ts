import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const admin = createClient();
  const url = new URL(req.url);
  const vertical = url.searchParams.get('vertical') || 'all'; // 'venda' | 'compra' | 'all'
  const days = parseInt(url.searchParams.get('days') || '30');

  try {
    // Busca dados da Materialized View
    let query = admin
      .from('conversion_funnel_daily')
      .select('*')
      .gte('day', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (vertical !== 'all') {
      query = query.eq('vertical', vertical);
    }

    const { data: funnelData, error } = await query;

    if (error) throw error;

    // Agregar dados
    const summary = (funnelData || []).reduce((acc: any, row: any) => {
      acc.total_leads += row.total_leads;
      acc.count_contatado += row.count_contatado;
      acc.count_vendido += row.count_vendido;
      acc.count_perdido += row.count_perdido;
      return acc;
    }, {
      total_leads: 0,
      count_contatado: 0,
      count_vendido: 0,
      count_perdido: 0
    });

    // Formatar para o gráfico de funil do Recharts
    const chartData = [
      { name: 'Recebidos', value: summary.total_leads, fill: '#64748b' },
      { name: 'Contatados', value: summary.count_contatado, fill: '#3b82f6' },
      { name: 'Venda/Compra', value: summary.count_vendido, fill: '#10b981' }
    ];

    // Calcular taxas
    const rates = {
      contact_rate: summary.total_leads > 0 ? (summary.count_contatado / summary.total_leads) * 100 : 0,
      conversion_rate: summary.total_leads > 0 ? (summary.count_vendido / summary.total_leads) * 100 : 0,
      loss_rate: summary.total_leads > 0 ? (summary.count_perdido / summary.total_leads) * 100 : 0
    };

    return NextResponse.json({
      summary,
      chartData,
      rates,
      generated_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error fetching funnel metrics:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
