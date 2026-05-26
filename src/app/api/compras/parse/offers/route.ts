import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sourceId = searchParams.get('sourceId');

    if (!sourceId) {
      return NextResponse.json({ error: 'ID da fonte (sourceId) não fornecido.' }, { status: 400 });
    }

    // Busca as ofertas associadas a este sourceId com os dados de Deal Score (se houver)
    const { data: offers, error: offersError } = await supabaseAdmin
      .from('offers')
      .select(`
        id,
        brand,
        model,
        year_model,
        km,
        ask_price,
        net_price,
        fipe_pct,
        deal_scores (
          score,
          rating
        )
      `)
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (offersError) {
      console.error('Erro ao carregar ofertas:', offersError);
      return NextResponse.json({ error: 'Erro ao carregar ofertas do banco.' }, { status: 500 });
    }

    // Formata o retorno para simplificar o consumo no frontend
    const formattedOffers = (offers || []).map((o: any) => ({
      id: o.id,
      brand: o.brand,
      model: o.model,
      year_model: o.year_model,
      km: o.km,
      ask_price: Number(o.ask_price),
      net_price: Number(o.net_price),
      fipe_pct: o.fipe_pct ? Number(o.fipe_pct) : null,
      score: o.deal_scores?.[0]?.score ?? undefined,
      rating: o.deal_scores?.[0]?.rating ?? undefined
    }));

    return NextResponse.json({
      success: true,
      offers: formattedOffers
    });

  } catch (error) {
    console.error('Erro na rota GET de ofertas:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
