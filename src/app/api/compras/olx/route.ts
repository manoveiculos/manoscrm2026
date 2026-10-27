import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);

  const search = url.searchParams.get('q')?.trim();
  const city = url.searchParams.get('city')?.trim();
  const minMargin = url.searchParams.get('min_margin');
  const onlyParticular = url.searchParams.get('only_particular') === 'true';
  const statusCrm = url.searchParams.get('status_crm') || 'all';
  const sortBy = url.searchParams.get('sort_by') || 'recent';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '40', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    let query = supabase
      .from('compras_olx_oportunidades')
      .select('*', { count: 'exact' });

    // Filtros
    if (search) {
      query = query.or(`titulo.ilike.%${search}%,modelo.ilike.%${search}%,marca.ilike.%${search}%`);
    }

    if (city && city !== 'ALL') {
      query = query.ilike('localizacao', `%${city}%`);
    }

    if (minMargin) {
      const marginVal = parseFloat(minMargin);
      if (!isNaN(marginVal)) {
        query = query.gte('margem_percent', marginVal);
      }
    }

    if (onlyParticular) {
      query = query.eq('is_particular', true);
    }

    if (statusCrm && statusCrm !== 'all') {
      query = query.eq('status_crm', statusCrm);
    }

    // Ordenação
    if (sortBy === 'margin_desc') {
      query = query.order('margem_percent', { ascending: false, nullsFirst: false });
    } else if (sortBy === 'price_asc') {
      query = query.order('preco', { ascending: true });
    } else if (sortBy === 'price_desc') {
      query = query.order('preco', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: opportunities, count, error } = await query;
    if (error) throw error;

    // Estatísticas rápidas
    const { count: totalGeral } = await supabase
      .from('compras_olx_oportunidades')
      .select('*', { count: 'exact', head: true });

    const { count: totalOportunidades15 } = await supabase
      .from('compras_olx_oportunidades')
      .select('*', { count: 'exact', head: true })
      .gte('margem_percent', 15);

    const { count: totalParticulares } = await supabase
      .from('compras_olx_oportunidades')
      .select('*', { count: 'exact', head: true })
      .eq('is_particular', true);

    const { count: totalQuedasPreco } = await supabase
      .from('compras_olx_oportunidades')
      .select('*', { count: 'exact', head: true })
      .eq('is_queda_preco', true);

    // Extrai cidades únicas
    const { data: cidadesRaw } = await supabase
      .from('compras_olx_oportunidades')
      .select('localizacao')
      .limit(300);

    const cidadesSet = new Set<string>();
    (cidadesRaw || []).forEach((c) => {
      if (c.localizacao) {
        const principal = c.localizacao.split(',')[0].trim();
        if (principal) cidadesSet.add(principal);
      }
    });

    return NextResponse.json({
      success: true,
      opportunities: opportunities || [],
      total: count || 0,
      limit,
      offset,
      cities: Array.from(cidadesSet).sort(),
      stats: {
        totalGeral: totalGeral || 0,
        totalOportunidades15: totalOportunidades15 || 0,
        totalParticulares: totalParticulares || 0,
        totalQuedasPreco: totalQuedasPreco || 0,
      },
    });
  } catch (err: any) {
    console.error('Erro ao buscar oportunidades OLX:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = await req.json();
    const { id, status_crm, responsavel_nome, observacoes } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID é obrigatório' }, { status: 400 });
    }

    const payload: any = { updated_at: new Date().toISOString() };
    if (status_crm) payload.status_crm = status_crm;
    if (responsavel_nome !== undefined) payload.responsavel_nome = responsavel_nome;
    if (observacoes !== undefined) payload.observacoes = observacoes;

    const { data, error } = await supabase
      .from('compras_olx_oportunidades')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, opportunity: data });
  } catch (err: any) {
    console.error('Erro ao atualizar oportunidade OLX:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
