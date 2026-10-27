import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const FLASK_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';

function parseNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^\d.,-]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);

  const adId = url.searchParams.get('id')?.trim() || '';
  const adUrl = url.searchParams.get('url')?.trim() || '';

  if (!adId) {
    return NextResponse.json({ success: false, error: 'ID do anúncio é obrigatório' }, { status: 400 });
  }

  // 1. TENTA OBTER DETALHES COMPLETOS E FIPE NATIVA DA OLX VIA FLASK / AD-DETAILS
  try {
    const flaskRes = await fetch(`${FLASK_URL}/api/ad-details/${adId}`, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });

    if (flaskRes.ok) {
      const data = await flaskRes.json();
      if (data.success) {
        const ad = data.ad || {};
        const olxFipe = parseNumber(data.fipe_price);
        const preco = parseNumber(ad.price) || 0;
        let margemVal = parseNumber(ad.margin_value);
        let margemPct = parseNumber(ad.margin_percent);

        if (olxFipe && olxFipe > 0 && preco > 0) {
          margemVal = Math.round((olxFipe - preco) * 100) / 100;
          margemPct = Math.round(((olxFipe - preco) / olxFipe) * 1000) / 10;
        }

        // Sincroniza em segundo plano no Supabase com a FIPE nativa da OLX
        if (olxFipe && olxFipe > 0) {
          try {
            await supabase
              .from('compras_olx_oportunidades')
              .update({
                preco_fipe: olxFipe,
                margem_percent: margemPct,
                margem_valor: margemVal,
                updated_at: new Date().toISOString(),
              })
              .eq('ad_id', adId);
          } catch {
            // Ignora erro de sync no Supabase
          }
        }

        return NextResponse.json({
          success: true,
          ad_id: adId,
          fipe_price: olxFipe,
          margin_percent: margemPct,
          margin_value: margemVal,
          olx_avg_price: parseNumber(data.olx_avg_price),
          images: data.images || [],
          description: data.description || '',
          source: 'olx_native',
        });
      }
    }
  } catch (err) {
    console.warn('[Ad Details] Falha ao consultar Flask:', err);
  }

  // 2. FALLBACK SE FLASK ESTIVER OFFLINE (Consulta direta na página da OLX)
  if (adUrl && adUrl.startsWith('http')) {
    try {
      const pageRes = await fetch(adUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://www.olx.com.br/',
        },
        cache: 'no-store',
      });

      if (pageRes.ok) {
        const html = await pageRes.text();
        let olxFipe: number | null = null;
        let olxAvg: number | null = null;

        // Prioridade 1: Extrai chave "abuyFipePrice" do __ADVIEW_STATE__
        const fipeMatch = html.match(/"abuyFipePrice":\s*\{\s*"fipePrice":\s*(\d+(?:\.\d+)?)/);
        if (fipeMatch && fipeMatch[1]) {
          olxFipe = parseFloat(fipeMatch[1]);
        }

        const avgMatch = html.match(/"abuyPriceRef":\s*\{[^}]*"price_p50":\s*(\d+(?:\.\d+)?)/);
        if (avgMatch && avgMatch[1]) {
          olxAvg = parseFloat(avgMatch[1]);
        }

        // Extrai imagens em alta resolução
        const imgMatches = Array.from(new Set(html.match(/https:\/\/img\.olx\.com\.br\/images\/\d+\/\d+\.jpg/g) || []));

        if (olxFipe && olxFipe > 0) {
          try {
            await supabase
              .from('compras_olx_oportunidades')
              .update({
                preco_fipe: olxFipe,
                updated_at: new Date().toISOString(),
              })
              .eq('ad_id', adId);
          } catch {
            // Ignora erro
          }
        }

        return NextResponse.json({
          success: true,
          ad_id: adId,
          fipe_price: olxFipe,
          olx_avg_price: olxAvg,
          images: imgMatches,
          description: '',
          source: 'olx_direct_html',
        });
      }
    } catch (e) {
      console.warn('[Ad Details] Falha ao raspar HTML direto da OLX:', e);
    }
  }

  // 3. Fallback simples do Supabase
  try {
    const { data: row } = await supabase
      .from('compras_olx_oportunidades')
      .select('preco_fipe, margem_percent, margem_valor, foto_url')
      .eq('ad_id', adId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      ad_id: adId,
      fipe_price: row?.preco_fipe ? Number(row.preco_fipe) : null,
      margin_percent: row?.margem_percent ? Number(row.margem_percent) : null,
      margin_value: row?.margem_valor ? Number(row.margem_valor) : null,
      images: row?.foto_url ? [row.foto_url] : [],
      description: '',
      source: 'supabase_cache',
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Não foi possível carregar os detalhes' }, { status: 500 });
  }
}
