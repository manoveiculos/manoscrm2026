import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const FLASK_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';

function getSettingKey(email: string) {
  const clean = (email || '').trim().toLowerCase();
  if (clean.includes('ledra') || clean.includes('hgledra')) return 'olx_config_felipe_ledra';
  if (clean.includes('alexandre')) return 'olx_config_alexandre';
  return clean ? `olx_config_${clean.replace(/[^a-z0-9]/g, '_')}` : 'olx_config_default';
}

function getDefaultConfig(userEmail: string) {
  const isFelipe = userEmail.toLowerCase().includes('ledra') || userEmail.toLowerCase().includes('hgledra');
  const defaultName = isFelipe ? 'Felipe Ledra' : 'Alexandre';
  const defaultPhone = isFelipe ? '554792864987' : '5547988467855';

  return {
    CLIENT_NAME: defaultName,
    CLIENT_PHONE: defaultPhone,
    CLIENT_VERIFIED: true,
    MIN_MARGIN_PERCENT: 5.0,
    MAX_MARGIN_PERCENT: 45.0,
    MIN_PRICE: 10000,
    MAX_PRICE: 250000,
    ONLY_PARTICULAR: true,
    IGNORE_AUCTION: true,
    EXCLUDE_KEYWORDS: 'leilao, sinistro, recuperado, sucata, batido, bloqueio, alienado',
    REGIONS: 'estado-sc',
    CHECK_INTERVAL_SECONDS: 60,
    USER_EMAIL: userEmail,
  };
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const userEmail = req.nextUrl.searchParams.get('user_email')?.trim() || '';
  const settingKey = getSettingKey(userEmail);

  // 1. Prioriza leitura das configurações salvas no Supabase (funciona em produção e offline)
  let savedConfig: any = null;
  try {
    const { data: row } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', settingKey)
      .maybeSingle();

    if (row?.value) {
      savedConfig = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    }
  } catch (err) {
    console.warn('Aviso ao consultar app_settings no Supabase:', err);
  }

  // 2. Se não estiver no Supabase, tenta carregar do Flask
  if (!savedConfig) {
    try {
      const url = userEmail
        ? `${FLASK_URL}/api/config?user_email=${encodeURIComponent(userEmail)}`
        : `${FLASK_URL}/api/config`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        savedConfig = data;
      }
    } catch {
      // Flask offline
    }
  }

  // 3. Fallback com dados padrão para o usuário
  const finalConfig = savedConfig || getDefaultConfig(userEmail);

  // Garante que o e-mail do usuário está preservado
  if (userEmail && !finalConfig.USER_EMAIL) {
    finalConfig.USER_EMAIL = userEmail;
  }

  return NextResponse.json({
    success: true,
    config: finalConfig,
    persisted: Boolean(savedConfig),
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = await req.json();
    const userEmail = body.user_email || body.USER_EMAIL || req.nextUrl.searchParams.get('user_email') || '';
    const settingKey = getSettingKey(userEmail);

    const configToSave = {
      CLIENT_NAME: body.CLIENT_NAME || '',
      CLIENT_PHONE: body.CLIENT_PHONE || '',
      CLIENT_VERIFIED: Boolean(body.CLIENT_VERIFIED ?? true),
      MIN_MARGIN_PERCENT: Number(body.MIN_MARGIN_PERCENT ?? 5.0),
      MAX_MARGIN_PERCENT: Number(body.MAX_MARGIN_PERCENT ?? 45.0),
      MIN_PRICE: Number(body.MIN_PRICE ?? 10000),
      MAX_PRICE: Number(body.MAX_PRICE ?? 250000),
      ONLY_PARTICULAR: Boolean(body.ONLY_PARTICULAR),
      IGNORE_AUCTION: Boolean(body.IGNORE_AUCTION),
      EXCLUDE_KEYWORDS: body.EXCLUDE_KEYWORDS || '',
      REGIONS: body.REGIONS || 'estado-sc',
      CHECK_INTERVAL_SECONDS: Number(body.CHECK_INTERVAL_SECONDS ?? 60),
      USER_EMAIL: userEmail,
      updated_at: new Date().toISOString(),
    };

    // 1. Salva permanentemente no Supabase (app_settings)
    const { error: sbError } = await supabase
      .from('app_settings')
      .upsert({
        key: settingKey,
        value: JSON.stringify(configToSave),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (sbError) {
      console.error('Erro ao salvar no Supabase app_settings:', sbError);
    }

    // 2. Tenta sincronizar com o robô Flask se estiver online
    try {
      await fetch(`${FLASK_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...configToSave, user_email: userEmail }),
      });
    } catch {
      // Ignora se Flask offline
    }

    return NextResponse.json({
      success: true,
      message: `Configurações de ${configToSave.CLIENT_NAME || userEmail} salvas com sucesso no sistema!`,
      config: configToSave,
    });
  } catch (err: any) {
    console.error('Erro ao salvar config do garimpeiro:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
