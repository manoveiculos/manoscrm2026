import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { chavePublicaPush, pushConfigurado } from '@/lib/push/enviarPush';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * GET /api/push/inscrever — o celular pergunta se os avisos estão ligados no
 * servidor e pega a chave pública (VAPID) para se inscrever.
 */
export async function GET() {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    return json({ success: true, configurado: pushConfigurado(), chavePublica: chavePublicaPush() });
}

/**
 * POST /api/push/inscrever — guarda a inscrição deste celular para o
 * consultor logado. Body: o PushSubscription.toJSON() do navegador.
 */
export async function POST(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;
    if (!eu.consultorId) return json({ success: false, error: 'Seu login não tem cadastro de consultor.' }, 400);
    if (!pushConfigurado()) return json({ success: false, error: 'Avisos ainda não ligados no servidor.' }, 503);

    let body: any;
    try { body = await req.json(); } catch { body = null; }
    const endpoint = String(body?.endpoint || '');
    const p256dh = String(body?.keys?.p256dh || '');
    const auth = String(body?.keys?.auth || '');
    if (!endpoint.startsWith('https://') || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) {
        return json({ success: false, error: 'Inscrição inválida.' }, 400);
    }

    const { error } = await admin.from('push_inscricoes').upsert({
        consultant_id: eu.consultorId,
        endpoint,
        p256dh,
        auth,
        user_agent: (req.headers.get('user-agent') || '').slice(0, 300) || null,
        ativo: true,
        falhas: 0,
        atualizado_em: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) {
        console.error('[push/inscrever]', error.message);
        return json({ success: false, error: 'Não consegui salvar a inscrição.' }, 500);
    }
    return json({ success: true });
}
