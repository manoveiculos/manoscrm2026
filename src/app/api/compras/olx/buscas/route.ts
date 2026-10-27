import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const FLASK_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';

function getSearchKey(email: string) {
  const clean = (email || '').trim().toLowerCase();
  if (clean.includes('ledra') || clean.includes('hgledra')) return 'olx_searches_felipe_ledra';
  if (clean.includes('alexandre')) return 'olx_searches_alexandre';
  return clean ? `olx_searches_${clean.replace(/[^a-z0-9]/g, '_')}` : 'olx_searches_default';
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const userEmail = req.nextUrl.searchParams.get('user_email')?.trim() || '';
  const searchKey = getSearchKey(userEmail);

  let searches: any[] = [];
  let loadedFromSupabase = false;

  // 1. Tenta carregar do Supabase app_settings (funciona offline e em produção)
  try {
    const { data: row } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', searchKey)
      .maybeSingle();

    if (row?.value) {
      searches = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (Array.isArray(searches)) {
        loadedFromSupabase = true;
      } else {
        searches = [];
      }
    }
  } catch (err) {
    console.warn('Aviso ao consultar buscas salvas no Supabase:', err);
  }

  // 2. Se não encontrou no Supabase, tenta carregar do Flask local
  if (!loadedFromSupabase || searches.length === 0) {
    try {
      const url = userEmail
        ? `${FLASK_URL}/api/saved-searches?user_email=${encodeURIComponent(userEmail)}`
        : `${FLASK_URL}/api/saved-searches`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        const flaskSearches = data.searches || [];
        if (flaskSearches.length > 0) {
          searches = flaskSearches;
          // Sincroniza retroativamente no Supabase
          await supabase.from('app_settings').upsert({
            key: searchKey,
            value: JSON.stringify(flaskSearches),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' }).catch(() => {});
        }
      }
    } catch {
      // Flask offline
    }
  }

  return NextResponse.json({
    success: true,
    searches: Array.isArray(searches) ? searches : [],
    active_client: null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = await req.json();
    const userEmail = body.user_email || req.nextUrl.searchParams.get('user_email') || '';
    const searchKey = getSearchKey(userEmail);

    // 1. Carrega buscas existentes do Supabase
    let existingSearches: any[] = [];
    try {
      const { data: row } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', searchKey)
        .maybeSingle();

      if (row?.value) {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        if (Array.isArray(parsed)) existingSearches = parsed;
      }
    } catch (e) {
      console.warn('Erro ao ler buscas no Supabase antes de inserir:', e);
    }

    const isFelipe = userEmail.toLowerCase().includes('ledra') || userEmail.toLowerCase().includes('hgledra');
    const defaultName = isFelipe ? 'Felipe Ledra' : 'Alexandre';
    const defaultPhone = isFelipe ? '554792864987' : '5547988467855';

    let searchId = Date.now();

    // 2. Tenta enviar para o Flask se estiver online
    try {
      const res = await fetch(`${FLASK_URL}/api/saved-searches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, user_email: userEmail }),
      });
      if (res.ok) {
        const flaskData = await res.json();
        if (flaskData.id) searchId = flaskData.id;
      }
    } catch {
      // Flask offline, grava no Supabase mesmo assim!
    }

    const newSearch = {
      id: searchId,
      client_name: body.client_name || defaultName,
      client_phone: body.client_phone || defaultPhone,
      title: body.title || null,
      keywords: body.keywords || null,
      min_year: body.min_year ? Number(body.min_year) : null,
      max_year: body.max_year ? Number(body.max_year) : null,
      max_mileage: body.max_mileage ? Number(body.max_mileage) : null,
      min_price: body.min_price ? Number(body.min_price) : null,
      max_price: body.max_price ? Number(body.max_price) : null,
      min_margin: body.min_margin ? Number(body.min_margin) : null,
      only_particular: Boolean(body.only_particular),
      active: true,
      user_email: userEmail,
      created_at: new Date().toISOString(),
    };

    const updatedList = [newSearch, ...existingSearches];

    // 3. Grava no Supabase (permanente mesmo offline)
    await supabase
      .from('app_settings')
      .upsert({
        key: searchKey,
        value: JSON.stringify(updatedList),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    return NextResponse.json({
      success: true,
      id: newSearch.id,
      message: 'Busca personalizada salva com sucesso no sistema!',
      search: newSearch,
    });
  } catch (err: any) {
    console.error('Erro ao salvar busca:', err);
    return NextResponse.json({ success: false, message: err?.message || 'Falha ao salvar busca' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const userEmail = url.searchParams.get('user_email') || '';
  const searchKey = getSearchKey(userEmail);

  if (!id) {
    return NextResponse.json({ success: false, message: 'ID da busca é obrigatório' }, { status: 400 });
  }

  // 1. Remove do Supabase
  try {
    const { data: row } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', searchKey)
      .maybeSingle();

    if (row?.value) {
      let list = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (Array.isArray(list)) {
        list = list.filter((item: any) => String(item.id) !== String(id));
        await supabase
          .from('app_settings')
          .upsert({
            key: searchKey,
            value: JSON.stringify(list),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });
      }
    }
  } catch (e) {
    console.error('Erro ao remover busca no Supabase:', e);
  }

  // 2. Tenta remover do Flask se estiver online
  try {
    await fetch(`${FLASK_URL}/api/saved-searches/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Ignora se Flask offline
  }

  return NextResponse.json({ success: true, message: 'Busca removida com sucesso!' });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const userEmail = url.searchParams.get('user_email') || '';
  const searchKey = getSearchKey(userEmail);

  if (!id) {
    return NextResponse.json({ success: false, message: 'ID da busca é obrigatório' }, { status: 400 });
  }

  let newActiveState = true;

  // 1. Alterna estado no Supabase
  try {
    const { data: row } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', searchKey)
      .maybeSingle();

    if (row?.value) {
      let list = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (Array.isArray(list)) {
        list = list.map((item: any) => {
          if (String(item.id) === String(id)) {
            newActiveState = !Boolean(item.active);
            return { ...item, active: newActiveState };
          }
          return item;
        });
        await supabase
          .from('app_settings')
          .upsert({
            key: searchKey,
            value: JSON.stringify(list),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });
      }
    }
  } catch (e) {
    console.error('Erro ao alternar busca no Supabase:', e);
  }

  // 2. Tenta alternar no Flask se estiver online
  try {
    await fetch(`${FLASK_URL}/api/saved-searches/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Ignora se Flask offline
  }

  return NextResponse.json({ success: true, active: newActiveState, message: 'Status da busca alternado com sucesso!' });
}
