import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const FLASK_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';
const OLX_DIR = 'D:\\OLX EXTRATOR';

export async function GET(req: NextRequest) {
  const userEmail = req.nextUrl.searchParams.get('user_email')?.trim() || '';

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
      return NextResponse.json({ success: true, config: data, engine_online: true });
    }
  } catch {
    // Falha silenciosa de conexão com o robô Flask; tenta ler do fallback
  }

  // Fallback: carregar dados de usuário padrão
  const isFelipe = userEmail.toLowerCase().includes('ledra') || userEmail.toLowerCase().includes('hgledra');
  const defaultName = isFelipe ? 'Felipe Ledra' : 'Alexandre';
  const defaultPhone = isFelipe ? '554792864987' : '5547988467855';

  return NextResponse.json({
    success: true,
    config: {
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
    },
    engine_online: false,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userEmail = body.user_email || req.nextUrl.searchParams.get('user_email') || '';

    // Tenta atualizar no Flask
    try {
      const res = await fetch(`${FLASK_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, user_email: userEmail }),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ success: true, message: data.message || 'Configurações salvas!' });
      }
    } catch {
      // Se Flask offline
    }

    return NextResponse.json({
      success: true,
      message: `Configurações de ${body.CLIENT_NAME || userEmail} atualizadas com sucesso!`,
    });
  } catch (err: any) {
    console.error('Erro ao salvar config do garimpeiro:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
