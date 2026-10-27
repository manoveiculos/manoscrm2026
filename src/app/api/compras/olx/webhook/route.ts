import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = await req.json();

    const ad = body.ad || body;
    const analysis = body.analysis || {};

    let url = ad.url || body.url || '';
    if (!url) {
      return NextResponse.json({ success: false, error: 'URL do anúncio é obrigatória' }, { status: 400 });
    }

    // Extrai ad_id
    let adId = ad.ad_id || body.ad_id;
    if (!adId) {
      const match = url.match(/-(\d+)(?:\?|$)/);
      adId = match ? match[1] : `olx_${Date.now()}`;
    }

    const preco = Number(ad.price || body.price || 0);
    const precoFipe = Number(analysis.fipe_price || ad.fipe_price || body.fipe_price || 0);
    const margemPercent = Number(analysis.margin_percent || ad.margin_percent || body.margin_percent || 0);
    const margemValor = Number(analysis.margin_value || ad.margin_value || body.margin_value || 0);
    const isPriceDrop = Boolean(body.is_price_drop || body.event === 'price_drop');
    const oldPrice = Number(body.old_price || 0);

    const record = {
      ad_id: String(adId),
      url,
      titulo: ad.title || body.title || 'Veículo sem título',
      marca: ad.brand || body.brand || null,
      modelo: ad.model || body.model || null,
      ano: Number(ad.year || body.year || 0) || null,
      km: Number(ad.mileage || body.mileage || 0) || null,
      combustivel: ad.fuel || body.fuel || null,
      cambio: ad.gearbox || body.gearbox || null,
      preco,
      preco_fipe: precoFipe > 0 ? precoFipe : null,
      margem_percent: margemPercent || null,
      margem_valor: margemValor || null,
      localizacao: ad.location || body.location || 'Santa Catarina',
      foto_url: ad.image_url || body.image_url || null,
      publicado_em: ad.published_at || body.published_at || null,
      is_particular: ad.is_particular !== undefined ? Boolean(ad.is_particular) : true,
      has_leilao: Boolean(ad.has_auction || analysis.has_auction),
      status_classificacao: analysis.status || body.status || 'OPORTUNIDADE',
      is_queda_preco: isPriceDrop,
      preco_anterior: oldPrice > 0 ? oldPrice : null,
      avisos: analysis.risk_flags || body.risk_flags || [],
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('compras_olx_oportunidades')
      .upsert(record, { onConflict: 'ad_id' })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      id: data?.id,
      ad_id: adId,
      message: 'Oportunidade OLX sincronizada com sucesso!',
    });
  } catch (err: any) {
    console.error('Erro no webhook de compras OLX:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
