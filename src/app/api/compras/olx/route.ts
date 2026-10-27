import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const FLASK_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);

  const search = url.searchParams.get('q')?.trim() || '';
  const city = url.searchParams.get('city')?.trim() || '';
  const minMargin = url.searchParams.get('min_margin') || '0';
  const onlyParticular = url.searchParams.get('only_particular') === 'true';
  const statusCrm = url.searchParams.get('status_crm') || 'all';
  const sortBy = url.searchParams.get('sort_by') || 'recent';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '12', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const page = Math.floor(offset / limit) + 1;

  // 1. TENTA ESPELHAMENTO EM TEMPO REAL DIRETO DO GARIMPEIRO (FLASK)
  try {
    const flaskParams = new URLSearchParams();
    // Combina busca textual e cidade se selecionada
    const combinedSearch = [search, city && city !== 'ALL' ? city : ''].filter(Boolean).join(' ');
    if (combinedSearch) flaskParams.set('search', combinedSearch);
    if (minMargin && minMargin !== '0') flaskParams.set('min_margin', minMargin);
    if (onlyParticular) flaskParams.set('only_particular', 'true');
    flaskParams.set('order_by', sortBy);
    flaskParams.set('limit', String(limit));
    flaskParams.set('page', String(page));

    const [adsRes, statsRes] = await Promise.all([
      fetch(`${FLASK_URL}/api/ads?${flaskParams.toString()}`, { cache: 'no-store' }),
      fetch(`${FLASK_URL}/api/stats`, { cache: 'no-store' }).catch(() => null),
    ]);

    if (adsRes.ok) {
      const adsData = await adsRes.json();
      const statsData = statsRes && statsRes.ok ? await statsRes.json() : null;

      const rawAds: any[] = adsData.ads || [];
      const adIds = rawAds.map((a) => String(a.ad_id));

      // Busca anotações (notas e status CRM) gravadas no Supabase
      const crmAnnotations: Record<string, { status_crm: string; observacoes: string | null }> = {};
      if (adIds.length > 0) {
        try {
          const { data: crmRows } = await supabase
            .from('compras_olx_oportunidades')
            .select('ad_id, status_crm, observacoes')
            .in('ad_id', adIds);

          (crmRows || []).forEach((row: any) => {
            crmAnnotations[row.ad_id] = {
              status_crm: row.status_crm || 'novo',
              observacoes: row.observacoes || null,
            };
          });
        } catch {
          // Ignora erro de anotações
        }
      }

      // Converte para a estrutura esperada pelo CRM
      let mappedOpportunities = rawAds.map((ad: any) => {
        const adId = String(ad.ad_id);
        const annotation = crmAnnotations[adId];

        return {
          id: adId,
          ad_id: adId,
          url: ad.url || '',
          titulo: ad.title || '',
          marca: ad.brand || null,
          modelo: ad.model || null,
          ano: ad.year || null,
          km: ad.mileage !== undefined && ad.mileage !== null ? Number(ad.mileage) : null,
          combustivel: ad.fuel || null,
          cambio: ad.gearbox || null,
          preco: Number(ad.price || 0),
          preco_fipe: ad.fipe_price ? Number(ad.fipe_price) : null,
          margem_percent: ad.margin_percent !== undefined && ad.margin_percent !== null ? Number(ad.margin_percent) : null,
          margem_valor: ad.margin_value !== undefined && ad.margin_value !== null ? Number(ad.margin_value) : null,
          localizacao: ad.location || '',
          foto_url: ad.image_url || null,
          publicado_em: ad.published_at || null,
          is_particular: Boolean(ad.is_particular),
          has_leilao: Boolean(ad.has_auction),
          status_classificacao: ad.status || 'NORMAL',
          is_queda_preco: Boolean(ad.previous_price && Number(ad.previous_price) > Number(ad.price)),
          preco_anterior: ad.previous_price ? Number(ad.previous_price) : null,
          avisos: [],
          status_crm: (annotation?.status_crm || 'novo') as any,
          responsavel_nome: null,
          observacoes: annotation?.observacoes || null,
          created_at: ad.created_at || new Date().toISOString(),
        };
      });

      // Se filtrou por status CRM específico (ex: descartado, em análise)
      if (statusCrm && statusCrm !== 'all') {
        mappedOpportunities = mappedOpportunities.filter((o) => o.status_crm === statusCrm);
      }

      // Cidades mais comuns
      const topCities = (statsData?.top_cities || []).map((c: any) => c.name).filter(Boolean);

      return NextResponse.json({
        success: true,
        opportunities: mappedOpportunities,
        total: adsData.total || 0,
        limit,
        offset,
        cities: topCities.length > 0 ? topCities : ['Florianópolis', 'Joinville', 'Blumenau', 'Itajaí', 'São José', 'Brusque', 'Criciúma', 'Chapecó', 'Palhoça'],
        stats: {
          totalGeral: statsData?.total_ads || adsData.total || 0,
          totalOportunidades15: statsData?.opportunities || 0,
          totalParticulares: adsData.total || 0,
          totalQuedasPreco: statsData?.price_drops || 0,
        },
        realtime_mirror: true,
      });
    }
  } catch (err) {
    // Falha de conexão com o robô Flask local; executa fallback no Supabase abaixo
    console.warn('Garimpeiro Flask offline ou indisponível, consultando Supabase:', err);
  }

  // 2. FALLBACK SUPABASE (quando acessado fora da máquina local ou se Flask parado)
  try {
    let query = supabase
      .from('compras_olx_oportunidades')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`titulo.ilike.%${search}%,modelo.ilike.%${search}%,marca.ilike.%${search}%`);
    }

    if (city && city !== 'ALL') {
      query = query.ilike('localizacao', `%${city}%`);
    }

    if (minMargin && minMargin !== '0') {
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

    return NextResponse.json({
      success: true,
      opportunities: opportunities || [],
      total: count || 0,
      limit,
      offset,
      cities: ['Florianópolis', 'Joinville', 'Blumenau', 'Itajaí', 'São José', 'Brusque', 'Criciúma', 'Chapecó', 'Palhoça'],
      stats: {
        totalGeral: totalGeral || 0,
        totalOportunidades15: totalOportunidades15 || 0,
        totalParticulares: totalParticulares || 0,
        totalQuedasPreco: totalQuedasPreco || 0,
      },
      realtime_mirror: false,
    });
  } catch (err: any) {
    console.error('Erro ao buscar oportunidades OLX no Supabase:', err);
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

    const payload: any = {
      ad_id: String(id),
      updated_at: new Date().toISOString(),
    };
    if (status_crm) payload.status_crm = status_crm;
    if (responsavel_nome !== undefined) payload.responsavel_nome = responsavel_nome;
    if (observacoes !== undefined) payload.observacoes = observacoes;

    // Upsert no Supabase por ad_id
    const { data, error } = await supabase
      .from('compras_olx_oportunidades')
      .upsert(payload, { onConflict: 'ad_id' })
      .select()
      .single();

    if (error) {
      console.warn('Aviso ao atualizar anotação no Supabase:', error);
    }

    return NextResponse.json({ success: true, opportunity: data || payload });
  } catch (err: any) {
    console.error('Erro ao atualizar oportunidade OLX:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
