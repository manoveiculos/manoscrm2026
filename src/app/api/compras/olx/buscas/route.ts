import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FLASK_URL = process.env.OLX_BOT_URL || 'http://localhost:5000';

export async function GET(req: NextRequest) {
  const userEmail = req.nextUrl.searchParams.get('user_email')?.trim() || '';

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
      return NextResponse.json({
        success: true,
        searches: data.searches || [],
        active_client: data.active_client || null,
      });
    }
    return NextResponse.json({ success: true, searches: [], active_client: null });
  } catch (err: any) {
    console.error('Erro ao buscar buscas salvas do OLX:', err);
    return NextResponse.json({ success: true, searches: [], active_client: null, offline: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${FLASK_URL}/api/saved-searches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, message: data.message || 'Erro ao criar busca' }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Erro ao salvar busca:', err);
    return NextResponse.json({ success: false, message: 'Robô do Garimpeiro offline no momento.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, message: 'ID da busca é obrigatório' }, { status: 400 });
  }

  try {
    const res = await fetch(`${FLASK_URL}/api/saved-searches/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Erro ao excluir busca:', err);
    return NextResponse.json({ success: false, message: 'Falha ao excluir busca' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, message: 'ID da busca é obrigatório' }, { status: 400 });
  }

  try {
    const res = await fetch(`${FLASK_URL}/api/saved-searches/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Erro ao alternar busca:', err);
    return NextResponse.json({ success: false, message: 'Falha ao alternar busca' }, { status: 500 });
  }
}
