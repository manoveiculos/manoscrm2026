import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const FLASK_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';
const OLX_DIR = 'D:\\OLX EXTRATOR';

export async function GET() {
  try {
    const res = await fetch(`${FLASK_URL}/api/config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ success: true, config: data, engine_online: true });
    }
  } catch {
    // Falha silenciosa de conexão com o robô Flask; tenta ler direto do arquivo .env
  }

  // Fallback: ler do .env do D:\OLX EXTRATOR
  try {
    const envPath = path.join(OLX_DIR, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const cfg: Record<string, any> = {};
      content.split('\n').forEach((line) => {
        const s = line.trim();
        if (s && !s.startsWith('#') && s.includes('=')) {
          const [k, ...v] = s.split('=');
          cfg[k.trim()] = v.join('=').trim();
        }
      });
      return NextResponse.json({
        success: true,
        config: {
          CLIENT_NAME: cfg.CLIENT_NAME || 'Alexandre',
          CLIENT_PHONE: cfg.CLIENT_PHONE || '5547988467855',
          CLIENT_VERIFIED: cfg.CLIENT_VERIFIED === 'True',
          MIN_MARGIN_PERCENT: parseFloat(cfg.MIN_MARGIN_PERCENT || '5.0'),
          MAX_MARGIN_PERCENT: parseFloat(cfg.MAX_MARGIN_PERCENT || '45.0'),
          MIN_PRICE: parseInt(cfg.MIN_PRICE || '10000', 10),
          MAX_PRICE: parseInt(cfg.MAX_PRICE || '250000', 10),
          ONLY_PARTICULAR: cfg.ONLY_PARTICULAR !== 'False',
          IGNORE_AUCTION: cfg.IGNORE_AUCTION !== 'False',
          EXCLUDE_KEYWORDS: cfg.EXCLUDE_KEYWORDS || '',
          REGIONS: cfg.REGIONS || 'estado-sc',
          CHECK_INTERVAL_SECONDS: parseInt(cfg.CHECK_INTERVAL_SECONDS || '60', 10),
        },
        engine_online: false,
      });
    }
  } catch (err: any) {
    console.error('Erro ao ler .env do garimpeiro:', err);
  }

  return NextResponse.json(
    {
      success: true,
      config: {
        CLIENT_NAME: 'Alexandre',
        CLIENT_PHONE: '5547988467855',
        CLIENT_VERIFIED: true,
        MIN_MARGIN_PERCENT: 5.0,
        MAX_MARGIN_PERCENT: 45.0,
        MIN_PRICE: 10000,
        MAX_PRICE: 250000,
        ONLY_PARTICULAR: true,
        IGNORE_AUCTION: true,
        EXCLUDE_KEYWORDS: 'leilao, sinistro, recuperado, sucata, batido',
        REGIONS: 'estado-sc',
        CHECK_INTERVAL_SECONDS: 60,
      },
      engine_online: false,
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Tenta atualizar no Flask
    try {
      const res = await fetch(`${FLASK_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ success: true, message: data.message || 'Configurações salvas!' });
      }
    } catch {
      // Se Flask offline, salvar direto no .env
    }

    // Fallback: atualizar no arquivo .env
    const envPath = path.join(OLX_DIR, '.env');
    let lines: string[] = [];
    if (fs.existsSync(envPath)) {
      lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    }

    const currentEnv: Record<string, string> = {};
    lines.forEach((l) => {
      const s = l.trim();
      if (s && !s.startsWith('#') && s.includes('=')) {
        const [k, ...v] = s.split('=');
        currentEnv[k.trim()] = v.join('=').trim();
      }
    });

    Object.keys(body).forEach((k) => {
      currentEnv[k] = String(body[k]);
    });

    const newContent =
      '# Configurações salvas pelo CRM Manos\n' +
      Object.entries(currentEnv)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') +
      '\n';

    fs.writeFileSync(envPath, newContent, 'utf-8');

    return NextResponse.json({
      success: true,
      message: 'Configurações gravadas com sucesso no arquivo do Garimpeiro!',
    });
  } catch (err: any) {
    console.error('Erro ao salvar config do garimpeiro:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
